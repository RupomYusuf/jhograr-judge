import { z } from "zod";
import type {
  AIProvider,
  AIReply,
  Agreement,
  ChatTurn,
  ConflictMap,
  IntakeCtx,
  ResolutionOption,
  StructuredPerspective,
} from "@/lib/types";
import { MockConflictAIProvider } from "@/lib/ai/mock";
import { safetyScreen } from "@/lib/ai/signals";

/**
 * Live provider. Keeps the same AIProvider interface; structured outputs are
 * schema-validated, and every call falls back to the mock engine on failure
 * so a provider outage never breaks a live session.
 */

const perspectiveSchema = z.object({
  summary: z.string(),
  events: z.array(z.string()).max(6),
  interpretations: z.array(z.string()).max(4),
  emotions: z.array(z.string()).max(5),
  needs: z.array(z.string()).max(4),
  expectations: z.array(z.string()).max(3),
  requests: z.array(z.string()).max(3),
  desiredOutcome: z.string(),
  recurring: z.boolean(),
});

const mapSchema = z.object({
  agreed: z.array(z.string()).max(6),
  disputed: z.array(z.object({ a: z.string(), b: z.string() })).max(4),
  aExperienced: z.string(),
  bExperienced: z.string(),
  hiddenDisagreement: z.string(),
  sharedGround: z.array(z.string()).max(4),
  judgeRead: z.string(),
});

const BASE_PRINCIPLES = `You are Judge, part of "Jhograr Judge" — a conflict-resolution product for everyday disagreements between couples, friends, siblings, family, roommates. Tone: a warm, clever, emotionally intelligent mutual friend. Not therapy-speak. Not a courtroom. Never invent facts, never state motive as fact, distinguish observation from interpretation and intention from impact. Do not force 50/50 responsibility. Do not diagnose. Humans decide the outcome. Humour only when the situation is light; disappear entirely when serious. Reply in the user's dominant language (English / Bangla / Banglish). Be concise — 2-4 sentences unless reading something back.`;

