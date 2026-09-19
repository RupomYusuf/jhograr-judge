// Core domain types for Jhograr Judge.
// The structured layer powers the reasoning engine — never rendered raw to users.

export type RelationshipType =
  | "couple"
  | "friends"
  | "siblings"
  | "family"
  | "roommates"
  | "other";

export type Mode = "pair" | "solo" | "sayit";

export type Lang = "en" | "bn" | "banglish";
export type Tone = "light" | "neutral" | "serious";

export type ConflictType =
  | "MISUNDERSTANDING"
  | "FACTUAL_DISAGREEMENT"
  | "INTENTION_DISAGREEMENT"
  | "EXPECTATION_MISMATCH"
  | "COMMUNICATION_FAILURE"
  | "FAIRNESS"
  | "RESPONSIBILITY"
  | "TRUST"
  | "JEALOUSY"
  | "PRIORITIES"
  | "RECIPROCITY"
  | "BOUNDARY"
  | "TIME"
  | "MONEY"
  | "HOUSEHOLD"
  | "FAMILY_INTERFERENCE"
  | "PRIVACY"
  | "BROKEN_PROMISE"
  | "UNMET_NEED"
  | "VALUE_DIFFERENCE"
  | "RECURRING_PATTERN"
  | "REPAIR_FAILURE"
  | "OTHER";

export type SessionStatus =
  | "waiting" // A created, B not joined yet (pair mode)
  | "intake" // shared stage: private conversations happening
  | "map" // shared map available
  | "resolution"
  | "agreement"
  | "followup"
  | "closed"
  | "safety"; // ordinary joint mediation locked

export type ParticipantStage =
  | "chat"
  | "confirm"
  | "predict"
  | "done"
  | "safe_exit";

/** What Judge believes one participant's side is — always human-confirmed before sharing. */
export interface StructuredPerspective {
  summary: string;
  events: string[];
  claims: string[];
  interpretations: string[];
  emotions: string[];
  needs: string[];
  expectations: string[];
  requests: string[];
  desiredOutcome: string;
  recurring: boolean;
  corrections?: string[];
  uncertainties: string[];
  language: Lang;
  tone: Tone;
  conflictTypes: ConflictType[];
}

export interface PerspectivePrediction {
  upsetAbout: string;
  wantedFromYou: string;
  theirFeeling: string;
}

export interface ConflictMap {
  agreed: string[];
  disputed: { topic: string; a: string; b: string }[];
  notEstablished: string[];
  aExperienced: string;
  bExperienced: string;
  hiddenDisagreement: string;
  sharedGround: string[];
  judgeRead: string;
  conflictTypes: ConflictType[];
  rebuilt?: number;
}

export type ResolutionCategory =
  | "clarify"
  | "acknowledge"
  | "apologize"
  | "compromise"
  | "agreement"
  | "boundary"
  | "experiment"
  | "space"
  | "accept_difference"
  | "escalate";

export interface ResolutionOption {
  id: string;
  category: ResolutionCategory;
  title: string;
  detail: string;
  aWill: string;
  bWill: string;
}

export type Stance = "works" | "changes" | "no";

export interface Agreement {
  headline: string;
  figuredOut: string;
  aWill: string;
  bWill: string;
  ifAgain: string;
  playfullyNamed: boolean;
}

export interface FollowUpResult {
  result: "held" | "mostly" | "failed" | "untested";
  reason?: string;
  at: string;
}

export interface ChatTurn {
  role: "user" | "judge";
  content: string;
  chips?: string[];
}

export interface AIReply {
  message: string;
  chips?: string[];
  done?: boolean;
}

export interface IntakeCtx {
  relationship: RelationshipType;
  side: "A" | "B";
  title?: string;
}

export type SafetyScreenResult = {
  flagged: boolean;
  note?: string;
};

/**
 * Provider abstraction — swap MockConflictAIProvider for a live LLM provider
 * without touching product code.
 */
// Methods may be sync (mock) or async (live); callers always await.
export interface AIProvider {
  readonly name: string;
  greeting(ctx: IntakeCtx): AIReply | Promise<AIReply>;
  reply(
    ctx: IntakeCtx,
    history: ChatTurn[],
    userMessage: string,
  ): AIReply | Promise<AIReply>;
  draftPerspective(
    ctx: IntakeCtx,
    history: ChatTurn[],
  ): StructuredPerspective | Promise<StructuredPerspective>;
  applyCorrection(
    p: StructuredPerspective,
    correction: string,
  ): StructuredPerspective | Promise<StructuredPerspective>;
  buildMap(
    ctx: IntakeCtx,
    a: StructuredPerspective,
    b: StructuredPerspective,
  ): ConflictMap | Promise<ConflictMap>;
  buildResolutions(
    ctx: IntakeCtx,
    a: StructuredPerspective,
    b: StructuredPerspective,
    map: ConflictMap,
    constraints?: string,
  ): ResolutionOption[] | Promise<ResolutionOption[]>;
  draftAgreement(
    ctx: IntakeCtx,
    option: ResolutionOption,
    map: ConflictMap,
  ): Agreement | Promise<Agreement>;
  reflectSolo(history: ChatTurn[], userMessage: string): AIReply | Promise<AIReply>;
  draftSoloSummary(history: ChatTurn[]): {
    known: string[];
    unknown: string[];
    interpretation: string;
    feeling: string;
    suggestedAsk: string;
  } | Promise<{
    known: string[];
    unknown: string[];
    interpretation: string;
    feeling: string;
    suggestedAsk: string;
  }>;
  rewrite(
    input: string,
    tone: "clearer" | "firmer" | "softer" | "shorter",
  ): string | Promise<string>;
  safetyScreen(text: string): SafetyScreenResult;
}
