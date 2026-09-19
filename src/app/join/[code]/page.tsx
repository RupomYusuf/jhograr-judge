"use client";

import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { Button, Card, Field } from "@/components/ui";
import { setToken } from "@/lib/client";

export default function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: displayName || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't join");
      setToken(code, data.token);
      router.push(`/session/${code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-5 py-10">
      <p className="font-display text-3xl leading-snug">
        Someone wants to sort something out with you.
      </p>
      <p className="mt-3 text-ink-soft">Session {code.toUpperCase()}</p>

      <Card className="mt-6">
        <ul className="space-y-2.5 text-[15px] leading-relaxed text-ink-soft">
          <li>You&apos;ll each get a private space first.</li>
          <li>
            Jhograr Judge won&apos;t show your raw answers to the other person,
            and won&apos;t automatically decide who&apos;s right.
          </li>
          <li>The goal is to understand what happened and find a way forward.</li>
        </ul>
      </Card>

      <div className="mt-6">
        <Field
          label="Your first name (optional — only Judge sees it)"
          value={displayName}
          onChange={setDisplayName}
          placeholder="e.g. Nabil"
        />
      </div>

      {error ? <p className="mt-4 text-sm text-terra-deep">{error}</p> : null}

      <div className="mt-6">
        <Button onClick={join} disabled={busy} className="w-full sm:w-auto">
          {busy ? "Joining…" : "Hear my side"}
        </Button>
      </div>

      <p className="mt-6 text-xs text-ink-soft">
        No account needed. You can leave at any point — nothing is shared
        without your confirmation.
      </p>
    </main>
  );
}
