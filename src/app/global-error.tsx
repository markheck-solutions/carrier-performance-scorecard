"use client";

import { useEffect } from "react";

import { captureClientError } from "@/lib/observability/sentry-client";

export default function GlobalError(props: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  useEffect(() => {
    captureClientError(props.error, {
      operation: "app-global-error-boundary",
      route: "/",
      context: { digest: props.error.digest ?? null },
    });
  }, [props.error]);

  return (
    <html lang="en">
      <body>
        <main className="min-h-screen bg-[#07080A] px-6 py-12 text-white">
          <div className="mx-auto flex min-h-[70vh] w-full max-w-2xl items-center">
            <div className="w-full rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_1px_0_rgba(255,255,255,0.06)]">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-white/80 ring-1 ring-white/10">
                Executive QBR dashboard
                <span className="h-1 w-1 rounded-full bg-white/30" aria-hidden="true" />
                Global error boundary
              </div>

              <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white">Something went wrong</h1>
              <p className="mt-2 text-sm leading-6 text-white/70">
                The scorecard shell is temporarily unavailable. The error was captured with privacy-safe diagnostic
                context for follow-up.
              </p>

              <button
                type="button"
                onClick={() => props.unstable_retry()}
                className="mt-6 inline-flex items-center justify-center rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/15 hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              >
                Try again
              </button>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
