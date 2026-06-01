"use client";

import { DEMO_DATASET_ID, DEMO_SEED_VERSION } from "@/lib/db/demo-values";
import type { CarrierScorecard, ScoreGrade, ScoringComponentId } from "@/lib/scoring/types";

import {
  executiveAttentionList,
  gradeCounts,
  portfolioHealth,
  scopeLabel,
  commitmentOnTimeRate,
  completionTrend,
  governanceAttentionCount,
  lowConfidenceCount,
  topDrivers,
} from "./derive";
import { HealthSpectrum } from "./HealthSpectrum";
import type { HealthModel, ScorecardsSummaryModel } from "./types";

export type RuntimePosture = { status: "ready"; data: HealthModel } | { status: "error"; message: string };

function gradeTone(grade: ScoreGrade) {
  switch (grade) {
    case "A":
      return { label: "Strong", className: "bg-emerald-400/15 text-emerald-100 ring-emerald-400/25" };
    case "B":
      return { label: "Healthy", className: "bg-teal-400/15 text-teal-100 ring-teal-400/25" };
    case "C":
      return { label: "Watch", className: "bg-sky-400/15 text-sky-100 ring-sky-400/25" };
    case "D":
      return { label: "Governance", className: "bg-amber-400/15 text-amber-100 ring-amber-400/25" };
    case "F":
      return { label: "Governance", className: "bg-rose-400/15 text-rose-100 ring-rose-400/25" };
  }
}

function SkeletonLine(props: { className?: string }) {
  return <div className={`h-3 rounded bg-white/10 ${props.className ?? ""}`} aria-hidden="true" />;
}

