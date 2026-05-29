"use client";

import { useEffect } from "react";

export default function ErrorPage(props: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  useEffect(() => {
    // Intentionally avoid rendering error details. Logging is dev-only signal.
    console.error(props.error);
  }, [props.error]);

  return (
    <div className="min-h-full flex-1 bg-[#07080A] text-white">
      <div className="mx-auto flex min-h-[70vh] w-full max-w-2xl items-center px-6 py-12">
        <div className="w-full rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_1px_0_rgba(255,255,255,0.06)]">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-white/80 ring-1 ring-white/10">
            Executive QBR dashboard
            <span className="h-1 w-1 rounded-full bg-white/30" aria-hidden="true" />
            Controlled error state
          </div>

          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white">Something went wrong</h1>
          <p className="mt-2 text-sm leading-6 text-white/70">
            The scorecard is temporarily unavailable. This demo does not expose internal error details or sensitive configuration.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => props.unstable_retry()}
              className="inline-flex items-center justify-center rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/15 hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              Try again
            </button>
            <span className="text-xs text-white/60">If this persists, refresh the page.</span>
          </div>

          <div className="mt-6 rounded-xl border border-white/10 bg-black/35 p-4 text-sm leading-6 text-white/70">
            Demo note: data is fictional, the UI is read-only, and any AI content is mock or simulated in public mode.
          </div>
        </div>
      </div>
    </div>
  );
}
