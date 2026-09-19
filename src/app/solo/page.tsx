"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { setToken } from "@/lib/client";

export default function SoloPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function begin() {
    setBusy(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relationship: "other", mode: "solo" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setToken(data.code, data.token);
      router.push(`/session/${data.code}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-5 py-10">
      <Link href="/" className="font-display text-lg text-ink-soft hover:text-ink">← Jhograr Judge</Link>
      <h1 className="mt-6 font-display text-4xl leading-tight">Help me think</h1>
      <p className="mt-4 text-[16px] leading-relaxed text-ink-soft">
        Only you here right now — so I&apos;ll be honest about what that means.
        I have your side and only your side. I won&apos;t pretend to know why
        they did what they did.
      </p>
      <p className="mt-3 text-[16px] leading-relaxed text-ink-soft">
        Instead, we&apos;ll sort out three things: what you actually{" "}
        <span className="font-medium text-ink">know</span>, what you&apos;re{" "}
        <span className="font-medium text-ink">assuming</span>, and what you
        feel. Then you decide what to do with it.
      </p>
      <div className="mt-8">
        <Button onClick={begin} disabled={busy} className="w-full sm:w-auto">
          {busy ? "Opening your space…" : "Start thinking"}
        </Button>
      </div>
      <p className="mt-4 text-xs text-ink-soft">
        Private and account-free. Nothing here is shared with anyone.
      </p>
    </main>
  );
}
