"use client";

// Scoped to /pot/*: a bad or cross-network address throws while decoding the
// pot's reads. Keep that contained to the pot route instead of blanking the app.

export default function PotError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-black">Can&apos;t load this pot</h1>
      <p className="mt-3 text-gray-600">
        The address may be wrong, or this pot may not exist on either Monad network.
        Check the link and try again.
      </p>
      {/* Surface the real cause. A generic message here previously hid a
          rules-of-hooks crash for a full debugging round — the actual error is
          the fastest path to the fix. */}
      {error?.message && (
        <details className="mt-4 rounded-xl bg-gray-50 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-gray-700">
            Technical details
          </summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-gray-700">
            {error.message}
            {error.digest ? `\n\ndigest: ${error.digest}` : ""}
          </pre>
        </details>
      )}
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