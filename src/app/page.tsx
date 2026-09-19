"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";
import { setToken } from "@/lib/client";

function HeroDemo() {
  // Gentle looping vignette: two bubbles → Judge's read.
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setPhase((p) => (p + 1) % 3), 2200);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div
        className={`bubble-judge max-w-[75%] self-start px-4 py-3 text-[14px] transition-all duration-500 ${phase >= 0 ? "opacity-100" : "opacity-0"}`}
      >
        “She never listens.”
      </div>
      <div
        className="max-w-[75%] self-end bg-ink px-4 py-3 text-[14px] text-cream transition-all duration-500"
        style={{ borderRadius: "18px 18px 4px 18px" }}
      >
        “He never explains what he wants.”
      </div>
      <div
        className={`max-w-[85%] self-start transition-all duration-700 ${phase >= 1 ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
      >
        <div className="mb-1 flex items-center gap-2 text-xs text-ink-soft">
          <span className="h-1.5 w-1.5 animate-breathe rounded-full bg-terra" />
          Judge is reading both sides…
        </div>
        {phase >= 2 ? (
          <div className="bubble-judge animate-rise border-terra/40 px-4 py-3 text-[14px]">
            <span className="font-medium text-terra-deep">
              Wait — you two want the same thing.
            </span>
            <br />
            <span className="text-ink-soft">
              You&apos;re both asking to be told before plans change.
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

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
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 sm:px-8">
      {/* Nav */}
      <nav className="flex items-center justify-between py-5">
        <span className="font-display text-xl">
          Jhograr Judge <span className="text-terra">⚖</span>
        </span>
        <div className="flex items-center gap-4 text-sm">
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
          <p className="mb-3 text-sm font-medium text-terra-deep">
            Jhogra hoise?
          </p>
          <h1 className="font-display text-5xl leading-[1.05] sm:text-6xl">
            Judge daki.
          </h1>
          <p className="mt-4 max-w-md text-[17px] leading-relaxed text-ink-soft">
            Tell me what happened. I&apos;ll hear both sides and help you figure
            out where things actually went wrong — not who &ldquo;won.&rdquo;
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/start">
              <Button className="w-full sm:w-auto">Solve a Jhogra</Button>
            </Link>
            <Link href="/solo">
              <Button variant="ghost" className="w-full sm:w-auto">
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

        <div className="hidden justify-end md:flex">
          <HeroDemo />
        </div>
      </section>

      {/* How it works */}
      <section className="pb-16">
        <h2 className="font-display text-2xl">How it works</h2>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["1. You talk privately", "Say what actually happened. No forms, no 17 steps — just talk, and I ask what I actually need."],
            ["2. Judge hears both sides", "No screenshots. No arguing over each other's answers. Raw words stay private, always."],
            ["3. Find the real problem", "Misunderstanding? Expectation? Trust? Boundary? Sometimes you'll find you agree about what happened."],
            ["4. Solve what can be solved", "An agreement, an apology, a boundary — or simply understanding. No fake harmony."],
          ].map(([title, body]) => (
            <Card key={title} className="animate-fade">
              <p className="font-display text-lg">{title}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Other jobs */}
      <section className="grid gap-4 pb-10 sm:grid-cols-2">
        <Link href="/solo" className="group">
          <Card className="h-full transition-all group-hover:border-terra/40">
            <p className="font-display text-lg">Help me think</p>
            <p className="mt-1 text-sm text-ink-soft">
              Only one of you is here right now. Sort out what you know from
              what you&apos;re assuming — and decide what to ask.
            </p>
          </Card>
        </Link>
        <Link href="/say" className="group">
          <Card className="h-full transition-all group-hover:border-terra/40">
            <p className="font-display text-lg">Help me say it</p>
            <p className="mt-1 text-sm text-ink-soft">
              You know what you want to say. I&apos;ll help you say it so it can
              actually be heard. You keep the final word.
            </p>
          </Card>
        </Link>
      </section>

      <footer className="flex flex-col gap-2 border-t border-line py-6 text-xs text-ink-soft sm:flex-row sm:items-center sm:justify-between">
        <span>ঝগড়ার জাজ — Two sides. One way forward.</span>
        <span>Your private words stay private. Nothing is shared without your confirmation.</span>
      </footer>
    </main>
  );
}
