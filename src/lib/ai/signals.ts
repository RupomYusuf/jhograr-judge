import type { Lang, Tone, ConflictType } from "@/lib/types";

// ---------- Language detection ----------

const BANGLA_RE = /[\u0980-\u09FF]/;

const BANGLISH_MARKERS = [
  "amar", "tor", "tomar", "tumi", "tui", "apni", "kore", "koreche", "keno",
  "bujhi", "bujhen", "valo", "bhalo", "kotha", "jhogra", "jhagdra", "dey",
  "dao", "nai", "nei", "hoise", "hoyeche", "chilo", "korche", "korlo",
  "amake", "take", "tomake", "ekhon", "pore", "agey", "kothao", "kichu",
  "bole", "bollo", "bolbe", "seen", "koro", "koris", "hobe", "hoy",
  "mane", "kintu", "ar ", "sei", "ei ", "oy", "achha", "accha",
];

export function detectLanguage(text: string): Lang {
  if (BANGLA_RE.test(text)) return "bn";
  const lower = " " + text.toLowerCase() + " ";
  let hits = 0;
  for (const m of BANGLISH_MARKERS) if (lower.includes(m)) hits++;
  return hits >= 2 ? "banglish" : "en";
}

// ---------- Tone detection ----------

const LIGHT_SIGNALS = [
  "pizza", "pineapple", "food", "dish", "dishes", "chocolate", "game",
  "netflix", "remote", "ac ", "fan", "mango", "biryani", "joke", "lol",
  "silly", "dumb fight", "stupid fight", "choto", "moja",
];

const HEAVY_SIGNALS = [
  "grief", "died", "death", "funeral", "cheat", "cheating", "affair",
  "divorce", "betray", "depressed", "can't take", "cant take", "done with",
  "hate you", "hates me", "scared", "afraid", "threat", "hit", "hurt me",
];

export function detectTone(text: string): Tone {
  const lower = text.toLowerCase();
  for (const h of HEAVY_SIGNALS) if (lower.includes(h)) return "serious";
  const capsWords = text.match(/\b[A-Z]{4,}\b/g)?.length ?? 0;
  const bangs = (text.match(/!{2,}/g)?.length ?? 0);
  if (capsWords + bangs >= 3) return "serious";
  for (const l of LIGHT_SIGNALS) if (lower.includes(l)) return "light";
  return "neutral";
}

// ---------- Safety screening (mandatory, runs on every user message) ----------

