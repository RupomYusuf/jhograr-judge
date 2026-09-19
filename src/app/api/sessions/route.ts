import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { generateSessionCode, generateToken } from "@/lib/session";
import { getAIProvider } from "@/lib/ai";

const createSchema = z.object({
  relationship: z.enum(["couple", "friends", "siblings", "family", "roommates", "other"]),
  title: z.string().max(80).optional(),
  mode: z.enum(["pair", "solo"]).default("pair"),
  displayName: z.string().max(40).optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { relationship, title, mode, displayName } = parsed.data;

  // Collision-safe code generation.
  let code = generateSessionCode();
  for (let i = 0; i < 5; i++) {
    const exists = await prisma.session.findUnique({ where: { code } });
    if (!exists) break;
    code = generateSessionCode();
  }

  const session = await prisma.session.create({
    data: {
      code,
      relationship,
      mode,
      title: title ?? "",
      status: mode === "solo" ? "intake" : "waiting",
      participants: {
        create: {
          side: "A",
          token: generateToken(),
          displayName: displayName ?? "",
        },
      },
    },
    include: { participants: true },
  });

  const judgeIntro = getAIProvider().greeting({
    relationship,
    side: "A",
    title,
  });
  await prisma.message.create({
    data: {
      sessionId: session.id,
      participantId: session.participants[0].id,
      role: "judge",
      content: (await judgeIntro).message,
    },
  });

  return NextResponse.json({
    code: session.code,
    token: session.participants[0].token,
  });
}
