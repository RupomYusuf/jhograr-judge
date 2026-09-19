"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  Chip,
  Field,
  JudgeMark,
  SectionLabel,
  Spinner,
} from "@/components/ui";
import { useSession, type SessionState } from "@/lib/client";
import type { ResolutionOption } from "@/lib/types";

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-2xl px-4 pb-28 sm:px-6">{children}</main>;
}

function Header({
  state,
  onRename,
}: {
  state: SessionState;
  onRename: (title: string) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(state.session.title);

  return (
    <header className="flex items-center justify-between gap-3 py-4">
      <Link href="/" className="font-display text-lg text-ink-soft transition-colors hover:text-ink">
        ← Jhograr Judge
      </Link>
      <div className="flex items-center gap-2 text-sm text-ink-soft">
        {editing ? (
          <input
            value={title}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              if (title.trim()) void onRename(title.trim());
              setEditing(false);
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="w-40 rounded-full border border-line bg-card px-3 py-1 text-sm focus:border-terra"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="max-w-44 truncate font-medium text-ink transition-colors hover:text-terra-deep"
            title="Rename"
          >
            {state.session.title} <span className="text-ink-soft/60">✎</span>
          </button>
        )}
        <span
          className={`rounded-full px-2.5 py-1 text-xs ${
            state.session.status === "safety"
              ? "bg-terra/10 text-terra-deep"
              : "bg-sage/10 text-sage"
          }`}
        >
          {state.session.mode === "solo"
            ? "Solo"
            : state.session.status === "waiting"
              ? "Waiting for the other side"
              : state.session.status === "closed"
                ? "Closed"
                : "In progress"}
        </span>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Waiting room (A, before B joins)
// ---------------------------------------------------------------------------

function WaitingRoom({ state }: { state: SessionState }) {
  const [copied, setCopied] = useState<"link" | "msg" | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const inviteUrl = `${origin}/join/${state.session.code}`;
  const inviteMsg = `Someone wants to sort something out with you.\n\nYou'll each get a private space first. Jhograr Judge won't show your raw answers to the other person and won't automatically decide who's right. The goal is to understand what happened and find a way forward.\n\n${inviteUrl}`;

  function copy(what: "link" | "msg") {
    void navigator.clipboard.writeText(what === "link" ? inviteUrl : inviteMsg);
    setCopied(what);
    setTimeout(() => setCopied(null), 1600);
  }

  return (
    <Card className="animate-rise">
      <SectionLabel>Invite the other side</SectionLabel>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        Send them this link. No account needed — one tap and they&apos;re in
        their own private room.
      </p>
      <div className="mt-4 rounded-2xl border border-dashed border-line bg-cream px-4 py-3 font-mono text-sm">
        {inviteUrl}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="ghost" onClick={() => copy("link")}>
          {copied === "link" ? "Copied ✓" : "Copy link"}
        </Button>
        <Button variant="ghost" onClick={() => copy("msg")}>
          {copied === "msg" ? "Copied ✓" : "Copy invite message"}
        </Button>
      </div>
      <p className="mt-4 text-xs text-ink-soft">
        Meanwhile — start your own side below. They never see this conversation.
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Private chat (intake)
// ---------------------------------------------------------------------------

function ChatStage({ state }: { state: SessionState }) {
  const { act } = useSession(state.session.code);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.messages.length, busy]);

  // auto-grow input up to ~6 lines
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
  }, [draft]);

  async function send(text?: string) {
    const content = (text ?? draft).trim();
    if (!content || busy) return;
    setDraft("");
    setBusy(true);
    await act({ type: "chat", content });
    setBusy(false);
  }

  return (
    <div>
      <div className="flex flex-col gap-3 py-2">
        {state.messages.map((m, i) => (
          <div
            key={i}
            className={`anim-pop flex gap-2.5 ${m.role === "user" ? "justify-end" : ""}`}
            style={{ animationDelay: `${Math.min(i * 0.05, 0.4)}s` }}
          >
            {m.role === "judge" ? <JudgeMark /> : null}
            <div className="max-w-[80%]">
              <div
                className={`px-4 py-3 text-[15px] leading-relaxed ${m.role === "user" ? "bubble-user" : "bubble-judge"}`}
              >
                {m.content}
              </div>
              {m.role === "judge" && m.chips && m.chips.length > 0 && i === state.messages.length - 1 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {m.chips.map((c, ci) => (
                    <span key={c} className="anim-pop" style={{ animationDelay: `${0.25 + ci * 0.09}s` }}>
                      <Chip onClick={() => void send(c)} disabled={busy}>
                        {c}
                      </Chip>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}
        {busy ? (
          <div className="anim-pop flex gap-2.5">
            <JudgeMark thinking />
            <div className="bubble-judge flex items-center gap-1.5 px-4 py-4">
              {[0, 1, 2].map((i) => (
                <span key={i} className="typing-dot" style={{ animationDelay: `${i * 0.18}s` }} />
              ))}
            </div>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-4 mt-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="flex items-end gap-2 rounded-[24px] border border-line bg-card p-1.5 pl-5 shadow-[0_4px_24px_rgba(43,37,33,0.10)] transition-shadow focus-within:shadow-[0_6px_28px_rgba(192,91,59,0.16)]"
        >
          <textarea
            ref={taRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder="Type it however it comes out…"
            className="max-h-[140px] flex-1 resize-none self-center bg-transparent py-2.5 text-[15px] placeholder:text-ink-soft/50"
          />
          <button
            type="submit"
            disabled={!draft.trim() || busy}
            aria-label="Send"
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg transition-all duration-200 ${
              draft.trim() && !busy
                ? "scale-100 bg-terra text-white shadow-[0_2px_10px_rgba(192,91,59,0.3)] hover:scale-105 hover:bg-terra-deep"
                : "scale-95 bg-cream-deep text-ink-soft/40"
            }`}
          >
            ↑
          </button>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Perspective confirmation (readback)
// ---------------------------------------------------------------------------

function ConfirmStage({ state }: { state: SessionState }) {
  const { act } = useSession(state.session.code);
  const [fixing, setFixing] = useState(false);
  const [fixText, setFixText] = useState("");
  const [busy, setBusy] = useState(false);
  const p = state.me.perspective;
  if (!p) return null;
  const solo = state.session.mode === "solo";

  async function submit(verdict: "yes" | "fix", text?: string) {
    setBusy(true);
    await act({ type: "confirm", verdict, text });
    setBusy(false);
    setFixing(false);
    setFixText("");
  }

  return (
    <Card className="animate-rise">
      <SectionLabel>{solo ? "What I understood" : "Before anything else — did I get your side right?"}</SectionLabel>
      <p className="mt-3 text-[15px] leading-relaxed">{p.summary}</p>
      {p.events.length > 0 ? (
        <div className="mt-4">
          <p className="text-sm font-medium text-ink-soft">What happened, as you told it</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-ink-soft">
            {p.events.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {p.interpretations.length > 0 ? (
        <div className="mt-4">
          <p className="text-sm font-medium text-ink-soft">What you think it meant</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-ink-soft">
            {p.interpretations.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-ink-soft/70">
            I&apos;ll keep this separate from facts — it&apos;s your read, and it matters.
          </p>
        </div>
      ) : null}
      {p.needs.length > 0 ? (
        <div className="mt-4">
          <p className="text-sm font-medium text-ink-soft">What seems to matter underneath</p>
          <p className="mt-1.5 text-sm text-ink-soft">{p.needs.join(" · ")}</p>
        </div>
      ) : null}

      {fixing ? (
        <div className="mt-5 space-y-3">
          <Field
            label="What should I change?"
            value={fixText}
            onChange={setFixText}
            multiline
            placeholder="e.g. It wasn't the first time, it was the third…"
          />
          <Button disabled={!fixText.trim() || busy} onClick={() => void submit("fix", fixText)}>
            Update it
          </Button>
        </div>
      ) : (
        <div className="mt-6 flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void submit("yes")}>
            {solo ? "That's it" : "That's my side"}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setFixing(true)}>
            Not quite — let me fix
          </Button>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Perspective prediction — the signature moment setup
// ---------------------------------------------------------------------------

function PredictStage({ state }: { state: SessionState }) {
  const { act } = useSession(state.session.code);
  const [upsetAbout, setUpsetAbout] = useState("");
  const [wantedFromYou, setWantedFromYou] = useState("");
  const [theirFeeling, setTheirFeeling] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = upsetAbout.trim() && wantedFromYou.trim() && theirFeeling.trim();

  return (
    <div className="space-y-4">
      <Card className="animate-rise border-sage/40">
        <p className="text-[15px] leading-relaxed">
          Good — your side is locked in. Before we put the two together:
          <span className="font-medium"> what do you think is going on in their head?</span>{" "}
          I&apos;ll keep this private. Later, we&apos;ll compare it with what they
          actually said.
        </p>
      </Card>
      <Card className="animate-fade space-y-4">
        <Field label="What do you think they're upset about?" value={upsetAbout} onChange={setUpsetAbout} multiline />
        <Field label="What do you think they wanted from you?" value={wantedFromYou} onChange={setWantedFromYou} multiline />
        <Field label="How do you think they felt?" value={theirFeeling} onChange={setTheirFeeling} />
        <Button
          disabled={!ready || busy}
          onClick={async () => {
            setBusy(true);
            await act({ type: "predict", upsetAbout, wantedFromYou, theirFeeling });
            setBusy(false);
          }}
        >
          {busy ? "Locking it in…" : "Done — I'm ready"}
        </Button>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared Jhogra Map
// ---------------------------------------------------------------------------

function MapSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function MapStage({ state }: { state: SessionState }) {
  const { act } = useSession(state.session.code);
  const [, setVerdict] = useState<"yes" | "almost" | "no" | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const map = state.map;
  if (!map) return null;

  const myVerdict = state.mapFeedback[state.me.side];
  const partnerVerdict = state.mapFeedback[state.me.side === "A" ? "B" : "A"];
  const showForm = !myVerdict;

  async function submit(v: "yes" | "almost" | "no", withNote?: string) {
    setBusy(true);
    setVerdict(v);
    await act({ type: "map_feedback", verdict: v, note: withNote || undefined });
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <Card className="stagger space-y-5">
        <div>
          <h2 className="font-display text-3xl">The Jhogra</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Both sides confirmed. Your raw words stay private — this is only
            what you each agreed is true.
          </p>
        </div>

        {map.agreed.length > 0 ? (
          <MapSection label="What you agree happened">
            <ul className="space-y-1.5">
              {map.agreed.map((a, i) => (
                <li key={i} className="flex gap-2 text-[15px]">
                  <span className="text-sage">✓</span>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </MapSection>
        ) : null}

        {map.disputed.length > 0 ? (
          <MapSection label="Where the stories differ">
            <div className="space-y-3">
              {map.disputed.map((d, i) => (
                <div key={i} className="grid gap-2 rounded-2xl bg-cream p-3 text-sm sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-terra-deep">Side A remembers</p>
                    {d.a}
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Side B remembers</p>
                    {d.b}
                  </div>
                </div>
              ))}
            </div>
          </MapSection>
        ) : null}

        {map.notEstablished.length > 0 ? (
          <MapSection label="Not established — nobody's word against the other's">
            <ul className="space-y-1 text-sm text-ink-soft">
              {map.notEstablished.map((n, i) => (
                <li key={i}>• {n}</li>
              ))}
            </ul>
          </MapSection>
        ) : null}

        <MapSection label="What each person experienced">
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="rounded-2xl bg-cream p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-terra-deep">A</p>
              {map.aExperienced}
            </div>
            <div className="rounded-2xl bg-cream p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">B</p>
              {map.bExperienced}
            </div>
          </div>
        </MapSection>

        <MapSection label="The hidden disagreement">
          <p className="font-display text-xl leading-snug">{map.hiddenDisagreement}</p>
        </MapSection>

        {map.sharedGround.length > 0 ? (
          <MapSection label="What you actually agree on">
            <p className="text-sm text-ink-soft">
              {map.sharedGround.map((s) => s.replace(/^Both (need|want): /, "")).join(" · ")}
            </p>
          </MapSection>
        ) : null}

        <div className="rounded-2xl border border-terra/30 bg-terra/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-terra-deep">Judge&apos;s read</p>
          <p className="mt-2 text-[15px] leading-relaxed">{map.judgeRead}</p>
        </div>
      </Card>

      {showForm ? (
        <Card className="animate-fade">
          <SectionLabel>Is this map accurate?</SectionLabel>
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip onClick={() => void submit("yes")}>Yep, that&apos;s it</Chip>
            <Chip onClick={() => void submit("almost")}>Almost</Chip>
            <Chip onClick={() => void submit("no")}>Nope</Chip>
          </div>
        </Card>
      ) : myVerdict !== "yes" && !note ? (
        <Card>
          <Field
            label="What should I fix before we move on?"
            value={note}
            onChange={setNote}
            multiline
          />
          <div className="mt-3">
            <Button disabled={!note.trim() || busy} onClick={() => void submit(myVerdict as "almost" | "no", note)}>
              Send correction
            </Button>
          </div>
        </Card>
      ) : null}

      {myVerdict ? (
        <Card className="border-dashed">
          <p className="text-sm text-ink-soft">
            {myVerdict === "yes"
              ? "You confirmed the map."
              : "You asked for a correction."}{" "}
            {partnerVerdict
              ? "Both of you have checked in — moving on."
              : "Waiting for the other side to look it over…"}
          </p>
        </Card>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resolution options + voting
// ---------------------------------------------------------------------------

const CATEGORY_LABEL: Record<string, string> = {
  clarify: "Clarify",
  acknowledge: "Acknowledge",
  apologize: "Apologize",
  compromise: "Compromise",
  agreement: "Agreement",
  boundary: "Boundary",
  experiment: "Experiment",
  space: "Take space",
  accept_difference: "Accept difference",
  escalate: "Outside support",
};

function ResolutionStage({ state }: { state: SessionState }) {
  const { act } = useSession(state.session.code);
  const [busy, setBusy] = useState(false);
  const [constraintText, setConstraintText] = useState("");

  const myVote = state.votes[state.me.side];
  const partnerVote = state.votes[state.me.side === "A" ? "B" : "A"];
  const bothVoted = Boolean(myVote && partnerVote);

  async function vote(optionId: string, stance: "works" | "changes" | "no") {
    setBusy(true);
    await act({ type: "vote", optionId, stance });
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      {state.noOverlap ? (
        <Card className="animate-rise border-terra/40">
          <p className="font-display text-xl">Hmm. No shared option yet.</p>
          <p className="mt-2 text-sm text-ink-soft">
            Let&apos;s figure out what makes each option unacceptable — I&apos;ll
            build a new set from that.
          </p>
          <div className="mt-4">
            <Field
              label="What made those options not workable?"
              value={constraintText}
              onChange={setConstraintText}
              multiline
              placeholder="e.g. Fixed check-in times feel like a chore; I'd rather it be about heads-ups only…"
            />
            <div className="mt-3">
              <Button
                disabled={!constraintText.trim() || busy}
                onClick={async () => {
                  setBusy(true);
                  await act({ type: "constraints", text: constraintText });
                  setBusy(false);
                }}
              >
                Try again with that
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <>
          <Card className="animate-rise border-sage/40">
            <p className="text-[15px] leading-relaxed">
              Based on both sides, here are {state.resolutions.length} realistic
              paths. Each of you picks privately — I&apos;ll find the overlap.
            </p>
          </Card>
          {state.resolutions.map((o: ResolutionOption, i) => (
            <Card key={o.id} className={`animate-rise ${myVote?.optionId === o.id ? "border-terra/50" : ""}`} style={{ animationDelay: `${i * 60}ms` }}>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-cream px-2.5 py-1 text-xs font-semibold text-terra-deep">
                  {CATEGORY_LABEL[o.category] ?? o.category}
                </span>
                {myVote?.optionId === o.id ? (
                  <span className="text-xs text-sage">your pick</span>
                ) : null}
              </div>
              <p className="mt-2 font-display text-xl">{o.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{o.detail}</p>
              <div className="mt-3 grid gap-2 rounded-2xl bg-cream p-3 text-sm sm:grid-cols-2">
                <div>
                  <span className="font-medium">A will:</span> {o.aWill}
                </div>
                <div>
                  <span className="font-medium">B will:</span> {o.bWill}
                </div>
              </div>
              {!myVote ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Chip onClick={() => void vote(o.id, "works")} disabled={busy}>
                    Works for me
                  </Chip>
                  <Chip onClick={() => void vote(o.id, "changes")} disabled={busy}>
                    Could work with changes
                  </Chip>
                  <Chip onClick={() => void vote(o.id, "no")} disabled={busy}>
                    Doesn&apos;t work
                  </Chip>
                </div>
              ) : null}
            </Card>
          ))}
          {myVote && !bothVoted ? (
            <Card className="border-dashed">
              <p className="text-sm text-ink-soft">
                Your pick is in. Waiting for the other side…
              </p>
            </Card>
          ) : null}
          {bothVoted ? (
            <Card>
              <p className="text-sm text-ink-soft">
                {state.session.status === "agreement"
                  ? "You two landed on the same path — putting it together."
                  : "Both picks are in. Working out the overlap…"}
              </p>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agreement
// ---------------------------------------------------------------------------

function AgreementStage({ state }: { state: SessionState }) {
  const { act } = useSession(state.session.code);
  const [changing, setChanging] = useState(false);
  const [changeNote, setChangeNote] = useState("");
  const [busy, setBusy] = useState(false);
  const a = state.agreement;
  if (!a) return null;
  const myVerdict = state.agreementVotes[state.me.side]?.verdict;
  const partnerVerdict = state.agreementVotes[state.me.side === "A" ? "B" : "A"]?.verdict;

  return (
    <div className="space-y-4">
      <Card className="animate-rise">
        <h2 className="font-display text-3xl">{a.headline}{a.playfullyNamed ? <span className="anim-stamp ml-3 inline-block">🤝</span> : null}</h2>
        <div className="mt-4 space-y-4 text-[15px] leading-relaxed">
          <div>
            <SectionLabel>We figured out</SectionLabel>
            <p className="mt-1.5 whitespace-pre-line text-ink-soft">{a.figuredOut}</p>
          </div>
          <div>
            <SectionLabel>A will</SectionLabel>
            <p className="mt-1.5 text-ink-soft">{a.aWill}</p>
          </div>
          <div>
            <SectionLabel>B will</SectionLabel>
            <p className="mt-1.5 text-ink-soft">{a.bWill}</p>
          </div>
          <div>
            <SectionLabel>If it happens again</SectionLabel>
            <p className="mt-1.5 text-ink-soft">{a.ifAgain}</p>
          </div>
        </div>
      </Card>

      {!myVerdict ? (
        changing ? (
          <Card>
            <Field label="What needs to change?" value={changeNote} onChange={setChangeNote} multiline />
            <div className="mt-3 flex gap-2">
              <Button
                disabled={!changeNote.trim() || busy}
                onClick={async () => {
                  setBusy(true);
                  await act({ type: "agreement_verdict", verdict: "change", note: changeNote });
                  setBusy(false);
                }}
              >
                Send the change
              </Button>
              <Button variant="quiet" onClick={() => setChanging(false)}>
                Back
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="animate-fade">
            <SectionLabel>Do you accept this?</SectionLabel>
            <div className="mt-3 flex flex-wrap gap-2">
              <Chip onClick={async () => { setBusy(true); await act({ type: "agreement_verdict", verdict: "agree" }); setBusy(false); }}>
                I agree
              </Chip>
              <Chip onClick={() => setChanging(true)}>Needs change</Chip>
              <Chip onClick={async () => { setBusy(true); await act({ type: "agreement_verdict", verdict: "notready" }); setBusy(false); }}>
                Not ready
              </Chip>
            </div>
          </Card>
        )
      ) : (
        <Card className="border-dashed">
          <p className="text-sm text-ink-soft">
            Your answer is in.{" "}
            {partnerVerdict
              ? "Both answered — closing this out."
              : "Waiting for the other side…"}
          </p>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Follow-up
// ---------------------------------------------------------------------------

function FollowUpStage({ state }: { state: SessionState }) {
  const { act } = useSession(state.session.code);
  const [why, setWhy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (state.followUp) {
    return (
      <Card className="animate-rise text-center">
        <h2 className="font-display text-3xl">
          {state.followUp.result === "held" || state.followUp.result === "mostly"
            ? "Jhogra dismissed. ⚖️"
            : "Okay. That's honest."}
        </h2>
        <p className="mt-2 text-sm text-ink-soft">
          {state.followUp.result === "held"
            ? "Until the next episode."
            : state.followUp.result === "mostly"
              ? "Mostly holding is still holding. Check the wording if it keeps slipping."
              : state.followUp.reason === "no_agreement_chosen"
                ? "Not solved — but clearer. That's a real step."
                : "Failed agreements tell Judge something — it's noted for next time."}
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <Link href="/history"><Button variant="ghost">Your Jhogra history</Button></Link>
          <Link href="/start"><Button>Start a new one</Button></Link>
        </div>
      </Card>
    );
  }

  return (
    <Card className="animate-rise">
      <h2 className="font-display text-2xl">Judge checking in 👀</h2>
      <p className="mt-1 text-sm text-ink-soft">Did the treaty survive?</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {[
          ["held", "Yep"],
          ["mostly", "Mostly"],
          ["failed", "Nope 😭"],
          ["untested", "We haven't tested it yet"],
        ].map(([result, label]) => (
          <Chip key={result} disabled={busy} onClick={async () => {
            setBusy(true);
            if (result === "failed") { setWhy("ask"); setBusy(false); }
            else { await act({ type: "followup", result: result as "held" }); setBusy(false); }
          }}>
            {label}
          </Chip>
        ))}
      </div>
      {why === "ask" ? (
        <div className="mt-5">
          <SectionLabel>What happened?</SectionLabel>
          <div className="mt-2 flex flex-wrap gap-2">
            {["Forgot the agreement", "It was unrealistic", "One of us never truly accepted it", "Same trigger happened", "Different issue underneath"].map((r) => (
              <Chip key={r} disabled={busy} onClick={async () => {
                setBusy(true);
                await act({ type: "followup", result: "failed", reason: r });
                setBusy(false);
              }}>
                {r}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Closed / no-agreement / safety
// ---------------------------------------------------------------------------

function ClosedStage({ state }: { state: SessionState }) {
  const { act } = useSession(state.session.code);
  const noAgreement = state.followUp?.reason === "no_agreement_chosen";

  if (state.session.mode === "solo" && state.me.soloSummary) {
    const s = state.me.soloSummary;
    return (
      <div className="space-y-4">
        <Card className="animate-rise">
          <h2 className="font-display text-2xl">What you know vs. what you&apos;re assuming</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-sage/10 p-3 text-sm">
              <p className="mb-1 font-medium">Known</p>
              {s.known.map((k, i) => <p key={i}>{k}</p>)}
            </div>
            <div className="rounded-2xl bg-cream p-3 text-sm">
              <p className="mb-1 font-medium">Unknown</p>
              {s.unknown.map((k, i) => <p key={i}>• {k}</p>)}
            </div>
          </div>
          <p className="mt-4 text-sm text-ink-soft">
            <span className="font-medium text-ink">Your interpretation:</span> {s.interpretation}
            <br />
            <span className="font-medium text-ink">Your feeling:</span> {s.feeling}
          </p>
          <div className="mt-4 rounded-2xl border border-terra/30 bg-terra/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-terra-deep">You could ask</p>
            <p className="mt-1.5 text-[15px]">{s.suggestedAsk}</p>
          </div>
          <div className="mt-5 flex gap-3">
            <Link href="/start"><Button>When you&apos;re ready — solve the Jhogra together</Button></Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <Card className="animate-rise text-center">
      {noAgreement ? (
        <>
          <h2 className="font-display text-3xl">Not solved — but clearer.</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-soft">
            You understand each other&apos;s positions, but neither of you
            currently wants the same outcome. That&apos;s a valid place to be —
            no fake harmony here.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Chip onClick={async () => { await act({ type: "outcome", path: "retry" }); }}>
              Try another solution
            </Chip>
            <Chip onClick={async () => { await act({ type: "outcome", path: "space" }); }}>Take a break</Chip>
            <Chip onClick={async () => { await act({ type: "outcome", path: "agree_disagree" }); }}>Agree to disagree</Chip>
            <Chip onClick={async () => { await act({ type: "outcome", path: "support" }); }}>Get outside support</Chip>
          </div>
        </>
      ) : (
        <>
          <h2 className="font-display text-3xl">Jhogra dismissed. ⚖️</h2>
          <p className="mt-2 text-sm text-ink-soft">Until the next episode.</p>
        </>
      )}
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/history"><Button variant="ghost">Your Jhogra history</Button></Link>
      </div>
    </Card>
  );
}

function SafetyScreen() {
  return (
    <Card className="animate-rise border-terra/40">
      <h2 className="font-display text-2xl">This may not be a normal disagreement.</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-ink-soft">
        <p>
          Some situations aren&apos;t appropriate for mutual mediation —
          including ones involving threats, control, or fear. You don&apos;t
          have to continue this session.
        </p>
        <p>
          Nothing you told me will be shared with the other person.
        </p>
        <p>
          If you&apos;re in immediate danger, contact your local emergency
          number. If you can, reach someone you trust — you don&apos;t have to
          handle this alone.
        </p>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link href="/"><Button variant="ghost">Leave the session</Button></Link>
      </div>
    </Card>
  );
}

function PartnerSafetyNote() {
  return (
    <Card className="animate-rise">
      <p className="text-[15px] leading-relaxed">
        The other person isn&apos;t continuing the shared session right now.
        That&apos;s their choice, and it stays theirs.
      </p>
      <p className="mt-2 text-sm text-ink-soft">
        You can still use{" "}
        <Link href="/solo" className="underline decoration-line underline-offset-4 hover:text-terra-deep">
          Help me think
        </Link>{" "}
        or{" "}
        <Link href="/say" className="underline decoration-line underline-offset-4 hover:text-terra-deep">
          Help me say it
        </Link>{" "}
        on your own, or come back another time.
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The shell
// ---------------------------------------------------------------------------

export default function SessionClient({ code }: { code: string }) {
  const router = useRouter();
  const { state, error, act } = useSession(code);

  useEffect(() => {
    if (error === "NO_TOKEN" || error === "BAD_TOKEN") {
      router.replace(`/join/${code}`);
    }
  }, [error, code, router]);

  if (!state) {
    return (
      <Shell>
        <div className="flex min-h-screen items-center justify-center">
          {error ? <p className="text-sm text-ink-soft">{error}</p> : <Spinner label="Judge shob shuntese… 👀" />}
        </div>
      </Shell>
    );
  }

  const { session, me } = state;

  let body: React.ReactNode;
  if (me.safetyFlag) {
    body = <SafetyScreen />;
  } else if (session.status === "safety") {
    body = <PartnerSafetyNote />;
  } else if (me.stage === "chat") {
    body = (
      <div className="space-y-4">
        {session.mode === "pair" && !state.partnerJoined ? <WaitingRoom state={state} /> : null}
        <ChatStage state={state} />
      </div>
    );
  } else if (me.stage === "confirm") {
    body = <ConfirmStage state={state} />;
  } else if (me.stage === "predict") {
    body = <PredictStage state={state} />;
  } else if (me.stage === "done") {
    switch (session.status) {
      case "map":
        body = <MapStage state={state} />;
        break;
      case "resolution":
        body = <ResolutionStage state={state} />;
        break;
      case "agreement":
        body = <AgreementStage state={state} />;
        break;
      case "followup":
        body = <FollowUpStage state={state} />;
        break;
      case "closed":
        body = <ClosedStage state={state} />;
        break;
      default:
        body = (
          <Card className="border-dashed">
            <p className="text-sm text-ink-soft">
              {state.partnerJoined
                ? "The other side is still talking with Judge. I'll put the map together the moment both of you are done."
                : "Still waiting for the other side to join. Your private room is ready when they are."}
            </p>
            <p className="mt-3"><Spinner label="Judge is listening to the other side…" /></p>
          </Card>
        );
    }
  } else {
    body = <Spinner label="Loading…" />;
  }

  return (
    <Shell>
      <Header state={state} onRename={(t) => act({ type: "rename", title: t })} />
      <div key={me.stage + ":" + session.status} className="anim-fade">{body}</div>
      <p className="mt-8 text-center text-[11px] text-ink-soft/60">
        Private room · {me.side === "A" ? "Side A" : "Side B"} · nothing is shared without your confirmation
      </p>
    </Shell>
  );
}
