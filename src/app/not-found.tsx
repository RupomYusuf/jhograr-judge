import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-5 text-center">
      <p className="font-display text-5xl">Jhogra pawa jay nai.</p>
      <p className="mt-3 max-w-sm text-ink-soft">
        That page (or session) doesn&apos;t exist. Maybe the link expired, maybe
        it was mistyped — either way, nothing is lost.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-full bg-terra px-5 py-2.5 text-white transition-colors hover:bg-terra-deep"
      >
        Back home
      </Link>
    </main>
  );
}
