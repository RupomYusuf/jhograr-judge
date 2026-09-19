import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAIProvider } from "@/lib/ai";
import {
  AuthError,
  jparse,
  maybeBuildAgreement,
  maybeBuildResolutions,
  maybeFinalizeAgreementVote,
  ownMessages,
  refreshSharedStage,
  requireParticipant,
  tokenHash,
} from "@/lib/session";
import type { ChatTurn, IntakeCtx } from "@/lib/types";

// All session mutations flow through one authenticated endpoint with a
// discriminated action union — one place for auth, safety screening, and
// state-machine transitions.

const SAFETY_COPY = `This may not be a normal disagreement.

Some situations aren't appropriate for mutual mediation — including ones involving threats, control, or fear. You don't have to continue this session, and nothing you told me will be shared with the other person.

If you're in immediate danger, please contact your local emergency number. If you can, reach someone you trust — you don't have to handle this alone.`;

const schema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("chat"), content: z.string().min(1).max(4000) }),
  z.object({ type: z.literal("confirm"), verdict: z.enum(["yes", "fix"]), text: z.string().max(2000).optional() }),
  z.object({
    type: z.literal("predict"),
    upsetAbout: z.string().min(1).max(1000),
    wantedFromYou: z.string().min(1).max(1000),
    theirFeeling: z.string().min(1).max(1000),
  }),
  z.object({ type: z.literal("map_feedback"), verdict: z.enum(["yes", "almost", "no"]), note: z.string().max(1000).optional() }),
  z.object({ type: z.literal("vote"), optionId: z.string().min(1), stance: z.enum(["works", "changes", "no"]), note: z.string().max(500).optional() }),
  z.object({ type: z.literal("constraints"), text: z.string().min(1).max(1000) }),
  z.object({ type: z.literal("agreement_verdict"), verdict: z.enum(["agree", "change", "notready"]), note: z.string().max(1000).optional() }),
  z.object({ type: z.literal("outcome"), path: z.enum(["retry", "agree_disagree", "space", "support"]) }),
  z.object({ type: z.literal("followup"), result: z.enum(["held", "mostly", "failed", "untested"]), reason: z.string().max(300).optional() }),
  z.object({ type: z.literal("rename"), title: z.string().min(1).max(80) }),
]);

