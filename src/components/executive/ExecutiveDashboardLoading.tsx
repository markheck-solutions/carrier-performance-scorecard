"use client";

export function ExecutiveDashboardLoading() {
  return (
    <div className="relative flex-1 overflow-hidden bg-[#07080A] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[920px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(45,212,191,0.16),rgba(45,212,191,0)_60%)] blur-2xl" />
        <div className="absolute -bottom-56 left-16 h-[520px] w-[760px] rounded-full bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.14),rgba(251,191,36,0)_60%)] blur-3xl" />
        <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(to_right,rgba(255,255,255,1)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,1)_1px,transparent_1px)] [background-size:80px_80px]" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-6 py-10">
        <div className="flex flex-col gap-8">
          <header className="flex flex-col gap-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-white/80 ring-1 ring-white/10">
                  Executive QBR dashboard
                  <span className="h-1 w-1 rounded-full bg-white/30" aria-hidden="true" />
                  Read-only demo
                </div>
                <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  Carrier Performance Intelligence Scorecard
                </h1>
                <p className="mt-3 max-w-2xl text-base leading-7 text-white/70">
                  A boardroom-ready command surface for QBR prep. Deterministic scoring, transparent drivers, and
                  fictional telecom delivery records only.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-[0_1px_0_rgba(255,255,255,0.06)]">
                <div className="text-xs font-semibold tracking-wide text-white/80">Demo disclosure</div>
                <div className="mt-3 space-y-2">
                  <div className="h-3 w-64 rounded bg-white/10" aria-hidden="true" />
                  <div className="h-3 w-52 rounded bg-white/10" aria-hidden="true" />
                  <div className="h-3 w-56 rounded bg-white/10" aria-hidden="true" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-6 shadow-[0_1px_0_rgba(255,255,255,0.08)]">
                  <div className="h-5 w-80 rounded bg-white/10" aria-hidden="true" />
                  <div className="mt-4 space-y-3">
                    <div className="h-3 w-full rounded bg-white/10" aria-hidden="true" />
                    <div className="h-3 w-11/12 rounded bg-white/10" aria-hidden="true" />
                    <div className="h-3 w-10/12 rounded bg-white/10" aria-hidden="true" />
                  </div>
                  <div className="mt-6 flex flex-wrap gap-2">
                    <div className="h-7 w-28 rounded-full bg-white/10" aria-hidden="true" />
                    <div className="h-7 w-36 rounded-full bg-white/10" aria-hidden="true" />
                    <div className="h-7 w-32 rounded-full bg-white/10" aria-hidden="true" />
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-[0_1px_0_rgba(255,255,255,0.06)]">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white">Carrier health spectrum</div>
                      <div className="mt-2 space-y-2">
                        <div className="h-3 w-64 rounded bg-white/10" aria-hidden="true" />
                        <div className="h-3 w-56 rounded bg-white/10" aria-hidden="true" />
                      </div>
                    </div>
                    <div className="h-6 w-28 rounded-full bg-white/10" aria-hidden="true" />
                  </div>
                  <div className="mt-6 h-14 rounded-xl bg-white/5" aria-hidden="true" />
                  <div className="mt-3 flex gap-2">
                    <div className="h-6 w-20 rounded-full bg-white/10" aria-hidden="true" />
                    <div className="h-6 w-20 rounded-full bg-white/10" aria-hidden="true" />
                    <div className="h-6 w-20 rounded-full bg-white/10" aria-hidden="true" />
                  </div>
                </div>
              </div>
            </div>
          </header>

          <section aria-label="Leadership KPIs">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Loading KPIs">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div
                  key={idx}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 shadow-[0_1px_0_rgba(255,255,255,0.06)]"
                >
                  <div className="h-3 w-28 rounded bg-white/10" aria-hidden="true" />
                  <div className="mt-3 h-6 w-24 rounded bg-white/10" aria-hidden="true" />
                  <div className="mt-3 h-3 w-40 rounded bg-white/10" aria-hidden="true" />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
