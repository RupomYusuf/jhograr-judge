import {
  AIProvider,
  type AIReply,
  type Agreement,
  type ChatTurn,
  type ConflictMap,
  type IntakeCtx,
  type ResolutionOption,
  type StructuredPerspective,
} from "@/lib/types";
import {
  classifyConflict,
  detectLanguage,
  detectTone,
  EMOTION_LEXICON,
  NEED_BY_EMOTION,
  pick,
  safetyScreen,
} from "@/lib/ai/signals";

// ---------------------------------------------------------------------------
// MockConflictAIProvider
//
// Deterministic heuristic engine. Same interface as the live LLM provider so
// the whole product works offline and in tests. It is deliberately adaptive:
// it classifies, asks only for what is missing, echoes the user's words, and
// drops all humour the moment the situation is serious.
// ---------------------------------------------------------------------------

type Local = {
  greeting: string[];
  reactLight: string[];
  reactNeutral: string[];
  reactSerious: string[];
  askMeaning: string[];
  askWant: string[];
  askHistory: string[];
  askResolve: string[];
  readback: string[];
};

const EN: Local = {
  greeting: [
    "Alright. Tell me what happened — your version. Don't worry about making it sound nice.",
    "Okay, I'm listening. Walk me through it — what happened, in your own words?",
    "Go ahead. What happened? Start wherever feels natural.",
  ],
  reactLight: [
    "Okay, noted. Classic episode. Keep going — what happened next?",
    "Ha. Okay. And what was the moment it went from fine to not fine?",
  ],
  reactNeutral: [
    "Okay, I've got that part. Keep going — what happened after that?",
    "Mm, okay. And where did it go wrong for you?",
  ],
  reactSerious: [
    "Okay. Thank you for telling me plainly. What happened after that?",
    "I hear you. Keep going — I want the full picture before I say anything.",
  ],
  askMeaning: [
    "Quick check — what bothered you more: what they did, or what you think it meant?",
    "Let me ask something. Did the thing itself bother you, or what you felt it said about you?",
  ],
  askWant: [
    "What did you want them to do instead — concretely?",
    "If they'd handled it perfectly, what would they have done?",
  ],
  askHistory: [
    "Have you two argued about something like this before?",
    "Is this the first time, or is this a rerun?",
  ],
  askResolve: [
    "Last one — what would actually make this feel resolved to you?",
    "And what would make this feel genuinely over for you — not just quiet?",
  ],
  readback: [
    "Okay — I think I've got your side. Let me read it back before we go anywhere else.",
    "Right. I have a clear picture now. Let me play it back to you — correct me if I get it wrong.",
  ],
};

const BANGLISH: Local = {
  greeting: [
    "Achha, bolo ki hoyechhe — tomar version ta. Sundor kore bolarte hobe na.",
    "Okay, ami shunchhi. Ki hoyecho bolo — nijer bhashay.",
    "Shuru koro. Ki hoise? Jemon mone hoy temni bolo.",
  ],
  reactLight: [
    "Hmm, dhorlam. Classic episode. Ebar ki hoye porer ta?",
    "Ha ha, thik ache. Ar kon moment e jinish ta kharap hoye gelo?",
  ],
  reactNeutral: [
    "Okay, eta bujhlam. Tarpore ki holo?",
    "Hmm. Ar tomar kothay problem ta hoise?",
  ],
  reactSerious: [
    "Achha. Soyoger kotha ta bola jonno dhonnobad. Pore ki holo?",
    "Bujhte parchhi. Chaliye jao — age puro ta shuni ni.",
  ],
  askMeaning: [
    "Ekta jinish bolo — kharap legechhe kaj ta nie, naki seta tomar jonno ki bujhachhilo seta nie?",
    "Ektu bhebe bolo — onno ta nie beshi kosto, naki setar mane ta nie?",
  ],
  askWant: [
    "Se er bodole ki korto jodi thik moto korto — specifically?",
    "Se jodi perfect handle korto, ki korto?",
  ],
  askHistory: [
    "Ageo ki emon kichhu hoyechhe tomader moddhe?",
    "Eta ki first time, naki abar same jinish?",
  ],
  askResolve: [
    "Shesh proshno — ki hole eta solve hoyechhe mone hobe tomake?",
    "Ar ki hole tomake mone hobe jhogra ta sotti sotti sesh?",
  ],
  readback: [
    "Okay — tomar side ta ekhon clear. Ekbar ferot boli, bhul thakle thik koro.",
    "Achha, puro chitra ta peyechhi. Ekbar boli shuni nao — bhul hole bolo.",
  ],
};

