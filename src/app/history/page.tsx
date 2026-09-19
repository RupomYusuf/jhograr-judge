"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { readHistory, removeFromHistory, type HistoryEntry } from "@/lib/client";

const STATUS_LABEL: Record<string, string> = {
  waiting: "Waiting for the other side",
  intake: "Private conversations",
  map: "Reading the map",
  resolution: "Choosing a path",
  agreement: "Agreement on the table",
  followup: "Follow-up due",
  closed: "Resolved ✓",
  safety: "Paused for safety",
};

export default function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);

  // Read localStorage after mount (SSR-safe).
  if (entries === null && typeof window !== "undefined") {
    setEntries(readHistory());
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8 sm:px-8">
      <Link href="/" className="font-display text-lg text-ink-soft hover:text-ink">
        ← Jhograr Judge
      </Link>
      <h1 className="mt-6 font-display text-4xl">Your Jhogra History</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Stored only on this device. You can rename any conflict from inside the
        session — &ldquo;The Great Dish War&rdquo; deserves its proper title.
      </p>

      {entries?.length ? (
        <div className="mt-6 space-y-3">
          {entries.map((e) => (
            <Card key={e.code} className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate font-medium">{e.title || e.code}</p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  {STATUS_LABEL[e.status] ?? e.status} · {e.side === "A" ? "Side A" : "Side B"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link href={`/session/${e.code}`}>
                  <Button variant="ghost" className="px-4 py-2 text-sm">
                    Open
                  </Button>
                </Link>
                <Button
                  variant="quiet"
                  className="px-2 py-2 text-xs"
                  onClick={() => {
                    removeFromHistory(e.code);
                    setEntries(readHistory());
                  }}
                >
                  Remove
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="mt-6 border-dashed text-center">
          <p className="text-ink-soft">No jhogras yet. Peaceful, or avoidant — you decide.</p>
          <div className="mt-4">
            <Link href="/start">
              <Button>Start a Jhogra</Button>
            </Link>
          </div>
        </Card>
      )}
    </main>
  );
}