function Panel(props: { title: string; subtitle?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-5 shadow-[0_1px_0_rgba(255,255,255,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold tracking-wide text-white">{props.title}</h3>
          {props.subtitle ? <p className="mt-1 text-sm leading-6 text-white/70">{props.subtitle}</p> : null}
        </div>
        {props.right ? <div className="shrink-0">{props.right}</div> : null}
      </div>
      <div className="mt-4">{props.children}</div>
    </section>
  );
}

function Kpi(props: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 shadow-[0_1px_0_rgba(255,255,255,0.06)]">
      <div className="text-[11px] font-semibold tracking-wide text-white/70">{props.label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-white">{props.value}</div>
      {props.detail ? <div className="mt-1 text-xs leading-5 text-white/60">{props.detail}</div> : null}
    </div>
  );
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value * 100)}%`;
}

function shortDate(iso: string | undefined) {
  if (!iso) return "unknown";
  return iso.slice(0, 10);
}

function pickScorecard(scorecards: readonly CarrierScorecard[], which: "best" | "worst") {
  if (scorecards.length === 0) return null;
  return which === "best" ? scorecards[0] : scorecards[scorecards.length - 1];
}

function DriverPills(props: { drivers: ReturnType<typeof topDrivers> }) {
  return (
    <div className="flex flex-wrap gap-2">
      {props.drivers.map((d) => (
        <span
          key={d.id}
          className="rounded-full bg-black/35 px-2.5 py-1 text-xs font-semibold text-white/80 ring-1 ring-white/10"
        >
          {d.label}
        </span>
      ))}
    </div>
  );
}

function ErrorInline(props: { title: string; body: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/35 p-4">
      <div className="text-sm font-semibold text-white">{props.title}</div>
      <div className="mt-1 text-sm leading-6 text-white/70">{props.body}</div>
      <button
        type="button"
        onClick={props.onRetry}
        className="mt-3 inline-flex items-center justify-center rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/15 hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
      >
        Retry
      </button>
    </div>
  );
}

export function ExecutiveDashboard(props: {
  summary: ScorecardsSummaryModel;
  runtime: RuntimePosture;
  commandSurface?: React.ReactNode;
  comparisonAndDetail?: React.ReactNode;
  onOpenEvidenceForDelayReason?: (delayReason: string) => void;
  onOpenEvidenceForGovernanceItem?: (carrierId: string, dimension: ScoringComponentId) => void;
  onSelectCarrier?: (carrierId: string) => void;
  selectedCarrierId?: string | null;
}) {
  const model = props.summary;
  const hasResults = model.counts.deliveryRecords > 0;
  const portfolio = portfolioHealth(model.carriers);
  const grades = gradeCounts(model.carriers);
  const onTime = commitmentOnTimeRate(model.carriers);
  const trend = completionTrend(model.carriers);
  const governanceCount = governanceAttentionCount(model.carriers);
  const lowConfidence = lowConfidenceCount(model.carriers);
  const scope = scopeLabel(model.scope);
  const attention = executiveAttentionList(model.carriers);
  const derived = { model, portfolio, grades, onTime, trend, governanceCount, lowConfidence, scope, attention };

  const best = derived ? pickScorecard(derived.model.carriers, "best") : null;
  const worst = derived ? pickScorecard(derived.model.carriers, "worst") : null;

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
                <div className="mt-2 space-y-1 text-sm leading-6 text-white/70">
                  <div>
                    Fictional dataset: <span className="font-semibold text-white/85">{DEMO_DATASET_ID}</span> (
                    {DEMO_SEED_VERSION})
                  </div>
                  <div>Mock AI only. No production carrier or customer data.</div>
                  <div>No create, edit, delete, upload, or workflow actions.</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-6 shadow-[0_1px_0_rgba(255,255,255,0.08)]">
                  <div className="absolute right-6 top-6 hidden text-right sm:block">
                    <div className="text-[11px] font-semibold tracking-wide text-white/60">Scope</div>
                    {derived ? (
                      <div className="mt-2 space-y-1 text-sm text-white/80">
                        <div>{derived.scope.period}</div>
                        <div>{derived.scope.region}</div>
                        <div>{derived.scope.product}</div>
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        <SkeletonLine className="w-40" />
                        <SkeletonLine className="w-28" />
                        <SkeletonLine className="w-32" />
                      </div>
                    )}
                  </div>

                  <h2 className="text-lg font-semibold tracking-tight text-white">
                    What leadership can decide in 60 seconds
                  </h2>
                  <ul className="mt-4 space-y-3 text-sm leading-6 text-white/75">
                    <li className="flex gap-3">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-teal-300/70" aria-hidden="true" />
                      Which carriers are strong, which are watch, and which need governance cadence.
                    </li>
                    <li className="flex gap-3">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-300/70" aria-hidden="true" />
                      Where delivery misses concentrate by delay reason, region, and product mix.
                    </li>
                    <li className="flex gap-3">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-sky-300/70" aria-hidden="true" />
                      Whether momentum is improving, stable, or declining over the selected window.
                    </li>
                  </ul>

                  <div className="mt-6 flex flex-wrap gap-2">
                    <span className="rounded-full bg-black/35 px-3 py-1 text-xs font-semibold text-white/80 ring-1 ring-white/10">
                      Explainable score
                    </span>
                    <span className="rounded-full bg-black/35 px-3 py-1 text-xs font-semibold text-white/80 ring-1 ring-white/10">
                      Evidence-backed drivers
                    </span>
                    <span className="rounded-full bg-black/35 px-3 py-1 text-xs font-semibold text-white/80 ring-1 ring-white/10">
                      QBR-ready language
                    </span>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5">
                {hasResults ? (
                  <HealthSpectrum
                    scorecards={derived.model.carriers}
                    portfolioScore={derived.portfolio.score}
                    portfolioGrade={derived.portfolio.grade}
                    selectedCarrierId={props.selectedCarrierId ?? null}
                    onSelectCarrier={props.onSelectCarrier}
                  />
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-[0_1px_0_rgba(255,255,255,0.06)]">
                    <div className="text-sm font-semibold text-white">No carriers in this scope</div>
                    <div className="mt-2 text-sm leading-6 text-white/70">
                      These filters remove all delivery records, so there is nothing to grade or rank. Broaden scope or
                      use Reset in Scope controls.
                    </div>
                  </div>
                )}
              </div>
            </div>

            {props.commandSurface ? <div className="pt-2">{props.commandSurface}</div> : null}
          </header>

          <section aria-label="Leadership KPIs">
            {hasResults ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Kpi
                  label="Portfolio health"
                  value={`${derived.portfolio.grade} (${derived.portfolio.score})`}
                  detail={`${derived.model.counts.carriers} carriers in scope`}
                />
                <Kpi
                  label="Governance attention"
                  value={`${derived.governanceCount}`}
                  detail="Carriers graded D or F in the current window"
                />
                <Kpi
                  label="Commitment on-time"
                  value={formatPercent(derived.onTime.rate)}
                  detail={`${derived.onTime.onTime}/${derived.onTime.completed} completed deliveries`}
                />
                <Kpi
                  label="Low-confidence reads"
                  value={`${derived.lowConfidence}`}
                  detail="Limited sample size in the current scope"
                />
                <Kpi
                  label="Evidence items"
                  value={`${derived.model.counts.evidenceItems}`}
                  detail={`${derived.model.counts.deliveryRecords} delivery records`}
                />
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-black/35 p-5 text-sm text-white/70">
                No KPIs are available because this scope contains zero delivery records. Broaden filters or use Reset to
                restore the executive view.
              </div>
            )}
          </section>

          {props.comparisonAndDetail ? (
            <section aria-label="Carrier comparison and detail">{props.comparisonAndDetail}</section>
          ) : null}

          <section className="grid grid-cols-1 gap-6 lg:grid-cols-12" aria-label="Executive signals">
            <div className="lg:col-span-6">
              <Panel
                title="Best performer"
                subtitle="Strongest fictional carrier in this scope, with the most consistent signal mix."
                right={
                  hasResults && best ? (
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${gradeTone(best.grade).className}`}
                    >
                      {best.grade} {gradeTone(best.grade).label}
                    </span>
                  ) : (
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/70 ring-1 ring-white/10">
                      No results
                    </span>
                  )
                }
              >
                {hasResults && best ? (
                  <div>
                    {props.onSelectCarrier ? (
                      <button
                        type="button"
                        onClick={() => props.onSelectCarrier?.(best.carrier.id)}
                        className="text-left text-lg font-semibold text-white hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                        aria-label={`Select carrier ${best.carrier.name} (${best.carrier.shortCode})`}
                        data-testid="best-performer-select"
                        data-carrier-id={best.carrier.id}
                      >
                        {best.carrier.name} <span className="text-white/50">({best.carrier.shortCode})</span>
                      </button>
                    ) : (
                      <div className="text-lg font-semibold text-white">
                        {best.carrier.name} <span className="text-white/50">({best.carrier.shortCode})</span>
                      </div>
                    )}
                    <div className="mt-2 text-sm leading-6 text-white/70">
                      Recommended posture: keep cadence, reinforce what is working, and use this carrier as a reference
                      in QBR.
                    </div>
                    <div className="mt-4">
                      <div className="text-xs font-semibold tracking-wide text-white/60">Top strengths</div>
                      <div className="mt-2">
                        <DriverPills drivers={topDrivers(best, 3, "strength")} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm leading-6 text-white/70">
                    No carriers are ranked in this scope. Broaden filters or use Reset to restore comparison and detail.
                  </div>
                )}
              </Panel>
            </div>

            <div className="lg:col-span-6">
              <Panel
                title="Needs governance attention"
                subtitle="Lowest-scoring fictional carrier in this scope. Use this to prioritize leadership discussion."
                right={
                  hasResults && worst ? (
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${gradeTone(worst.grade).className}`}
                    >
                      {worst.grade} {gradeTone(worst.grade).label}
                    </span>
                  ) : (
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/70 ring-1 ring-white/10">
                      No results
                    </span>
                  )
                }
              >
                {hasResults && worst ? (
                  <div>
                    {props.onSelectCarrier ? (
                      <button
                        type="button"
                        onClick={() => props.onSelectCarrier?.(worst.carrier.id)}
                        className="text-left text-lg font-semibold text-white hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                        aria-label={`Select carrier ${worst.carrier.name} (${worst.carrier.shortCode})`}
                        data-testid="worst-performer-select"
                        data-carrier-id={worst.carrier.id}
                      >
                        {worst.carrier.name} <span className="text-white/50">({worst.carrier.shortCode})</span>
                      </button>
                    ) : (
                      <div className="text-lg font-semibold text-white">
                        {worst.carrier.name} <span className="text-white/50">({worst.carrier.shortCode})</span>
                      </div>
                    )}
                    <div className="mt-2 text-sm leading-6 text-white/70">
                      Recommended posture: align on recovery plan, tighten cadence, and confirm owner actions for the
                      next period.
                    </div>
                    <div className="mt-4">
                      <div className="text-xs font-semibold tracking-wide text-white/60">Primary pressure points</div>
                      <div className="mt-2">
                        <DriverPills drivers={topDrivers(worst, 3, "concern")} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm leading-6 text-white/70">
                    No carriers are ranked in this scope. Broaden filters or use Reset to restore the executive signal
                    panels.
                  </div>
                )}
              </Panel>
            </div>

            <div className="lg:col-span-7">
              <Panel
                title="Governance attention list"
                subtitle="Action-oriented items that bring focus to the next QBR discussion."
              >
                {hasResults ? (
                  <ol className="space-y-3">
                    {derived.attention.map((item) => (
                      <li key={item.carrierId} className="rounded-xl border border-white/10 bg-black/30 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-white">
                            {props.onSelectCarrier ? (
                              <button
                                type="button"
                                onClick={() => props.onSelectCarrier?.(item.carrierId)}
                                className="font-semibold text-white hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                aria-label={`Select carrier ${item.carrierName}`}
                                data-testid="governance-attention-select"
                                data-carrier-id={item.carrierId}
                              >
                                {item.carrierName}
                              </button>
                            ) : (
                              item.carrierName
                            )}{" "}
                            <span className="ml-2 rounded-full bg-white/5 px-2 py-0.5 text-xs font-semibold text-white/70 ring-1 ring-white/10">
                              {item.priorityLabel}
                            </span>
                            {item.lowConfidence ? (
                              <span className="ml-2 rounded-full bg-white/5 px-2 py-0.5 text-xs font-semibold text-white/70 ring-1 ring-white/10">
                                Limited sample ({item.sampleCount})
                              </span>
                            ) : null}
                          </div>
                          <div
                            className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${gradeTone(item.grade).className}`}
                          >
                            Grade {item.grade} ({item.totalScore})
                          </div>
                        </div>
                        <div className="mt-2 text-sm leading-6 text-white/70">{item.reason}</div>
                        <div className="mt-3 text-xs font-semibold tracking-wide text-white/60">
                          Next discussion angle
                        </div>
                        <div className="mt-1 text-sm leading-6 text-white/70">{item.discussionAngle}</div>
                        {props.onOpenEvidenceForGovernanceItem && item.concerns[0] ? (
                          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/35 px-3 py-2">
                            <div className="text-xs text-white/70">
                              Proof focus: <span className="font-semibold text-white/85">{item.concerns[0].label}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                props.onOpenEvidenceForGovernanceItem?.(item.carrierId, item.concerns[0]!.id)
                              }
                              data-evidence-origin={`governance:${item.carrierId}:${item.concerns[0]!.id}`}
                              className="inline-flex items-center justify-center rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white ring-1 ring-white/15 hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                            >
                              View proof
                            </button>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="text-sm leading-6 text-white/70">
                    No governance signals are available because this scope contains zero delivery records. Broaden
                    filters or use Reset.
                  </div>
                )}
              </Panel>
            </div>

            <div className="lg:col-span-5">
              <div className="grid grid-cols-1 gap-6">
                <Panel title="Trend direction" subtitle="Momentum label is shown with text, not color alone.">
                  {hasResults ? (
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-2xl font-semibold tabular-nums text-white">
                          {derived.trend.label === "unknown"
                            ? "Unknown"
                            : derived.trend.label === "improving"
                              ? "Improving"
                              : derived.trend.label === "declining"
                                ? "Declining"
                                : derived.trend.label === "watch"
                                  ? "Watch"
                                  : "Stable"}
                        </div>
                        <div className="mt-2 text-sm leading-6 text-white/70">
                          Weighted momentum: {formatPercent(derived.trend.delta)} over the window.{" "}
                          {derived.trend.unavailableCarriers > 0
                            ? `${derived.trend.unavailableCarriers} carrier(s) have limited history for momentum.`
                            : "All carriers have enough history for momentum."}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/35 px-3 py-2">
                        <div className="text-[11px] font-semibold tracking-wide text-white/60">Window</div>
                        <div className="mt-1 text-sm font-semibold text-white/85">
                          {derived.model.scope.periodWindow.mode === "single"
                            ? (derived.model.scope.periodWindow.seedKey ?? "period")
                            : `${shortDate(derived.model.scope.periodWindow.startDate)} to ${shortDate(derived.model.scope.periodWindow.endDate)}`}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm leading-6 text-white/70">
                      Trend is unavailable because this scope contains zero delivery records. Broaden filters or use
                      Reset to restore momentum signals.
                    </div>
                  )}
                </Panel>

                <Panel
                  title="Delay concentration"
                  subtitle="Top delay reasons plus region and product concentration signals."
                >
                  {hasResults ? (
                    <div className="space-y-4">
                      <div>
                        <div className="text-xs font-semibold tracking-wide text-white/60">Top delay reasons</div>
                        <div className="mt-2 space-y-2">
                          {derived.model.aggregates.delayReasons
                            .filter((d) => d.delayReason !== "none")
                            .slice(0, 4)
                            .map((d) => {
                              const pct =
                                derived.model.counts.deliveryRecords > 0
                                  ? d.count / derived.model.counts.deliveryRecords
                                  : 0;
                              return (
                                <div key={d.delayReason} className="flex items-center gap-3">
                                  <div className="flex w-28 items-center gap-2">
                                    <div className="text-xs font-semibold text-white/80">{d.delayReason}</div>
                                    {props.onOpenEvidenceForDelayReason ? (
                                      <button
                                        type="button"
                                        onClick={() => props.onOpenEvidenceForDelayReason?.(d.delayReason)}
                                        data-evidence-origin={`delayReason:${d.delayReason}`}
                                        className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/75 ring-1 ring-white/10 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                      >
                                        Proof
                                      </button>
                                    ) : null}
                                  </div>
                                  <div className="flex-1">
                                    <div className="h-2 rounded-full bg-white/10">
                                      <div
                                        className="h-2 rounded-full bg-white/40"
                                        style={{ width: `${Math.min(100, pct * 120)}%` }}
                                      />
                                    </div>
                                  </div>
                                  <div className="w-12 text-right text-xs font-semibold tabular-nums text-white/70">
                                    {formatPercent(pct)}
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                          <div className="text-[11px] font-semibold tracking-wide text-white/60">
                            Region concentration
                          </div>
                          <div className="mt-1 text-sm font-semibold text-white/85">
                            {derived.model.aggregates.regions[0]
                              ? `${derived.model.aggregates.regions[0].region.toUpperCase()} (${derived.model.aggregates.regions[0].count})`
                              : "No data"}
                          </div>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                          <div className="text-[11px] font-semibold tracking-wide text-white/60">
                            Product concentration
                          </div>
                          <div className="mt-1 text-sm font-semibold text-white/85">
                            {derived.model.aggregates.productTypes[0]
                              ? `${derived.model.aggregates.productTypes[0].productType} (${derived.model.aggregates.productTypes[0].count})`
                              : "No data"}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm leading-6 text-white/70">
                      Delay concentration is unavailable because this scope contains zero delivery records. Broaden
                      filters or use Reset to restore delay insights.
                    </div>
                  )}
                </Panel>

                <Panel
                  title="Runtime posture"
                  subtitle="Panel-scoped failure stays contained. This supports safe, recoverable executive UX."
                >
                  {props.runtime.status === "ready" ? (
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">
                          {props.runtime.data.demoMode ? "Demo mode" : "Non-demo mode"}
                        </div>
                        <div className="mt-1 text-sm leading-6 text-white/70">
                          Service: <span className="font-semibold text-white/85">{props.runtime.data.service}</span>
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/35 px-3 py-2">
                        <div className="text-[11px] font-semibold tracking-wide text-white/60">Server time</div>
                        <div className="mt-1 text-sm font-semibold text-white/85">
                          {props.runtime.data.time.replace("T", " ").slice(0, 19)}Z
                        </div>
                      </div>
                    </div>
                  ) : (
                    <ErrorInline
                      title="Unable to load runtime status"
                      body={props.runtime.message}
                      onRetry={() => {
                        // The runtime panel is intentionally non-critical; recovery is a page refresh.
                        if (typeof window !== "undefined") window.location.reload();
                      }}
                    />
                  )}
                </Panel>
              </div>
            </div>
          </section>

          <footer className="pt-2 text-xs leading-6 text-white/50">
            This dashboard is a portfolio demo. Scores are computed deterministically from seeded fictional records. No
            production claims are implied.
          </footer>
        </div>
      </div>
    </div>
  );
}
