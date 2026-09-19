"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-5 text-center">
      <p className="font-display text-4xl">Hmm. Something isn&apos;t adding up.</p>
      <p className="mt-3 max-w-sm text-sm text-ink-soft">
        Judge hit a snag — not your fault. Your session is safe.
      </p>
      <button
        onClick={reset}
        className="mt-6 rounded-full bg-terra px-5 py-2.5 text-white transition-colors hover:bg-terra-deep"
      >
        Try again
      </button>
    </main>
  );
}
