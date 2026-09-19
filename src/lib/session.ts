import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { getAIProvider } from "@/lib/ai";
import type { IntakeCtx,
  Agreement,
  ChatTurn,
  ConflictMap,
  FollowUpResult,
  ResolutionOption,
  Stance,
  StructuredPerspective,
} from "@/lib/types";

// ---------- Codes & tokens ----------

const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function generateSessionCode(): string {
  const bytes = randomBytes(4);
  let s = "";
  for (let i = 0; i < 4; i++) s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return `JJ-${s}`;
}

export function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Deterministic per-session token hash used for rate-limit bucketing only. */
export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

// ---------- JSON column helpers ----------

export function jparse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ---------- Auth ----------

export class AuthError extends Error {}

export async function requireParticipant(code: string, token: string | null) {
  if (!token) throw new AuthError("Missing participant token");
  const participant = await prisma.participant.findUnique({
    where: { token },
    include: { session: true },
  });
  if (!participant || participant.session.code !== code.toUpperCase()) {
    throw new AuthError("Invalid session or token");
  }
  return participant;
}

// ---------- State machine helpers ----------

export async function refreshSharedStage(sessionId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { participants: true },
  });
  if (!session) return;

  if (session.participants.some((p) => p.safetyFlag)) {
    await prisma.session.update({
      where: { id: sessionId },
      data: { status: "safety" },
    });
    return;
  }

  if (session.mode !== "pair") return;

  const all = session.participants;
  if (all.length < 2) {
    if (session.status === "intake") return; // A chats while waiting for B
    return;
  }
  const allDone =
    all.length === 2 &&
    all.every((p) => p.stage === "done") &&
    all.every((p) => p.perspective);

  if (allDone && ["waiting", "intake"].includes(session.status)) {
    const provider = getAIProvider();
    const a = jparse<StructuredPerspective>(all.find((p) => p.side === "A")!.perspective, null as never);
    const b = jparse<StructuredPerspective>(all.find((p) => p.side === "B")!.perspective, null as never);
    if (a && b) {
      const ctx = { relationship: session.relationship as IntakeCtx["relationship"], side: "A" as const, title: session.title };
      const map = await provider.buildMap(ctx, a, b);
      await prisma.session.update({
        where: { id: sessionId },
        data: { status: "map", map: JSON.stringify(map) },
      });
    }
  }
}

export async function maybeBuildResolutions(sessionId: string) {
  const session = await prisma.session.findUnique({ where: { id: sessionId }, include: { participants: true } });
  if (!session || session.status !== "map") return;
  const fb = jparse<Record<string, string>>(session.mapFeedback, {});
  const sides = session.participants.map((p) => p.side);
  if (!sides.every((s) => fb[s])) return;

  // One correction round is allowed; after that we proceed regardless.
  const needsRebuild = sides.some((s) => fb[s] !== "yes");
  const map = jparse<ConflictMap>(session.map, null as never);
  if (!map) return;

  if (needsRebuild && (map.rebuilt ?? 0) < 1) {
    const provider = getAIProvider();
    const parts = session.participants;
    const ctx = { relationship: session.relationship as IntakeCtx["relationship"], side: "A" as const, title: session.title };
    const corrected = await Promise.all(
      parts.map(async (p) => {
        const persp = jparse<StructuredPerspective>(p.perspective, null as never);
        if (!persp) return persp;
        const note = fb[p.side] === "almost" || fb[p.side] === "no" ? fb[`${p.side}_note`] : undefined;
        return note ? await provider.applyCorrection(persp, note) : persp;
      }),
    );
    const rebuilt = await provider.buildMap(ctx, corrected[0], corrected[1] ?? corrected[0]);
    rebuilt.rebuilt = 1;
    await prisma.session.update({
      where: { id: sessionId },
      data: { map: JSON.stringify(rebuilt), mapFeedback: "{}" },
    });
    return; // wait for second confirmation round
  }

  const provider = getAIProvider();
  const parts = session.participants;
  const ctx = { relationship: session.relationship as IntakeCtx["relationship"], side: "A" as const, title: session.title };
  const a = jparse<StructuredPerspective>(parts.find((p) => p.side === "A")?.perspective, null as never);
  const b = jparse<StructuredPerspective>(parts.find((p) => p.side === "B")?.perspective, a);
  const constraints = fb.constraints as string | undefined;
  const options = await provider.buildResolutions(ctx, a, b ?? a, map, constraints);
  await prisma.session.update({
    where: { id: sessionId },
    data: { status: "resolution", resolutions: JSON.stringify(options) },
  });
}