// Naive in-memory rate limiter (per-instance; swap for Redis in production).
const buckets = new Map<string, number[]>();
function rateLimited(key: string, max = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  hits.push(now);
  buckets.set(key, hits);
  return hits.length > max;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  const action = parsed.data;

  try {
    const participant = await requireParticipant(code, req.headers.get("x-participant-token"));
    const session = participant.session;

    if (rateLimited(tokenHash(participant.token))) {
      return NextResponse.json({ error: "Too many requests — take a breath." }, { status: 429 });
    }

    const ctx = {
      relationship: session.relationship as IntakeCtx["relationship"],
      side: participant.side as "A" | "B",
      title: session.title,
    };

    switch (action.type) {
      case "chat": {
        if (participant.stage !== "chat") {
          return NextResponse.json({ error: "Not in chat stage" }, { status: 409 });
        }

        await prisma.message.create({
          data: {
            sessionId: session.id,
            participantId: participant.id,
            role: "user",
            content: action.content,
          },
        });

        // Safety screening on every message — before anything else.
        const safety = getAIProvider().safetyScreen(action.content);
        if (safety.flagged) {
          await prisma.participant.update({
            where: { id: participant.id },
            data: { safetyFlag: true, stage: "safe_exit" },
          });
          await prisma.session.update({
            where: { id: session.id },
            data: { status: "safety", tone: "serious" },
          });
          await prisma.message.create({
            data: {
              sessionId: session.id,
              participantId: participant.id,
              role: "judge",
              content: SAFETY_COPY,
            },
          });
          await refreshSharedStage(session.id);
          return NextResponse.json({ ok: true, safety: true });
        }

        const history: ChatTurn[] = ownMessages(
          await prisma.message.findMany({
            where: { participantId: participant.id },
            orderBy: { createdAt: "asc" },
          }),
        );
        // The last message is the one just sent; drop it from history for reply().
        const prior = history.slice(0, -1);

        const provider = getAIProvider();
        const reply =
          session.mode === "solo"
            ? await provider.reflectSolo(prior, action.content)
            : await provider.reply(ctx, prior, action.content);

        if (reply.done) {
          const draft = await provider.draftPerspective(ctx, prior.concat({ role: "user", content: action.content }));
          await prisma.participant.update({
            where: { id: participant.id },
            data: { stage: "confirm", perspective: JSON.stringify(draft) },
          });
        }

        await prisma.message.create({
          data: {
            sessionId: session.id,
            participantId: participant.id,
            role: "judge",
            content: reply.message,
            chips: reply.chips ? JSON.stringify(reply.chips) : null,
          },
        });

        if (session.mode === "solo" && reply.done) {
          const summary = await provider.draftSoloSummary(prior.concat({ role: "user", content: action.content }));
          // Solo summary rides in the (unused-for-solo) predictions column.
          await prisma.participant.update({
            where: { id: participant.id },
            data: { predictions: JSON.stringify(summary) },
          });
        }

        return NextResponse.json({ ok: true });
      }

      case "confirm": {
        if (participant.stage !== "confirm") {
          return NextResponse.json({ error: "Nothing to confirm" }, { status: 409 });
        }
        const draft = jparse<Record<string, unknown> | null>(participant.perspective, null);
        if (!draft) return NextResponse.json({ error: "No draft" }, { status: 409 });

        if (action.verdict === "fix" && action.text) {
          const provider = getAIProvider();
          const corrected = await provider.applyCorrection(draft as never, action.text);
          await prisma.participant.update({
            where: { id: participant.id },
            data: { perspective: JSON.stringify(corrected) },
          });
          await prisma.message.create({
            data: {
              sessionId: session.id,
              participantId: participant.id,
              role: "judge",
              content: "Updated. Read it again — good now?",
            },
          });
          return NextResponse.json({ ok: true, corrected: true });
        }

        if (session.mode === "solo") {
          await prisma.participant.update({
            where: { id: participant.id },
            data: { stage: "done" },
          });
          await prisma.session.update({ where: { id: session.id }, data: { status: "closed" } });
          return NextResponse.json({ ok: true, soloDone: true });
        }

        await prisma.participant.update({
          where: { id: participant.id },
          data: { stage: "predict" },
        });
        return NextResponse.json({ ok: true });
      }

      case "predict": {
        if (participant.stage !== "predict") {
          return NextResponse.json({ error: "Not expecting predictions" }, { status: 409 });
        }
        await prisma.participant.update({
          where: { id: participant.id },
          data: {
            stage: "done",
            predictions: JSON.stringify({
              upsetAbout: action.upsetAbout,
              wantedFromYou: action.wantedFromYou,
              theirFeeling: action.theirFeeling,
            }),
          },
        });
        await refreshSharedStage(session.id);
        return NextResponse.json({ ok: true });
      }

      case "map_feedback": {
        if (session.status !== "map") {
          return NextResponse.json({ error: "No map yet" }, { status: 409 });
        }
        const fb = jparse<Record<string, string>>(session.mapFeedback, {});
        fb[participant.side] = action.verdict;
        if (action.note) fb[`${participant.side}_note`] = action.note;
        await prisma.session.update({
          where: { id: session.id },
          data: { mapFeedback: JSON.stringify(fb) },
        });
        await maybeBuildResolutions(session.id);
        return NextResponse.json({ ok: true });
      }

      case "vote": {
        if (session.status !== "resolution") {
          return NextResponse.json({ error: "Not in resolution" }, { status: 409 });
        }
        const options = jparse<{ id: string }[]>(session.resolutions, []);
        if (!options.some((o) => o.id === action.optionId)) {
          return NextResponse.json({ error: "Unknown option" }, { status: 400 });
        }
        const votes = jparse<Record<string, unknown>>(session.votes, {});
        votes[participant.side] = { optionId: action.optionId, stance: action.stance, note: action.note };
        await prisma.session.update({
          where: { id: session.id },
          data: { votes: JSON.stringify(votes) },
        });
        await maybeBuildAgreement(session.id);
        return NextResponse.json({ ok: true });
      }

      case "constraints": {
        if (session.status !== "resolution") {
          return NextResponse.json({ error: "Not in resolution" }, { status: 409 });
        }
        const fb = jparse<Record<string, unknown>>(session.mapFeedback, {});
        fb.noOverlap = false;
        fb.constraints = action.text;
        await prisma.session.update({
          where: { id: session.id },
          data: { mapFeedback: JSON.stringify(fb) },
        });
        // Rebuild options with the constraint applied, then wait for fresh votes.
        await maybeBuildResolutionsWithConstraints(session.id, action.text);
        return NextResponse.json({ ok: true });
      }

      case "agreement_verdict": {
        if (session.status !== "agreement") {
          return NextResponse.json({ error: "No agreement to vote on" }, { status: 409 });
        }
        const votes = jparse<Record<string, unknown>>(session.agreementVotes, {});
        votes[participant.side] = { verdict: action.verdict, note: action.note };
        await prisma.session.update({
          where: { id: session.id },
          data: { agreementVotes: JSON.stringify(votes) },
        });
        await maybeFinalizeAgreementVote(session.id);
        return NextResponse.json({ ok: true });
      }

      case "outcome": {
        if (action.path === "retry") {
          await prisma.session.update({
            where: { id: session.id },
            data: { status: "resolution", votes: "{}", mapFeedback: "{}" },
          });
        } else {
          await prisma.session.update({
            where: { id: session.id },
            data: {
              status: "closed",
              followUp: JSON.stringify({
                result: "untested",
                reason: action.path,
                at: new Date().toISOString(),
              }),
            },
          });
        }
        return NextResponse.json({ ok: true });
      }

      case "followup": {
        await prisma.session.update({
          where: { id: session.id },
          data: {
            followUp: JSON.stringify({
              result: action.result,
              reason: action.reason,
              at: new Date().toISOString(),
            }),
            status: "closed",
          },
        });
        return NextResponse.json({ ok: true });
      }

      case "rename": {
        await prisma.session.update({
          where: { id: session.id },
          data: { title: action.title },
        });
        return NextResponse.json({ ok: true });
      }
    }

    return NextResponse.json({ error: "Unhandled action" }, { status: 400 });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    console.error("action error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

async function maybeBuildResolutionsWithConstraints(sessionId: string, constraints: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { participants: true },
  });
  if (!session) return;
  const provider = getAIProvider();
  const map = jparse(session.map, null as never);
  if (!map) return;
  const parts = session.participants;
  const a = jparse(parts.find((p) => p.side === "A")?.perspective, null as never);
  const b = jparse(parts.find((p) => p.side === "B")?.perspective, a);
  const options = await provider.buildResolutions(
    { relationship: session.relationship as IntakeCtx["relationship"], side: "A" as const, title: session.title },
    a,
    b ?? a,
    map,
    constraints,
  );
  await prisma.session.update({
    where: { id: sessionId },
    data: { resolutions: JSON.stringify(options), votes: "{}" },
  });
}