const BN: Local = {
  greeting: [
    "আচ্ছা, বলো কী হয়েছে — তোমার নিজের ভাষায়। সুন্দর করে সাজিয়ে বলার দরকার নেই।",
    "ঠিক আছে, আমি শুনছি। ঘটনাটা বলো — যেমনটা তোমার মনে হয়েছে।",
  ],
  reactLight: ["হাহা, ধরেছি। পরে কী হলো?", "আচ্ছা। আর কোন মুহূর্তে ব্যাপারটা খারাপ হলো?"],
  reactNeutral: ["আচ্ছা, এটা বুঝলাম। তারপর কী হলো?", "হুম। আর তোমার কাছে সমস্যাটা কোথায় দাঁড়াল?"],
  reactSerious: ["আচ্ছা। সোজাসুজি বলার জন্য ধন্যবাদ। এরপর কী হলো?", "শুনতে পাচ্ছি। আগে পুরোটা শুনি — তারপর কিছু বলব।"],
  askMeaning: [
    "একটা জিনিস বলো — খারাপ লেগেছে কাজটা নিয়ে, নাকি সেটা তোমার জন্য কী বোঝাল সেটা নিয়ে?",
  ],
  askWant: ["সে যদি ঠিকমতো করত, ঠিক কী করত?"],
  askHistory: ["আগেও কি এমন কিছু হয়েছে তোমাদের মধ্যে?"],
  askResolve: ["শেষ প্রশ্ন — কী হলে তোমার কাছে এটা সত্যিই মিটে যাওয়ার মতো মনে হবে?"],
  readback: ["ওকে — তোমার দিকটা এখন পরিষ্কার। একবার ফিরিয়ে বলি, ভুল থাকলে ঠিক করো।"],
};

const LOCALS: Record<string, Local> = { en: EN, banglish: BANGLISH, bn: BN };

function localFor(lang: string): Local {
  return LOCALS[lang] ?? EN;
}