async function complete(
  messages: { role: string; content: string }[],
  json: boolean,
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages,
      temperature: 0.7,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`AI provider error ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty AI response");
  return content;
}

export class OpenAIConflictAIProvider implements AIProvider {
  readonly name = "openai";
  private fallback = new MockConflictAIProvider();

  greeting(ctx: IntakeCtx): AIReply {
    const rel = ctx.relationship === "couple" ? "couple" : ctx.relationship;
    return {
      message: `Alright. Tell me what happened — your version. Don't worry about making it sound nice. (You two: ${rel}.)`,
    };
  }

  safetyScreen(text: string) {
    return safetyScreen(text);
  }

  async reply(ctx: IntakeCtx, history: ChatTurn[], userMessage: string): Promise<AIReply> {
    try {
      const content = await complete(
        [
          { role: "system", content: BASE_PRINCIPLES },
          ...history.slice(-10).map((t) => ({
            role: t.role === "judge" ? "assistant" : "user",
            content: t.content,
          })),
          { role: "user", content: userMessage },
        ],
        false,
      );
      return { message: content };
    } catch {
      return this.fallback.reply(ctx, history, userMessage);
    }
  }

  async draftPerspective(ctx: IntakeCtx, history: ChatTurn[]): Promise<StructuredPerspective> {
    const base = this.fallback.draftPerspective(ctx, history);
    try {
      const raw = await complete(
        [
          { role: "system", content: `${BASE_PRINCIPLES}\nReturn JSON only.` },
          {
            role: "user",
            content: `Extract the participant's structured perspective from this conversation. Only use what they said. Conversation:\n${history
              .map((t) => `${t.role}: ${t.content}`)
              .join("\n")}`,
          },
        ],
        true,
      );
      const parsed = perspectiveSchema.parse(JSON.parse(raw));
      return { ...base, ...parsed };
    } catch {
      return base;
    }
  }

  async applyCorrection(p: StructuredPerspective, correction: string): Promise<StructuredPerspective> {
    return this.fallback.applyCorrection(p, correction);
  }

  async buildMap(ctx: IntakeCtx, a: StructuredPerspective, b: StructuredPerspective): Promise<ConflictMap> {
    const base = this.fallback.buildMap(ctx, a, b);
    try {
      const raw = await complete(
        [
          { role: "system", content: `${BASE_PRINCIPLES}\nReturn JSON only. Never fabricate agreement — only include items both genuinely support.` },
          {
            role: "user",
            content: `Two confirmed perspectives:\nA: ${JSON.stringify(a)}\nB: ${JSON.stringify(b)}\nBuild the shared conflict map.`,
          },
        ],
        true,
      );
      const parsed = mapSchema.parse(JSON.parse(raw));
      return {
        ...base,
        agreed: parsed.agreed,
        disputed: parsed.disputed.map((d) => ({ topic: d.a.slice(0, 60), ...d })),
        aExperienced: parsed.aExperienced,
        bExperienced: parsed.bExperienced,
        hiddenDisagreement: parsed.hiddenDisagreement,
        sharedGround: parsed.sharedGround,
        judgeRead: parsed.judgeRead,
      };
    } catch {
      return base;
    }
  }

  async buildResolutions(
    ctx: IntakeCtx,
    a: StructuredPerspective,
    b: StructuredPerspective,
    map: ConflictMap,
    constraints?: string,
  ): Promise<ResolutionOption[]> {
    const base = this.fallback.buildResolutions(ctx, a, b, map, constraints);
    try {
      const raw = await complete(
        [
          { role: "system", content: `${BASE_PRINCIPLES}\nReturn JSON: {"options":[{"category","title","detail","aWill","bWill"}]}` },
          {
            role: "user",
            content: `Conflict map: ${JSON.stringify(map)}\nGenerate 3 context-specific resolution paths across categories (agreement/experiment/clarify/acknowledge/compromise). ${constraints ? `Avoid what they rejected: ${constraints}` : ""}`,
          },
        ],
        true,
      );
      const parsed = z
        .object({
          options: z.array(z.object({
            category: z.string(),
            title: z.string(),
            detail: z.string(),
            aWill: z.string(),
            bWill: z.string(),
          })).min(1).max(4),
        })
        .parse(JSON.parse(raw));
      return parsed.options.map((o, i) => ({ id: `ai-${i}-${Date.now()}`, ...o })) as ResolutionOption[];
    } catch {
      return base;
    }
  }

  async draftAgreement(
    ctx: IntakeCtx,
    option: ResolutionOption,
    map: ConflictMap,
  ): Promise<Agreement> {
    return this.fallback.draftAgreement(ctx, option, map);
  }

  async reflectSolo(history: ChatTurn[], userMessage: string): Promise<AIReply> {
    try {
      const content = await complete(
        [
          {
            role: "system",
            content: `${BASE_PRINCIPLES}\nOnly one person is present. Never pretend to know the absent person's intentions. Help separate known facts from assumptions and prepare one calm question to ask.`,
          },
          ...history.slice(-8).map((t) => ({
            role: t.role === "judge" ? "assistant" : "user",
            content: t.content,
          })),
          { role: "user", content: userMessage },
        ],
        false,
      );
      return { message: content };
    } catch {
      return this.fallback.reflectSolo(history, userMessage);
    }
  }

  async draftSoloSummary(history: ChatTurn[]) {
    return this.fallback.draftSoloSummary(history);
  }

  async rewrite(input: string, tone: "clearer" | "firmer" | "softer" | "shorter"): Promise<string> {
    try {
      return await complete(
        [
          {
            role: "system",
            content: `${BASE_PRINCIPLES}\nRewrite the user's draft message to their partner in a "${tone}" tone. Keep their real point and legitimate anger; remove character attacks. Never sanitize a legitimate boundary into weak language. Match their language (English/Bangla/Banglish). Output only the rewritten message.`,
          },
          { role: "user", content: input },
        ],
        false,
      );
    } catch {
      return this.fallback.rewrite(input, tone);
    }
  }
}
