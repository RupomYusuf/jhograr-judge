"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Field, SectionLabel } from "@/components/ui";
import { setToken } from "@/lib/client";

const RELATIONSHIPS = [
  { id: "couple", label: "Couple", hint: "Partners, spouses, dating" },
  { id: "friends", label: "Friends", hint: "Longtime or new" },
  { id: "siblings", label: "Siblings", hint: "Brothers, sisters" },
  { id: "family", label: "Family", hint: "Parents, cousins, in-laws" },
  { id: "roommates", label: "Roommates", hint: "Flatmates, hostels" },
  { id: "other", label: "Other", hint: "Something else entirely" },
];

export default function StartPage() {
  const router = useRouter();
  const [relationship, setRelationship] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!relationship) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relationship, title: title || undefined, displayName: displayName || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create session");
      setToken(data.code, data.token);
      router.push(`/session/${data.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-5 py-8 sm:px-8">
      <h1 className="font-display text-3xl">Who&apos;s this between?</h1>
      <p className="mt-2 text-ink-soft">
        This shapes how I listen — friendship fights and couple fights aren&apos;t
        the same animal. I won&apos;t assume anything else about you.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {RELATIONSHIPS.map((r) => (
          <button
            key={r.id}
            onClick={() => setRelationship(r.id)}
            className={`rounded-2xl border p-4 text-left transition-all duration-150 ${
              relationship === r.id
                ? "border-terra bg-terra/5 shadow-[0_2px_12px_rgba(192,91,59,0.12)]"
                : "border-line bg-card hover:border-terra/40"
            }`}
          >
            <p className="font-medium">{r.label}</p>
            <p className="mt-0.5 text-xs text-ink-soft">{r.hint}</p>
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-4">
        <Field
          label="Name this jhogra (optional, editable later)"
          value={title}
          onChange={setTitle}
          placeholder="e.g. The Seen-Zone Incident"
        />
        <Field
          label="Your first name (optional — only Judge sees it)"
          value={displayName}
          onChange={setDisplayName}
          placeholder="e.g. Asha"
        />
      </div>

      {error ? <p className="mt-4 text-sm text-terra-deep">{error}</p> : null}

      <div className="mt-8 flex items-center gap-4">
        <Button onClick={create} disabled={!relationship || busy}>
          {busy ? "Creating…" : "Create the session"}
        </Button>
        <span className="text-xs text-ink-soft">
          You&apos;ll get a private room and an invite link for the other person.
        </span>
      </div>

      <Card className="mt-10 border-dashed">
        <SectionLabel>What happens next</SectionLabel>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          First you and the other person each talk to me privately. Your raw
          words are never shown to each other — only what you confirm, only
          after I understand both sides. No account needed for either of you.
        </p>
      </Card>
    </main>
  );
}
