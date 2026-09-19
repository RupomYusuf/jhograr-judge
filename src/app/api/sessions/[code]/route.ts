import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  AuthError,
  jparse,
  ownMessages,
  requireParticipant,
} from "@/lib/session";
import type {
  Agreement,
  ConflictMap,
  FollowUpResult,
  PerspectivePrediction,
  ResolutionOption,
  Stance,
  StructuredPerspective,
} from "@/lib/types";

// GET — the single authenticated projection for one participant.
// PRIVACY: only this participant's messages/perspective are ever included.
// The partner's stage is reduced to a boolean so neither side can infer
// the other's private answers from the projection.

export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  try {
    const participant = await requireParticipant(code, req.headers.get("x-participant-token"));
    const session = participant.session;

    const partner = await prisma.participant.findFirst({
      where: { sessionId: session.id, side: participant.side === "A" ? "B" : "A" },
    });

    const messages = await prisma.message.findMany({
      where: { participantId: participant.id },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      session: {
        code: session.code,
        title: session.title || session.code,
        relationship: session.relationship,
        mode: session.mode,
        status: session.status,
        tone: session.tone,
        createdAt: session.createdAt,
      },
      me: {
        side: participant.side,
        stage: participant.stage,
        displayName: participant.displayName,
        safetyFlag: participant.safetyFlag,
        perspective: jparse<StructuredPerspective | null>(participant.perspective, null),
        predictions: jparse<PerspectivePrediction | null>(participant.predictions, null),
        soloSummary:
          session.mode === "solo"
            ? jparse(participant.predictions, null)
            : null,
      },
      partnerJoined: Boolean(partner),
      partnerStage: partner ? (partner.stage === "done" ? "done" : "working") : null,
      partnerSafety: partner ? partner.safetyFlag : false,
      messages: ownMessages(messages),
      map: jparse<ConflictMap | null>(session.map, null),
      mapFeedback: jparse<Record<string, string>>(session.mapFeedback, {}),
      resolutions: jparse<ResolutionOption[]>(session.resolutions, []),
      votes: jparse<Record<string, { optionId: string; stance: Stance }>>(session.votes, {}),
      noOverlap: jparse<{ noOverlap?: boolean }>(session.mapFeedback, {}).noOverlap === true,
      agreement: jparse<Agreement | null>(session.agreement, null),
      agreementVotes: jparse<Record<string, { verdict: string; note?: string }>>(session.agreementVotes, {}),
      followUp: jparse<FollowUpResult | null>(session.followUp, null),
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    console.error("state error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE — full session deletion (explicit user control, privacy requirement).
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  try {
    const participant = await requireParticipant(code, req.headers.get("x-participant-token"));
    await prisma.session.delete({ where: { id: participant.sessionId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