export async function maybeBuildAgreement(sessionId: string) {
  const session = await prisma.session.findUnique({ where: { id: sessionId }, include: { participants: true } });
  if (!session || session.status !== "resolution") return;
  const votes = jparse<Record<string, { optionId: string; stance: Stance }>>(session.votes, {});
  const sides = session.participants.map((p) => p.side);
  if (!sides.every((s) => votes[s])) return;

  const va = votes.A;
  const vb = votes.B;
  const sameOption = va.optionId === vb.optionId;
  const acceptable = (v: { stance: Stance }) => v.stance === "works" || v.stance === "changes";

  if (sameOption && acceptable(va) && acceptable(vb)) {
    const options = jparse<ResolutionOption[]>(session.resolutions, []);
    const option = options.find((o) => o.id === va.optionId);
    const map = jparse<ConflictMap>(session.map, null as never);
    if (option && map) {
      const provider = getAIProvider();
      const agreement = await provider.draftAgreement(
        { relationship: session.relationship as IntakeCtx["relationship"], side: "A" as const, title: session.title },
        option,
        map,
      );
      await prisma.session.update({
        where: { id: sessionId },
        data: { status: "agreement", agreement: JSON.stringify(agreement), agreementVotes: "{}" },
      });
      return;
    }
  }

  // No overlap — reset votes and ask for constraints.
  await prisma.session.update({
    where: { id: sessionId },
    data: { votes: "{}", mapFeedback: JSON.stringify({ noOverlap: true }) },
  });
}

export async function maybeFinalizeAgreementVote(sessionId: string) {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session || session.status !== "agreement") return;
  const votes = jparse<Record<string, { verdict: string; note?: string }>>(session.agreementVotes, {});
  if (!votes.A || !votes.B) return;
  if (votes.A.verdict === "agree" && votes.B.verdict === "agree") {
    await prisma.session.update({
      where: { id: sessionId },
      data: { status: "followup" },
    });
  } else if (votes.A.verdict === "change" || votes.B.verdict === "change") {
    const notes = [votes.A.note, votes.B.note].filter(Boolean).join(" / ");
    const agreement = jparse<Agreement>(session.agreement, null as never);
    if (agreement) {
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          agreement: JSON.stringify({
            ...agreement,
            figuredOut: `${agreement.figuredOut}\n\nAdjustments requested: ${notes}`,
          }),
          agreementVotes: "{}",
        },
      });
    }
  } else {
    // Either chose "not ready" — no agreement is a valid outcome.
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        status: "closed",
        followUp: JSON.stringify({
          result: "untested",
          reason: "no_agreement_chosen",
          at: new Date().toISOString(),
        } satisfies FollowUpResult),
      },
    });
  }
}

// ---------- Shared projections (privacy boundary) ----------

export function safeTitle(session: { title: string; code: string }): string {
  return session.title?.trim() || session.code;
}

export function ownMessages(messages: { role: string; content: string; chips: string | null; createdAt: Date }[]): ChatTurn[] {
  return messages.map((m) => ({
    role: m.role as "user" | "judge",
    content: m.content,
    chips: m.chips ? jparse<string[]>(m.chips, []) : undefined,
  }));
}
