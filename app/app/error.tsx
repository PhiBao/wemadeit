"use client";

// Any render-time throw (e.g. a bad /pot/<address> deep link) used to produce a
// blank screen. A judge who pastes a wrong address should see a way back, not a
// white page.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-black">Something broke</h1>
      <p className="mt-3 text-gray-600">
        This page hit an unexpected error. If you followed a pot link, the address may
        not be a pot on this network.
      </p>
      {error.message && (
        <p className="mt-3 break-all rounded-lg bg-gray-100 p-3 font-mono text-xs text-gray-700">
          {error.message.slice(0, 300)}
        </p>
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