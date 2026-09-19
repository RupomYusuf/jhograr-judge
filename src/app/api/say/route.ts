import { NextResponse } from "next/server";
import { z } from "zod";
import { getAIProvider } from "@/lib/ai";

const schema = z.object({
  input: z.string().min(1).max(2000),
  tone: z.enum(["clearer", "firmer", "softer", "shorter"]),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const rewrite = await getAIProvider().rewrite(parsed.data.input, parsed.data.tone);
  return NextResponse.json({ rewrite });
}
