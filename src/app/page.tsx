"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";
import { setToken } from "@/lib/client";

// ---------- hero vignette: cycles through real conflict shapes ----------

interface Vignette {
  a: string;
  b: string;
  read: string;
  sub: string;
}

const VIGNETTES: Vignette[] = [
  {
    a: "She never listens.",
    b: "He never explains what he wants.",
    read: "Wait — you two want the same thing.",
    sub: "You're both asking to be told before plans change.",
  },
  {
    a: "Seen. At 2 PM. Nothing since.",
    b: "I was in a meeting. One text doesn't mean I stopped caring.",
    read: "You're arguing about what silence means.",
    sub: "Not about the reply itself.",
  },
  {
    a: "I always do the dishes. Always.",
    b: "You never told me it bothered you!",
    read: "Hmm. This isn't about dishes.",
    sub: "It's about effort that goes unnoticed.",
  },
];

// Rough per-character typing; keeps the loop deterministic.
const TYPE_MS = 34;
const HOLD_MS = 1500;

function useTypedVignette() {
  const [idx, setIdx] = useState(0);
  const [progress, setProgress] = useState(0); // 0..2 bubbles, 3 read
  const [chars, setChars] = useState([0, 0, 0]);

  useEffect(() => {
    const v = VIGNETTES[idx];
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const typeText = (text: string, onFinish: () => void, setN: (n: number) => void) => {
      for (let i = 1; i <= text.length; i++) {
        timers.push(setTimeout(() => !cancelled && setN(i), i * TYPE_MS));
      }
      timers.push(setTimeout(() => !cancelled && onFinish(), text.length * TYPE_MS + 350));
    };

    timers.push(
      setTimeout(() => {
        if (cancelled) return;
        setChars([0, 0, 0]);
        setProgress(1);
        typeText(v.a, () => {
          if (cancelled) return;
          setProgress(2);
          typeText(v.b, () => {
            if (cancelled) return;
            setProgress(3);
            typeText(v.read, () => {
              if (!cancelled) {
                setProgress(4);
                timers.push(
                  setTimeout(() => {
                    if (cancelled) return;
                    setProgress(0);
                    setIdx((i) => (i + 1) % VIGNETTES.length);
                  }, HOLD_MS + 2600),
                );
              }
            }, (n: number) => setChars((c) => [c[0], c[1], n]));
          }, (n: number) => setChars((c) => [c[0], n, c[2]]));
        }, (n: number) => setChars((c) => [n, c[1], c[2]]));
      }, 500),
    );

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [idx]);

  return { v: VIGNETTES[idx], progress, chars, idx };
}

function HeroDemo() {
  const { v, progress, chars, idx } = useTypedVignette();
  const showA = progress >= 1;
  const showB = progress >= 2;
  const showJudge = progress >= 3;
  const read = progress >= 4 ? v.read : v.read.slice(0, chars[2]);

  return (
    <div className="relative flex min-h-[300px] w-full max-w-md flex-col gap-3">
      {showA ? (
        <div key={idx + "a"} className="bubble-judge anim-pop max-w-[78%] self-start px-4 py-3 text-[14px]">
          {v.a.slice(0, showB ? v.a.length : chars[0])}
          {!showB && chars[0] < v.a.length ? <span className="animate-pulse">▌</span> : null}
        </div>
      ) : null}
      {showB ? (
        <div key={idx + "b"} className="anim-pop max-w-[78%] self-end bg-ink px-4 py-3 text-[14px] text-cream" style={{ borderRadius: "18px 18px 4px 18px" }}>
          {showJudge ? v.b : v.b.slice(0, chars[1])}
          {!showJudge && chars[1] < v.b.length ? <span className="animate-pulse">▌</span> : null}
        </div>
      ) : null}
      {progress < 2 ? (
        <div className="anim-fade flex items-center gap-2 pl-1 text-xs text-ink-soft">
          <span className="h-1.5 w-1.5 animate-breathe rounded-full bg-terra" />
          Judge is reading both sides…
        </div>
      ) : null}
      {showJudge ? (
        <div key={idx + "j"} className="anim-rise max-w-[88%] self-start">
          <div className="bubble-judge border-terra/40 px-4 py-3 text-[14px]">
            <span className="font-medium text-terra-deep">{read}
              {progress < 4 && chars[2] < v.read.length ? <span className="animate-pulse">▌</span> : null}
            </span>
            {progress >= 4 ? (
              <>
                <br />
                <span className="text-ink-soft">{v.sub}</span>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------- headline word-by-word ----------

function WordReveal({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  return (
    <span className={`word-reveal ${className ?? ""}`}>
      {text.split(" ").map((w, i) => (
        <span key={i} style={{ animationDelay: `${delay + i * 0.07}s` }}>
          {w}&nbsp;
        </span>
      ))}
    </span>
  );
}

const MARQUEE_ITEMS = [
  "Judge is thinking…",
  "Found the main misunderstanding.",
  "Hmm. Something isn't adding up.",
  "Plot twist: you two agree on more than you thought.",
  "Okay, this is bigger than the original issue.",
  "Peace achieved?",
  "You two actually agree on this part.",
  "Judge shob shuntese… 👀",
  "Jhogra dismissed. ⚖️",
];

export default function Landing() {
  const router = useRouter();
  const [busy, setBusy] = useState<"demo" | null>(null);

  async function openDemo() {
    setBusy("demo");
    try {
      const res = await fetch("/api/demo");
      const { code, token } = await res.json();
      setToken(code, token);
      router.push(`/session/${code}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col overflow-x-clip px-5 sm:px-8">
      {/* drifting background shapes */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="blob left-[-8%] top-[-6%] h-72 w-72 bg-terra/15" />
        <div className="blob right-[-10%] top-[22%] h-80 w-80 bg-sage/15" style={{ animationDelay: "-6s" }} />
        <div className="blob bottom-[-10%] left-[18%] h-72 w-72 bg-[#e8c9a0]/40" style={{ animationDelay: "-11s" }} />
      </div>

      {/* Nav */}
      <nav className="flex items-center justify-between py-5">
        <Link href="/" className="anim-float font-display text-lg sm:text-xl">
          Jhograr Judge <span className="text-terra">⚖</span>
        </Link>
        <div className="flex items-center gap-3 text-[13px] sm:gap-4 sm:text-sm">
          <Link href="/history" className="text-ink-soft transition-colors hover:text-ink">
            History
          </Link>
          <Link href="/start" className="text-ink transition-colors hover:text-terra-deep">
            Start a Jhogra
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="grid flex-1 grid-cols-1 items-center gap-12 py-10 md:grid-cols-2 md:py-16">
        <div className="animate-rise">
          <p className="mb-3 text-sm font-medium text-terra-deep">Jhogra hoise?</p>
          <h1 className="font-display text-5xl leading-[1.05] sm:text-6xl">
            <WordReveal text="Judge daki." />
          </h1>
          <p className="mt-4 max-w-md text-[17px] leading-relaxed text-ink-soft">
            <WordReveal
              text={"Tell me what happened. I'll hear both sides and help you figure out where things actually went wrong — not who “won.”"}
              delay={0.25}
            />
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/start">
              <Button className="lift w-full sm:w-auto">Solve a Jhogra</Button>
            </Link>
            <Link href="/solo">
              <Button variant="ghost" className="lift w-full sm:w-auto">
                I just need help first
              </Button>
            </Link>
          </div>
          <button
            onClick={openDemo}
            disabled={busy === "demo"}
            className="mt-5 text-sm text-ink-soft underline decoration-line underline-offset-4 transition-colors hover:text-terra-deep disabled:opacity-50"
          >
            {busy === "demo" ? "Opening…" : "Or peek at a finished session →"}
          </button>
        </div>

        <div className="flex justify-center md:justify-end">
          <div className="w-full max-w-md md:max-w-none"><HeroDemo /></div>
        </div>
      </section>

      {/* microcopy marquee */}
      <section aria-hidden className="relative -mx-5 overflow-hidden border-y border-line bg-card/60 py-3 sm:-mx-8">
        <div className="marquee-track gap-10 pr-10 text-sm text-ink-soft">
          {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((m, i) => (
            <span key={i} className="flex shrink-0 items-center gap-10">
              <span className={i % 3 === 1 ? "font-medium text-terra-deep" : ""}>{m}</span>
              <span className="h-1 w-1 rounded-full bg-line" />
            </span>
          ))}
        </div>
      </section>

      {/* How it works — staggered, breathing, hand-placed */}
      <section className="pb-16 pt-14">
        <h2 className="font-display text-2xl">
          <WordReveal text="How it works" />
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["1. You talk privately", "Say what actually happened. No forms, no 17 steps — just talk, and I ask what I actually need.", "sm:mt-6", "bg-[radial-gradient(circle_at_top_left,#c05b3b14,transparent_60%)]"],
            ["2. Judge hears both sides", "No screenshots. No arguing over each other's answers. Raw words stay private, always.", "", ""],
            ["3. Find the real problem", "Misunderstanding? Expectation? Trust? Boundary? Sometimes you'll find you agree about what happened.", "sm:mt-6", "bg-[radial-gradient(circle_at_bottom_right,#6f8b6e1a,transparent_60%)]"],
            ["4. Solve what can be solved", "An agreement, an apology, a boundary — or simply understanding. No fake harmony.", "", ""],
          ].map(([title, body, offset, tint], i) => (
            <div
              key={title as string}
              className={`lift anim-rise rounded-3xl border border-line bg-card p-6 ${offset} ${tint}`}
              style={{ animationDelay: `${0.15 + i * 0.12}s` }}
            >
              <p className="font-display text-lg">{title}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Other jobs */}
      <section className="grid gap-4 pb-10 sm:grid-cols-2">
        {[
          ["/solo", "Help me think", "Only one of you is here right now. Sort out what you know from what you're assuming — and decide what to ask."],
          ["/say", "Help me say it", "You know what you want to say. I'll help you say it so it can actually be heard. You keep the final word."],
        ].map(([href, title, body], i) => (
          <Link key={href} href={href} className="group">
            <Card className={`lift h-full ${i === 1 ? "sm:-rotate-[0.4deg]" : "sm:rotate-[0.4deg]"} group-hover:rotate-0`}>
              <p className="font-display text-lg">{title}</p>
              <p className="mt-1 text-sm text-ink-soft">{body}</p>
            </Card>
          </Link>
        ))}
      </section>

      <footer className="flex flex-col gap-2 border-t border-line py-6 text-xs text-ink-soft sm:flex-row sm:items-center sm:justify-between">
        <span>ঝগড়ার জাজ — Two sides. One way forward.</span>
        <span>Your private words stay private. Nothing is shared without your confirmation.</span>
      </footer>
    </main>
  );
}
