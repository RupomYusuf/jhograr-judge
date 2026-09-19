"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Card, Chip, Field, SectionLabel } from "@/components/ui";

type Tone = "clearer" | "firmer" | "softer" | "shorter";

export default function SayItPage() {
  const [input, setInput] = useState("");
  const [variants, setVariants] = useState<{ tone: Tone; text: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function rewrite(tone: Tone) {
    if (!input.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/say", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, tone }),
      });
      const data = await res.json();
      if (res.ok) {
        setVariants((v) => [{ tone, text: data.rewrite }, ...v.filter((x) => x.tone !== tone)].slice(0, 4));
      }
    } finally {
      setBusy(false);
    }
  }

  function copy(text: string) {
    void navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8 sm:px-8">
      <Link href="/" className="font-display text-lg text-ink-soft hover:text-ink">
        ← Jhograr Judge
      </Link>
      <h1 className="mt-6 font-display text-4xl">Help me say it</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-ink-soft">
        Write it exactly how it feels first — unfiltered. I&apos;ll help you say
        the same thing in a way that can actually be heard. You decide what to
        send; I never soften a boundary into a suggestion.
      </p>

      <Card className="mt-6">
        <Field
          label="Your draft — as-is, no filter"
          value={input}
          onChange={setInput}
          multiline
          placeholder={'e.g. "Tell him he\'s an idiot for disappearing for 7 hours."'}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          {(["clearer", "firmer", "softer", "shorter"] as Tone[]).map((t) => (
            <Chip key={t} onClick={() => void rewrite(t)} disabled={busy || !input.trim()}>
              {busy ? "…" : `Make it ${t}`}
            </Chip>
          ))}
          <Chip
            selected
            onClick={() => setInput(input)}
            disabled={!input.trim()}
          >
            Keep mine
          </Chip>
        </div>
      </Card>

      {variants.length > 0 ? (
        <div className="mt-5 space-y-3">
          <SectionLabel>Your options — you keep the final word</SectionLabel>
          {variants.map((v) => (
            <Card key={v.tone} className="animate-rise">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[15px] leading-relaxed">{v.text}</p>
                <Button variant="ghost" className="shrink-0 px-3 py-1.5 text-xs" onClick={() => copy(v.text)}>
                  {copied === v.text ? "Copied ✓" : "Copy"}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : null}
    </main>
  );
}
