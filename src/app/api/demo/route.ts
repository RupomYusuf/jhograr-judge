import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateSessionCode, generateToken } from "@/lib/session";
import type { ConflictMap, ResolutionOption, StructuredPerspective } from "@/lib/types";

/**
 * Seed demo — the complete flagship conflict from the product spec, playable
 * without an account. The visitor lands as participant A after both sides
 * have already finished their private intake, so the map/resolution stages
 * can be explored immediately.
 */

const A: StructuredPerspective = {
  summary:
    'You said: "He ignores my messages for hours and then replies like nothing happened." What you wanted instead: a quick reply or a heads-up when he\'s busy.',
  events: [
    "I messaged him in the morning and got no reply until evening.",
    "This has happened at least three times in the last two weeks.",
  ],
  claims: [],
  interpretations: [
    "Long silence means I'm not important to him.",
  ],
  emotions: ["feeling unimportant", "anxious"],
  needs: ["to feel like a priority", "reassurance and predictability"],
  expectations: ["If you're busy, you say so — that's basic consideration."],
  requests: ["A quick reply or a heads-up when he's busy."],
  desiredOutcome: "To stop spiralling every time the reply takes hours.",
  recurring: true,
  uncertainties: [],
  language: "en",
  tone: "neutral",
  conflictTypes: ["COMMUNICATION_FAILURE", "EXPECTATION_MISMATCH", "RECURRING_PATTERN", "UNMET_NEED"],
};

const B: StructuredPerspective = {
  summary:
    'You said: "Work makes immediate replies impossible, and the follow-up messages feel like pressure."',
  events: [
    "I'm in meetings much of the day and can't check my phone.",
    "When I finally see the phone, there are six missed messages and a missed call.",
  ],
  claims: [],
  interpretations: [
    "Repeated messages mean she doesn't trust me to be busy.",
  ],
  emotions: ["overwhelmed", "feeling it was unfair"],
  needs: ["space and flexibility", "to be trusted"],
  expectations: ["An unanswered message for a few hours should be fine."],
  requests: ["One message instead of six, and no calls during work hours."],
  desiredOutcome: "To not feel monitored at work.",
  recurring: true,
  uncertainties: [],
  language: "en",
  tone: "neutral",
  conflictTypes: ["COMMUNICATION_FAILURE", "EXPECTATION_MISMATCH", "RECURRING_PATTERN", "BOUNDARY"],
};

const MAP: ConflictMap = {
  agreed: [
    "Both mention: a reply took several hours during a workday.",
    "Both mention: this has happened more than once recently.",
  ],
  disputed: [
    {
      topic: "What the follow-up messages meant",
      a: "She sent follow-ups out of worry.",
      b: "He experienced the follow-ups as pressure and a lack of trust.",
    },
  ],
  notEstablished: [
    'A expects: "a heads-up when busy" — was never explicitly agreed',
    'B expects: "hours of silence during work is fine" — not confirmed by A',
  ],
  aExperienced:
    'Feeling unimportant — "Long silence means I\'m not important to him."',
  bExperienced:
    'Overwhelmed — "Repeated messages mean she doesn\'t trust me to be busy."',
  hiddenDisagreement:
    "What silence actually signals — neglect, or just a busy day — and what reassurance looks like without becoming pressure.",
  sharedGround: [
    "Both want to stop this cycle repeating.",
    "Both want the other person to feel considered.",
  ],
  judgeRead:
    "I don't think you're mainly fighting about the reply. One of you reads silence as being ignored; the other reads repeated messages as pressure. The fight is about what silence means — and that was never defined.",
  conflictTypes: ["COMMUNICATION_FAILURE", "EXPECTATION_MISMATCH", "RECURRING_PATTERN", "UNMET_NEED"],
};

const RESOLUTIONS: ResolutionOption[] = [
  {
    id: "demo-opt-1",
    category: "agreement",
    title: "A simple heads-up rule",
    detail:
      "Neither of you has to change how much you text. The rule is only about signalling: when someone will be unreachable for a while, they send one short message. Silence then means 'busy', not 'ignoring'.",
    aWill: "Assume silence means busy — ask before assuming intention.",
    bWill: "Send a short heads-up when unavailable for several hours.",
  },
  {
    id: "demo-opt-2",
    category: "experiment",
    title: "One-week experiment: check-in times",
    detail:
      "For one week: a short morning and evening check-in, and freedom in between. Review after a week — keep it, adjust it, or drop it.",
    aWill: "Hold to the two check-ins without spiralling in between.",
    bWill: "Actually send the two check-ins, not just when convenient.",
  },
  {
    id: "demo-opt-3",
    category: "clarify",
    title: "Say what silence means, once",
    detail:
      "One honest exchange, no arguing: A explains what waiting feels like; B explains what pressure feels like. No fix required yet — just both hearing it.",
    aWill: "Describe the feeling without accusing.",
    bWill: "Hear it without defending for one minute.",
  },
];

export async function GET() {
  const code = generateSessionCode();
  const session = await prisma.session.create({
    data: {
      code,
      title: "The Reply Delay",
      relationship: "couple",
      mode: "pair",
      status: "resolution",
      tone: "neutral",
      map: JSON.stringify(MAP),
      resolutions: JSON.stringify(RESOLUTIONS),
      votes: "{}",
      mapFeedback: "{}",
      participants: {
        create: [
          {
            side: "A",
            token: generateToken(),
            displayName: "Asha",
            stage: "done",
            perspective: JSON.stringify(A),
            predictions: JSON.stringify({
              upsetAbout: "That I take hours to reply.",
              wantedFromYou: "Patience — and trust that work is work.",
              theirFeeling: "Ignored.",
            }),
          },
          {
            side: "B",
            token: generateToken(),
            displayName: "Nabil",
            stage: "done",
            perspective: JSON.stringify(B),
            predictions: JSON.stringify({
              upsetAbout: "That work comes before her.",
              wantedFromYou: "Instant replies.",
              theirFeeling: "Angry.",
            }),
          },
        ],
      },
    },
    include: { participants: true },
  });

  const a = session.participants.find((p) => p.side === "A")!;

  // Seed A's private room so the demo has real chat history behind it.
  const aChat: [string, string, string[] | null | undefined][] = [
    ["judge", "Alright. Tell me what happened — your version. Don't worry about making it sound nice.", null],
    ["user", "He ignores my messages for hours and then replies like nothing happened. It's been happening a lot lately.", null],
    ["judge", 'Okay — "he ignores my messages for hours." Quick check — what bothered you more: what he did, or what you think it meant?', ["What he did, mostly", "What I think it meant", "Honestly, both"]],
    ["user", "What it meant, honestly. Silence for hours makes me feel like I'm not important.", null],
    ["judge", "What did you want him to do instead — concretely?", undefined],
    ["user", "A quick reply, or just a heads-up when he's busy. That's all.", null],
    ["judge", "Is this the first time, or is this a rerun?", ["First time", "It's a rerun"]],
    ["user", "Rerun. Every few weeks, same movie.", null],
    ["judge", "Last one — what would actually make this feel resolved to you?", undefined],
    ["user", "To stop spiralling every time the reply takes hours.", null],
    ["judge", "Okay — I think I've got your side. Let me read it back before we go anywhere else.", null],
  ];
  for (const [role, content, chips] of aChat) {
    await prisma.message.create({
      data: { sessionId: session.id, participantId: a.id, role, content, chips: chips ? JSON.stringify(chips) : null },
    });
  }

  return NextResponse.json({ code: session.code, token: a.token });
}