const SAFETY_PATTERNS: { re: RegExp; note: string }[] = [
  { re: /\b(kill(ed|s)?|murder|choke|strangl|beat(s|ing|en)? me|hits? me|hurts? me physically|slapped|punch(ed|es)?)\b/i, note: "physical violence" },
  { re: /\b(threaten(s|ed|ing)? (me|to)|will hurt (me|you)|i('| a)?m scared of (him|her|them|my (husband|wife|partner|boyfriend|girlfriend|ex)))\b/i, note: "threats / fear" },
  { re: /\b(blackmail|leak(s|ed)? (my|those) (photos|pics|nudes)|share(s|d)? my private (photos|pics)|threatens? to tell)\b/i, note: "blackmail / coercion" },
  { re: /\b(follows? me|tracks? my (phone|location)|checks? my phone|reads? my (messages|chats)|wont let me|won't let me|doesn'?t let me (go out|see|meet)|for(bid|ces?|cing) me)\b/i, note: "controlling behaviour / monitoring" },
  { re: /\b(forced|raped|assault(ed)?|touch(es|ed) me)\b/i, note: "sexual coercion / assault" },
  { re: /\b(i('| a)?m afraid (he|she|they) will|afraid to (go home|disagree|say no))\b/i, note: "fear of retaliation" },
];

export function safetyScreen(text: string): { flagged: boolean; note?: string } {
  for (const p of SAFETY_PATTERNS) {
    if (p.re.test(text)) return { flagged: true, note: p.note };
  }
  return { flagged: false };
}

// ---------- Conflict type classification ----------

const TYPE_SIGNALS: { types: ConflictType[]; re: RegExp }[] = [
  { types: ["MISUNDERSTANDING"], re: /\b(thought (you|she|he|they) (said|meant)|misunderstood|got (it|me) wrong|didn'?t mean|not what i meant|mix[- ]?up|assumed)\b/i },
  { types: ["EXPECTATION_MISMATCH", "TIME"], re: /\b(late|lateness|cancel(l?ed)?|plans? chang|on time|waiting|an hour|hours late|never showed)\b/i },
  { types: ["COMMUNICATION_FAILURE", "EXPECTATION_MISMATCH"], re: /\b(seen|seen-?zone|left (me )?on (read|seen)|no reply|didn'?t reply|not replying|ignores? my (msg|message|text)s?|ghost(ed|ing)?|reply|texted|respond)\b/i },
  { types: ["BROKEN_PROMISE", "RESPONSIBILITY"], re: /\b(forgot|forgotten|anniversary|birthday|promised|promise|forgot to|didn'?t show)\b/i },
  { types: ["HOUSEHOLD", "FAIRNESS", "RECIPROCITY"], re: /\b(dish(es)?|laundry|chores?|clean(ing)?|house ?work|trash|garbage|mess)\b/i },
  { types: ["MONEY"], re: /\b(money|rent|bill(s)?|expensive|spend(ing)?|salary|taka|loan|budget)\b/i },
  { types: ["TRUST", "JEALOUSY"], re: /\b(jealous|ex[- ]?(girlfriend|boyfriend|partner)|lied|lying|lie|trust|suspicious|hid(den)?|secret(ive)?)\b/i },
  { types: ["RECURRING_PATTERN"], re: /\b(always|never|every time|again and again|each time|har bar|sob somoy)\b/i },
  { types: ["FAMILY_INTERFERENCE"], re: /\b(mother[- ]?in[- ]?law|father[- ]?in[- ]?law|in[- ]?laws?|my mom|his mom|her mom|my dad|his dad|her dad|family (says|said|interferes)|boudi|sasuri|shoshur)\b/i },
  { types: ["BOUNDARY", "AUTONOMY" as ConflictType], re: /\b(boundary|privacy|my space|personal space|need space|stop going through|my stuff)\b/i },
  { types: ["FAIRNESS"], re: /\b(unfair|one[- ]?sided|only i|why should i|not fair|double standard)\b/i },
  { types: ["UNMET_NEED"], re: /\b(doesn'?t care|don'?t care|doesn'?t love|unimportant|not important|taken for granted|neglect(ed)?|lonely)\b/i },
  { types: ["REPAIR_FAILURE"], re: /\b(sorry (but|you)|never apologi[sz]es|acts? like nothing happened|pretends? nothing|no apology)\b/i },
];

export function classifyConflict(text: string): ConflictType[] {
  const found: ConflictType[] = [];
  for (const s of TYPE_SIGNALS) {
    if (s.re.test(text)) {
      for (const t of s.types) {
        if (t !== ("AUTONOMY" as ConflictType) && !found.includes(t)) found.push(t);
      }
    }
  }
  if (found.length === 0) found.push("OTHER");
  return found.slice(0, 4);
}

// ---------- Emotion / need lexicons (used for structured extraction) ----------

export const EMOTION_LEXICON: [RegExp, string][] = [
  [/\b(hurt|hurtful)\b/i, "hurt"],
  [/\b(angry|mad|furious|rage)\b/i, "angry"],
  [/\b(worried|anxious|panic|scared)\b/i, "anxious"],
  [/\b(ignored|invisible|unimportant|nobody)\b/i, "feeling unimportant"],
  [/\b(embarrass(ed|ing)|humiliated|ashamed)\b/i, "embarrassed"],
  [/\b(frustrat(ed|ing)|fed up|annoyed)\b/i, "frustrated"],
  [/\b(sad|upset|crying|cried|tears)\b/i, "sad"],
  [/\b(betrayed|backstab|cheated on)\b/i, "betrayed"],
  [/\b(unfair|unfairly)\b/i, "feeling it was unfair"],
  [/\b(guilty|bad about)\b/i, "guilty"],
  [/\b(overwhelm(ed|ing)|pressure|pressured|suffocat)\b/i, "overwhelmed"],
  [/\b(disrespect(ed|ful)|insult(ed)?)\b/i, "disrespected"],
];

export const NEED_BY_EMOTION: Record<string, string> = {
  hurt: "to feel considered",
  angry: "to be taken seriously",
  anxious: "reassurance and predictability",
  "feeling unimportant": "to feel like a priority",
  embarrassed: "acknowledgment of the impact",
  frustrated: "things to actually change",
  sad: "warmth and acknowledgment",
  betrayed: "honesty and transparency",
  "feeling it was unfair": "fairness in how effort is shared",
  guilty: "a way to make things right",
  overwhelmed: "space and flexibility",
  disrespected: "basic respect in how you speak to each other",
};

/** Deterministic pseudo-random pick so the mock AI varies but stays testable. */
export function pick<T>(arr: T[], seed: string | number): T {
  const s = typeof seed === "number" ? seed : [...seed].reduce((a, c) => a + c.charCodeAt(0), 0);
  return arr[Math.abs(s) % arr.length];
}
