"use client";

// Scoped to /pot/*: a bad or cross-network address throws while decoding the
// pot's reads. Keep that contained to the pot route instead of blanking the app.

export default function PotError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-black">Can&apos;t load this pot</h1>
      <p className="mt-3 text-gray-600">
        The address may be wrong, or this pot may not exist on either Monad network.
        Check the link and try again.
      </p>
      <div className="mt-6 flex gap-3">
        <button
          onClick={reset}
          className="rounded-xl bg-emerald-700 px-5 py-2 font-semibold text-white"
        >
          Try again
        </button>
        <a href="/" className="rounded-xl border px-5 py-2 font-semibold">
          Back to pots
        </a>
      </div>
    </main>
  );
}