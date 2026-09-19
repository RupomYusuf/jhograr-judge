import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { generateToken } from "@/lib/session";
import { getAIProvider } from "@/lib/ai";

const joinSchema = z.object({
  displayName: z.string().max(40).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = joinSchema.safeParse(body);
  const displayName = parsed.success ? parsed.data.displayName ?? "" : "";

  const session = await prisma.session.findUnique({
    where: { code: code.toUpperCase() },
    include: { participants: true },
  });
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (session.participants.some((p) => p.side === "B")) {
    return NextResponse.json({ error: "Someone already joined this session" }, { status: 409 });
  }
  if (session.status === "safety") {
    // Do not reveal why — just don't open a new seat during a safety halt.
    return NextResponse.json({ error: "This session isn't accepting participants" }, { status: 403 });
  }

  const participant = await prisma.participant.create({
    data: { sessionId: session.id, side: "B", token: generateToken(), displayName },
  });

  const reply = await getAIProvider().greeting({ relationship: session.relationship as never, side: "B", title: session.title });
  await prisma.message.create({
    data: {
      sessionId: session.id,
      participantId: participant.id,
      role: "judge",
      content: reply.message,
    },
  });

  // Both seats can now chat privately; shared stage advances when both are done.
  await prisma.session.update({
    where: { id: session.id },
    data: { status: "intake" },
  });

  return NextResponse.json({ token: participant.token, side: "B" });
}