function snippet(text: string, max = 70): string {
  const clean = text.trim().replace(/\s+/g, " ");
  const firstClause = clean.split(/[,.!?।]/)[0] ?? clean;
  const s = firstClause.length > 8 ? firstClause : clean;
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

function userTurns(history: ChatTurn[]): string[] {
  return history.filter((t) => t.role === "user").map((t) => t.content);
}

/**
 * Privacy boundary for shared surfaces: recollections shown on the shared map
 * are processed into reported speech, never quoted raw from the private room.
 */
export function toReportedSpeech(sentence: string): string {
  let s = sentence.trim().replace(/["“”]/g, "");
  s = s.replace(/\bI'm\b/gi, "they're")
    .replace(/\bI am\b/gi, "they are")
    .replace(/\bI've\b/gi, "they've")
    .replace(/\bI'll\b/gi, "they'll")
    .replace(/\bI was\b/gi, "they were")
    .replace(/\bI were\b/gi, "they were")
    .replace(/\bmy\b/gi, "their")
    .replace(/\bmine\b/gi, "theirs")
    .replace(/\bme\b/gi, "them")
    .replace(/\bmyself\b/gi, "themselves")
    .replace(/\bI\b/g, "they");
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (!/[.!?]$/.test(s)) s += ".";
  return s;
}

export class MockConflictAIProvider implements AIProvider {
  readonly name = "mock";

  greeting(ctx: IntakeCtx): AIReply {
    const rel =
      ctx.relationship === "couple"
        ? " And just so you know — I'm not here to decide who wins."
        : "";
    const g = pick(EN.greeting, ctx.side + ctx.relationship);
    return { message: g + rel, chips: undefined };
  }

  safetyScreen(text: string) {
    return safetyScreen(text);
  }

  reply(ctx: IntakeCtx, history: ChatTurn[], userMessage: string): AIReply {
    const fullText = userTurns(history).join(" ") + " " + userMessage;
    const lang = detectLanguage(fullText);
    const tone = detectTone(fullText);
    const L = localFor(lang);
    const turnIndex = userTurns(history).length; // 0 for the story itself

    // After the 4th user answer we move to readback.
    if (turnIndex >= 4) {
      return { message: pick(L.readback, userMessage), done: true };
    }

    if (turnIndex === 0) {
      const react =
        tone === "light"
          ? pick(L.reactLight, userMessage)
          : tone === "serious"
            ? pick(L.reactSerious, userMessage)
            : pick(L.reactNeutral, userMessage);
      const echo = snippet(userMessage);
      return {
        message:
          tone === "light"
            ? `${echo} — got it. ${react}`
            : `${react} So — "${echo}." ${pick(L.askMeaning, userMessage)}`,
        chips:
          tone === "light"
            ? undefined
            : [
                "What they did, mostly",
                "What I think it meant",
                "Honestly, both",
              ],
      };
    }

    if (turnIndex === 1) {
      return {
        message: pick(L.askWant, userMessage),
        chips: undefined,
      };
    }

    if (turnIndex === 2) {
      return { message: pick(L.askHistory, userMessage), chips: ["First time", "It's a rerun"] };
    }

    return { message: pick(L.askResolve, userMessage), chips: undefined };
  }

  draftPerspective(ctx: IntakeCtx, history: ChatTurn[]): StructuredPerspective {
    const turns = userTurns(history);
    const full = turns.join(" ");
    const lang = detectLanguage(full);
    const tone = detectTone(full);
    const story = turns[0] ?? "";
    const sentences = story
      .split(/(?<=[.!?।])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const interpretationMarkers =
      /\b(because|obviously|clearly|thinks?|feels?|meant|shows?|proves?|doesn'?t care|never|always|selfish|doesn'?t respect|assum(e|ed|ing))\b/i;

    const events: string[] = [];
    const interpretations: string[] = [];
    for (const s of sentences) {
      (interpretationMarkers.test(s) ? interpretations : events).push(s);
    }

    const emotions: string[] = [];
    for (const [re, label] of EMOTION_LEXICON) {
      if (re.test(full) && !emotions.includes(label)) emotions.push(label);
    }

    const needs = [...new Set(emotions.map((e) => NEED_BY_EMOTION[e]).filter(Boolean))] as string[];
    const wantsInstead = turns.slice(1).find((t) => t.length > 5);

    const expectations: string[] = [];
    for (const s of sentences) {
      if (/\b(should|supposed to|agreed|was going to|told me (he|she|they) would)\b/i.test(s)) {
        expectations.push(s);
      }
    }

    const recurring = /\b(always|never|every time|again|each time|har bar|sob somoy|bar bar)\b/i.test(full);

    const summary =
      lang === "bn"
        ? story.slice(0, 220)
        : `You said: "${snippet(story, 180)}"${wantsInstead ? ` What you wanted instead: ${snippet(wantsInstead, 100)}` : ""}`;

    return {
      summary,
      events: events.slice(0, 4),
      claims: [],
      interpretations: interpretations.slice(0, 3),
      emotions,
      needs: needs.slice(0, 3),
      expectations: expectations.slice(0, 2),
      requests: wantsInstead ? [snippet(wantsInstead, 120)] : [],
      desiredOutcome: turns[turns.length - 1] || "For this to actually be addressed, not just avoided.",
      recurring,
      uncertainties: [],
      language: lang,
      tone,
      conflictTypes: classifyConflict(full),
    };
  }

  applyCorrection(p: StructuredPerspective, correction: string): StructuredPerspective {
    return {
      ...p,
      corrections: [...(p.corrections ?? []), correction],
      summary: `${p.summary} (Corrected: ${snippet(correction, 120)})`,
    };
  }

  buildMap(
    ctx: IntakeCtx,
    a: StructuredPerspective,
    b: StructuredPerspective,
  ): ConflictMap {
    const types = [...new Set([...a.conflictTypes, ...b.conflictTypes])].slice(0, 4);

    // Cross-side event matching by token overlap — never fabricate agreement.
    const agreed: string[] = [];
    const disputed: ConflictMap["disputed"] = [];
    const notEstablished: string[] = [];
    const usedB = new Set<number>();
    const tokenize = (s: string) =>
      s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter((w) => w.length > 3);
    for (const ea of a.events) {
      const ta = new Set(tokenize(ea));
      let best = -1;
      let bestScore = 0;
      for (let i = 0; i < b.events.length; i++) {
        if (usedB.has(i)) continue;
        const tb = new Set(tokenize(b.events[i]));
        const overlap = [...ta].filter((w) => tb.has(w)).length;
        const union = new Set([...ta, ...tb]).size || 1;
        const score = overlap / union;
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      }
      if (best >= 0 && bestScore > 0.34) {
        usedB.add(best);
        agreed.push(`Both mention: ${toReportedSpeech(ea)}`);
      } else if (best >= 0 && bestScore > 0.08) {
        // Related but conflicting recollections — a real "stories differ" row.
        usedB.add(best);
        disputed.push({
          topic: snippet(ea, 60),
          a: toReportedSpeech(ea),
          b: toReportedSpeech(b.events[best]),
        });
      } else {
        // No counterpart on the other side — mark honestly instead of inventing one.
        notEstablished.push(`${toReportedSpeech(ea)} — not confirmed by B`);
      }
    }

    const expOf = (p: StructuredPerspective, side: string) =>
      p.emotions.length > 0
        ? `${p.emotions[0].charAt(0).toUpperCase() + p.emotions[0].slice(1)}${p.interpretations[0] ? ` — ${toReportedSpeech(p.interpretations[0])}` : ""}`
        : p.interpretations[0]
          ? toReportedSpeech(p.interpretations[0])
          : `${side} describes: ${snippet(p.summary, 120)}`;

    const hiddenByType: Partial<Record<string, string>> = {
      EXPECTATION_MISMATCH: "What counts as reasonable when plans or circumstances change.",
      COMMUNICATION_FAILURE: "What response time and responsiveness actually signal to each of you.",
      TIME: "How much notice is owed when something changes.",
      BROKEN_PROMISE: "Whether a promise was actually made — and what breaking it meant.",
      TRUST: "What reassurance looks like without becoming surveillance.",
      HOUSEHOLD: "How household effort is divided and noticed.",
      MONEY: "What spending is a joint decision versus an individual one.",
      RECURRING_PATTERN: "The cycle itself — not the single incident.",
      UNMET_NEED: "Whether being cared about is being shown clearly enough.",
      FAIRNESS: "What a fair split of effort actually looks like.",
      MISUNDERSTANDING: "What each person actually meant versus what was heard.",
      OTHER: "What each of you thinks the argument is really about.",
    };
    const hidden = hiddenByType[types[0]] ?? hiddenByType.OTHER!;

    const sharedGround: string[] = [];
    const aNeeds = new Set(a.needs);
    for (const n of b.needs) if (aNeeds.has(n)) sharedGround.push(`Both need: ${n}`);
    if (a.desiredOutcome && b.desiredOutcome) {
      sharedGround.push("Both want this addressed for real — not just smoothed over.");
    }

    const readTemplates: Partial<Record<string, string>> = {
      COMMUNICATION_FAILURE:
        "I don't think you're mainly fighting about the reply. One of you reads silence as being ignored; the other reads repeated messages as pressure. The fight is about what silence means.",
      EXPECTATION_MISMATCH:
        "You're not disagreeing about what happened. You're disagreeing about what was owed in that situation — and that was never explicitly agreed.",
      MISUNDERSTANDING:
        "Wait — I think you two actually agree about what happened. You're disagreeing about what it meant.",
      BROKEN_PROMISE:
        "On the event itself, there may be little factual disagreement. The unresolved part is what it meant, and what repair would actually help.",
      RECURRING_PATTERN:
        "This looks less like one argument and more like a cycle you both keep falling into. The incident is the trigger, not the cause.",
      UNMET_NEED:
        "I don't think the surface issue is the real fight here. Underneath, one of you is asking to feel like they matter.",
    };
    const judgeRead = readTemplates[types[0]] ??
      `From where I sit, the visible argument and the actual disagreement aren't the same thing. The visible one is about ${types[0]?.replace(/_/g, " ").toLowerCase() ?? "this event"}; the real one is about what it means between you.`;

    return {
      agreed,
      disputed,
      notEstablished: [
        ...notEstablished,
        ...a.expectations.map((e) => `A expects: ${toReportedSpeech(e)} — not confirmed by B`),
        ...b.expectations.map((e) => `B expects: ${toReportedSpeech(e)} — not confirmed by A`),
      ].slice(0, 4),
      aExperienced: expOf(a, "A"),
      bExperienced: expOf(b, "B"),
      hiddenDisagreement: hidden,
      sharedGround,
      judgeRead,
      conflictTypes: types,
    };
  }

  buildResolutions(
    ctx: IntakeCtx,
    a: StructuredPerspective,
    b: StructuredPerspective,
    map: ConflictMap,
    constraints?: string,
  ): ResolutionOption[] {
    const t = map.conflictTypes;
    const has = (x: string) => t.includes(x as never);
    const opts: ResolutionOption[] = [];
    const n = (i: number) => `r${i}-${Math.random().toString(36).slice(2, 6)}`;

    if (has("COMMUNICATION_FAILURE") || has("EXPECTATION_MISMATCH")) {
      opts.push(
        {
          id: n(1),
          category: "agreement",
          title: "A simple heads-up rule",
          detail:
            "Neither of you has to change how much you text. The rule is only about signalling: when someone will be unreachable for a while, they send one short message. Silence then means 'busy', not 'ignoring'.",
          aWill: "Assume silence means busy — ask before assuming intention.",
          bWill: "Send a short heads-up when unavailable for several hours.",
        },
        {
          id: n(2),
          category: "experiment",
          title: "One-week experiment: check-in times",
          detail:
            "For one week: a short morning and evening check-in, and freedom in between. Review after a week — keep it, adjust it, or drop it.",
          aWill: "Hold to the two check-ins without spiralling in between.",
          bWill: "Actually send the two check-ins, not just when convenient.",
        },
        {
          id: n(3),
          category: "clarify",
          title: "Say what silence means, once",
          detail:
            "One honest exchange, no arguing: A explains what waiting feels like; B explains what pressure feels like. No fix required yet — just both hearing it.",
          aWill: "Describe the feeling without accusing.",
          bWill: "Hear it without defending for one minute.",
        },
      );
    } else if (has("MISUNDERSTANDING")) {
      opts.push(
        {
          id: n(1),
          category: "clarify",
          title: "Correct the record",
          detail:
            "The disagreement appears to rest on a crossed wire. Each of you states what you actually meant at the moment it went wrong. Nothing else needed.",
          aWill: "State what you meant, plainly.",
          bWill: "State what you meant, plainly.",
        },
        {
          id: n(2),
          category: "acknowledge",
          title: "Acknowledge the sting, then close it",
          detail:
            "Even misunderstandings leave a mark. One sentence of acknowledgment of the impact, then agree it's closed — not to be relitigated.",
          aWill: "Acknowledge the impact on B.",
          bWill: "Acknowledge the impact on A.",
        },
      );
    } else if (has("BROKEN_PROMISE")) {
      opts.push(
        {
          id: n(1),
          category: "apologize",
          title: "A real apology, not a brush-off",
          detail:
            "Name the specific thing that happened, the impact it had, and what changes. No 'sorry you felt that way'.",
          aWill: "Apologise specifically — behaviour, impact, change.",
          bWill: "Receive it and say what would make it feel complete.",
        },
        {
          id: n(2),
          category: "agreement",
          title: "Make important dates unmissable",
          detail: "Shared reminders for dates that matter, so memory stops being the system.",
          aWill: "Set the reminders together once.",
          bWill: "Trust the system instead of testing it.",
        },
      );
    } else {
      opts.push(
        {
          id: n(1),
          category: "compromise",
          title: "Meet in the middle — explicitly",
          detail:
            "Each of you names the one thing you can genuinely live with adjusting, and the one thing you can't. Build the arrangement from those answers only.",
          aWill: "Adjust where it's genuinely tolerable.",
          bWill: "Adjust where it's genuinely tolerable.",
        },
        {
          id: n(2),
          category: "acknowledge",
          title: "Acknowledge before solving",
          detail:
            "Before any arrangement: each person says back what the other experienced, in their own words, until the other says 'yes, that's it'.",
          aWill: "Reflect B's experience until it lands.",
          bWill: "Reflect A's experience until it lands.",
        },
        {
          id: n(3),
          category: "experiment",
          title: "Try it differently for one week",
          detail: "Pick one small change, run it for a week, then review honestly.",
          aWill: "Make the change.",
          bWill: "Make the change.",
        },
      );
    }

    if (map.conflictTypes.includes("RECURRING_PATTERN")) {
      opts.push({
        id: n(9),
        category: "agreement",
        title: "Interrupt the cycle at one point",
        detail:
          "The cycle: trigger → worry → pressure → withdrawal → escalation. Agree on a single interrupt: when the trigger happens, ask what happened before arguing about intention.",
        aWill: "Ask before assuming.",
        bWill: "Answer before withdrawing.",
      });
    }

    if (constraints) {
      opts.unshift({
        id: n(0),
        category: "compromise",
        title: "Adjusted for what you told me",
        detail: `You said what made the earlier options unacceptable: "${snippet(constraints, 120)}". Here's a version that avoids those.`,
        aWill: "As in the option, adapted by the constraint.",
        bWill: "As in the option, adapted by the constraint.",
      });
    }

    return opts.slice(0, 4);
  }

  draftAgreement(
    ctx: IntakeCtx,
    option: ResolutionOption,
    map: ConflictMap,
  ): Agreement {
    const playful = map.conflictTypes.every((t) =>
      ["COMMUNICATION_FAILURE", "EXPECTATION_MISMATCH", "TIME", "HOUSEHOLD", "OTHER", "MISUNDERSTANDING"].includes(t),
    );
    return {
      headline: playful ? "Peace Treaty 🤝" : "Our Agreement",
      figuredOut:
        map.judgeRead ||
        "The surface argument and the real disagreement weren't the same thing — and now both of you know it.",
      aWill: option.aWill,
      bWill: option.bWill,
      ifAgain: "Ask what happened before arguing about intention.",
      playfullyNamed: playful,
    };
  }

  // ---- Solo mode: strict epistemic honesty ----

  reflectSolo(_history: ChatTurn[], userMessage: string): AIReply {
    const turnIndex = _history.filter((t) => t.role === "user").length - 1;
    const lang = detectLanguage(userMessage);
    if (turnIndex <= 0) {
      return {
        message:
          lang === "bn"
            ? "হয়তো — কিন্তু আমার কাছে শুধু তোমার দিকটাই আছে, তাই কেন এমন হলো আমি জানি না। চলো আলাদা করি: কী জানা, আর কী ধারণা।"
            : "Maybe — but I only have your side, so I can't know why they did what they did. Let's separate what you know from what you're assuming. Tell me a bit more about what actually happened.",
      };
    }
    if (turnIndex === 1) {
      return {
        message:
          "Okay. And when that happened — what did you feel, and what did you immediately assume it meant? Those are usually two different things.",
        chips: ["I'll separate them", "They feel the same"],
      };
    }
    return {
      message:
        "Right. Last thing: if you could ask them one calm question about this, what would it be? Not an accusation — a question.",
      done: true,
    };
  }

  draftSoloSummary(history: ChatTurn[]): {
    known: string[];
    unknown: string[];
    interpretation: string;
    feeling: string;
    suggestedAsk: string;
  } {
    const turns = history.filter((t) => t.role === "user").map((t) => t.content);
    const story = turns[0] ?? "";
    return {
      known: [snippet(story, 140)],
      unknown: ["Why they did it", "What they intended", "What they were dealing with"],
      interpretation: turns[1] ? snippet(turns[1], 120) : "That it says something about how they see you.",
      feeling: turns[2] ? snippet(turns[2], 80) : "Hurt.",
      suggestedAsk:
        "“When X happened, I was confused about what was going on for you. Can you tell me?”",
    };
  }

  // ---- Help me say it ----

  /** Extract a grammatical behaviour clause from an angry draft. */
  private behaviourClause(input: string): string {
    let s = input
      .replace(/\b(idiot|stupid|selfish|useless|pathetic|moron|dumb|toxic|worthless|asshole|jerk)\b/gi, "")
      .replace(/\b(literally|obviously|honestly|actually)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    // Drop a leading imperative like "tell him …" — the message is about the behaviour.
    s = s.replace(/^tell\s+(him|her|them|you)\s*/i, "");
    // Prefer the "-ing" behaviour: "…for disappearing for 7 hours" → "you disappear for 7 hours".
    const ing = s.match(/\bfor\s+([a-z]+ing)\b\s*([^,.]*)/i) ?? s.match(/\b([a-z]+ing)\b\s*([^,.]*)/i);
    if (ing) {
      const verb = ing[1].replace(/ing$/i, "");
      const rest = (ing[2] ?? "").trim();
      return `you ${verb}${rest ? " " + rest : ""}`;
    }
    // The draft addresses the other person — convert to second person.
    s = s
      .replace(/\bshe\b/gi, "you")
      .replace(/\bhe\b/gi, "you")
      .replace(/\bthey\b/gi, "you")
      .replace(/\bdoesn'?t\b/gi, "don't")
      .replace(/\bdoesn't\b/gi, "don't")
      .replace(/\bdoes\b/gi, "do")
      .replace(/\bhas\b/gi, "have");
    // "you are <insult> and …" → drop the copula and any leftover conjunction.
    s = s.replace(/\byou\s+(are|were)\b\s*(and\s+)?/i, "").replace(/^and\s+/i, "");
    // Strip the interpretive tail ("…, you don't care about me").
    s = s.replace(/,\s*you\s+(don'?t|do not|never|always)\b.*$/i, "");
    // Clean dangling articles left by removed insults.
    s = s.replace(/\b(an?|the)\s+(?=(for|and|but|,|\.|$))/gi, "").replace(/\s+/g, " ").trim();
    if (!s) return "plans change without a word";
    if (!/^(you|he|she|they|it)\b/i.test(s)) s = "you " + s.charAt(0).toLowerCase() + s.slice(1);
    return s;
  }

  rewrite(input: string, tone: "clearer" | "firmer" | "softer" | "shorter"): string {
    const lang = detectLanguage(input);
    if (lang === "bn") {
      const base = `যখন এমন হয়, আমার মনে হয় আমার কথা কিছু যায় আসে না। আমি চাই আগে থেকে জানানো হোক।`;
      return tone === "firmer" ? `${base} এটা নিয়ে আমার আপস নেই।` : base;
    }
    const behaviour = this.behaviourClause(input);
    const need = input.match(/\bI (?:need|want)\s+([^.!?,]{4,90})/i)?.[1]?.trim()
      ?? "a heads-up when plans change — that's the part that matters to me";
    const whenClause = `When ${behaviour}, I end up feeling like my time doesn't matter to you`;
    switch (tone) {
      case "firmer":
        return `${whenClause}. I need ${need}. I'm not flexible on this one — it's about basic communication, not preference.`;
      case "softer":
        return `Can I tell you something that's been sitting with me? When ${behaviour}, I feel a bit unimportant. I'd honestly just love ${need.startsWith("a heads-up") ? "a heads-up next time" : need}.`;
      case "shorter":
        return `When ${behaviour}, it reads as ignoring me even when it isn't. ${need.charAt(0).toUpperCase() + need.slice(1)}, please.`;
      default:
        return `${whenClause}. I need ${need}.`;
    }
  }
}
