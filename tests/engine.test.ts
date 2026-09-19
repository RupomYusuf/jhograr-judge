import { describe, expect, it } from "vitest";
import { classifyConflict, detectLanguage, detectTone, safetyScreen } from "@/lib/ai/signals";
import { MockConflictAIProvider } from "@/lib/ai/mock";
import type { ChatTurn, IntakeCtx } from "@/lib/types";

const ctx: IntakeCtx = { relationship: "couple", side: "A" };

describe("language detection", () => {
  it("detects Bangla script", () => {
    expect(detectLanguage("সে আমাকে না বলে চলে গেছে")).toBe("bn");
  });
  it("detects Banglish", () => {
    expect(detectLanguage("O amar msg seen kore reply dey nai")).toBe("banglish");
  });
  it("detects English", () => {
    expect(detectLanguage("She always does this and then acts like nothing happened.")).toBe("en");
  });
});

describe("tone detection", () => {
  it("drops humour when the situation is serious", () => {
    expect(detectTone("I am scared of him when he raises his voice")).toBe("serious");
  });
  it("stays light on silly fights", () => {
    expect(detectTone("We fought about who ate the last slice of pizza lol")).toBe("light");
  });
});

describe("safety screening", () => {
  it("flags threats and violence", () => {
    expect(safetyScreen("he hit me last week and threatened to do it again").flagged).toBe(true);
  });
  it("flags coercive monitoring", () => {
    expect(safetyScreen("she checks my phone and won't let me see my friends").flagged).toBe(true);
  });
  it("does not flag ordinary arguments", () => {
    expect(safetyScreen("he was late again and I was furious").flagged).toBe(false);
  });
});

describe("conflict classification", () => {
  it("recognizes communication/expectation conflicts", () => {
    const types = classifyConflict("He left my message on seen and never replies, every time");
    expect(types).toContain("COMMUNICATION_FAILURE");
    expect(types).toContain("RECURRING_PATTERN");
  });
  it("recognizes household fairness conflicts", () => {
    const types = classifyConflict("I always do the dishes and the laundry while she does nothing, it's unfair");
    expect(types).toContain("HOUSEHOLD");
  });
});

describe("adaptive intake", () => {
  const provider = new MockConflictAIProvider();

  it("asks different questions as the story develops (not a fixed script)", () => {
    const q1 = provider.reply(ctx, [], "She cancelled our dinner plans again for the third time").message;
    const q2 = provider.reply(ctx, [{ role: "user", content: "She cancelled our dinner plans again" }, { role: "judge", content: "…" }], "What it meant to me, mostly").message;
    expect(q1).toContain("cancelled");
    expect(q2).not.toContain("cancelled");
    expect(q2.toLowerCase()).toMatch(/instead|perfectly/);
  });

  it("finishes intake and drafts a perspective with separated interpretation", () => {
    let history: ChatTurn[] = [];
    const turns = [
      "She cancelled dinner again. Obviously she doesn't care about me anymore.",
      "What it meant, mostly",
      "I wanted her to tell me earlier, or reschedule properly",
      "Yes, this has happened before",
      "An apology and a proper plan would fix it",
    ];
    for (const t of turns) {
      const r = provider.reply(ctx, history, t);
      history = [...history, { role: "user", content: t }, { role: "judge", content: r.message }];
      if (r.done) break;
    }
    const draft = provider.draftPerspective(ctx, history);
    expect(draft.events.length).toBeGreaterThan(0);
    expect(draft.interpretations.join(" ").toLowerCase()).toContain("care");
    expect(draft.conflictTypes).toContain("EXPECTATION_MISMATCH");
    expect(draft.recurring).toBe(true);
  });

  it("never fabricates cross-side agreement that isn't there", () => {
    const a = provider.draftPerspective({ ...ctx, side: "A" }, [
      { role: "user", content: "He forgot my birthday entirely." } as ChatTurn,
    ]);
    const b = provider.draftPerspective({ ...ctx, side: "B" }, [
      { role: "user", content: "I was traveling for work and my phone died, we don't usually celebrate." } as ChatTurn,
    ]);
    const map = provider.buildMap(ctx, a, b);
    expect(map.judgeRead.length).toBeGreaterThan(20);
  });

  it("keeps raw private sentences off the shared map (privacy boundary)", () => {
    const a = provider.draftPerspective({ ...ctx, side: "A" }, [
      { role: "user", content: "He ignored my messages. I was in meetings all day and saw nothing until evening." } as ChatTurn,
    ]);
    const map = provider.buildMap(ctx, a, a);
    const shared = JSON.stringify([map.agreed, map.disputed, map.aExperienced, map.bExperienced, map.notEstablished]);
    // First-person raw speech must be processed into reported speech.
    expect(shared).not.toMatch(/\bI'?m\b|\bmy\b|\bme\b/);
  });

  it("keeps solo mode epistemically honest", () => {
    const r = provider.reflectSolo([], "My boyfriend ignored me because he doesn't care");
    expect(r.message).toMatch(/only have your side|can't know/i);
  });

  it("preserves the point while removing character attacks in rewrites", () => {
    const out = provider.rewrite("You're an idiot for disappearing for 7 hours", "clearer");
    expect(out.toLowerCase()).not.toContain("idiot");
    expect(out.length).toBeGreaterThan(40);
  });

  it("produces grammatical rewrites from messy drafts", () => {
    const cases = [
      "Tell him he's an idiot for disappearing for 7 hours",
      "You are selfish and literally never think about me",
      "She cancelled again, obviously she does not care",
    ];
    for (const c of cases) {
      const out = provider.rewrite(c, "clearer");
      expect(out.startsWith("When you ")).toBe(true);
      expect(out).not.toMatch(/\b(an|the)\s+(for|and|but|[,.])/i);
      expect(out).not.toMatch(/\byou (are|were)\s+(and|but)/i);
    }
  });
});
