"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";

import { SCORE_MANIFEST } from "@/lib/scoring/manifest";
import type { CarrierScorecard, ScoreComponentResult, ScoreFilters, ScoreScope, ScoringComponentId } from "@/lib/scoring/types";
import { PRODUCT_TYPE_VALUES, REGION_VALUES, type ProductType, type Region } from "@/lib/db/demo-values";
import { buildDashboardQueryString, parseDashboardStateFromSearchParams } from "@/lib/filters/dashboard-state";

import { ExecutiveDashboard, type RuntimePosture } from "./ExecutiveDashboard";
import type { ScorecardsSummaryModel } from "./types";

export type { RuntimePosture };

type ScorecardsOptionsModel =
  | {
      ok: true;
      carriers: Array<{
        id: string;
        name: string;
        shortCode: string;
        relationshipTier: string;
        regionFocus: string;
      }>;
      periods: Array<{ seedKey: string; label: string; startDate: string; endDate: string }>;
    }
  | { ok: false; error: { message: string } };

type CarrierDetailReadModel =
  | {
      ok: true;
      manifest: unknown;
      scope: ScoreScope;
      carrier: { id: string; name: string; shortCode: string; relationshipTier: string; regionFocus: string } | null;
      scorecard: CarrierScorecard | null;
      message: string | null;
    }
  | { ok: false; error: { message: string; code?: string; details?: unknown } };

type EvidenceReadModel =
  | {
      ok: true;
      scope: ScoreScope;
      meta: {
        totalItems: number;
        returnedItems: number;
        cap: number | null;
        missingEvidenceIds: string[];
      };
      items: Array<{
        id: string;
        dimension: string;
        summary: string;
        carrierId: string;
        carrierName: string;
        period: string;
        region: Region;
        productType: ProductType;
        delayReason: string;
        committedDate: string;
        forecastDate: string | null;
        completedDate: string | null;
        stage: string;
        responsivenessHours: number;
        escalationCount: number;
        delayDays: number;
      }>;
    }
  | { ok: false; error: { message: string; code?: string; details?: unknown } };

type LoadState<T> =
  | { status: "idle" }
  | { status: "loading"; previous?: T }
  | { status: "ready"; data: T }
  | { status: "error"; message: string };

type DetailLoadState<T> =
  | { status: "idle" }
  | { status: "loading"; carrierId: string }
  | { status: "ready"; carrierId: string; data: T }
  | { status: "error"; carrierId: string; message: string };

type EvidenceLoadState<T> =
  | { status: "idle" }
  | { status: "loading"; requestKey: string }
  | { status: "ready"; requestKey: string; data: T }
  | { status: "error"; requestKey: string; message: string };

type EvidenceFocusRestore =
  | { kind: "element"; element: HTMLElement }
  | { kind: "selector"; selector: string };

function formatEnumLabel(value: string) {
  if (value === "na") return "North America";
  if (value === "emea") return "EMEA";
  if (value === "apac") return "APAC";
  if (value === "latam") return "LATAM";
  const spaced = value.replaceAll("_", " ");
  return spaced.length > 0 ? spaced[0]!.toUpperCase() + spaced.slice(1) : spaced;
}

function buildFiltersQuery(filters: ScoreFilters) {
  const params = new URLSearchParams();
  if (filters.carrierId) params.set("carrierId", filters.carrierId);
  if (filters.region) params.set("region", filters.region);
  if (filters.productType) params.set("productType", filters.productType);
  if (filters.period) params.set("period", filters.period);
  const raw = params.toString();
  return raw.length > 0 ? `?${raw}` : "";
}

function getMetric(component: ScoreComponentResult | null) {
  if (!component) return null;
  return component.metric;
}

function getComponent(scorecard: CarrierScorecard, id: ScoreComponentResult["id"]) {
  return scorecard.components.find((c) => c.id === id) ?? null;
}

function formatMetric(component: ScoreComponentResult | null) {
  const metric = getMetric(component);
  if (!metric) return "—";
  if (metric.kind === "ratio") {
    const pct = metric.denominator > 0 ? metric.numerator / metric.denominator : 0;
    return `${Math.round(pct * 100)}%`;
  }
  if (metric.unit === "hours") return `${Math.round(metric.value)}h`;
  if (metric.unit === "days") return `${Math.round(metric.value)}d`;
  if (metric.unit === "delta_rate") return `${Math.round(metric.value * 100)} pts`;
  return `${Math.round(metric.value)}`;
}

function issueNote(issues: ReturnType<typeof parseDashboardStateFromSearchParams>["issues"]) {
  if (issues.length === 0) return null;
  const first = issues[0]!;
  if (first.kind === "invalid_region" || first.kind === "invalid_productType") return "Some filters were not recognized and were reset.";
  if (first.kind === "invalid_period") return "The requested period was not recognized and was reset.";
  if (first.kind === "invalid_carrierId") return "A carrier link or filter value was not recognized and was reset.";
  if (first.kind === "invalid_evidenceId") return "The requested evidence link was not recognized and was reset.";
  if (first.kind === "invalid_evidenceDimension" || first.kind === "invalid_evidenceDelayReason")
    return "The requested evidence scope was not recognized and was reset.";
  if (first.kind === "conflicting_evidenceScope") return "This proof link contained conflicting parameters and was reset to a single evidence scope.";
  return "Some URL parameters were not recognized and were reset.";
}

function FilterSelect(props: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={props.id} className="block text-[11px] font-semibold tracking-wide text-white/70">
        {props.label}
      </label>
      <select
        id={props.id}
        value={props.value}
        onChange={(e) => props.onChange(e.currentTarget.value)}
        className="mt-1 block w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-white shadow-[0_1px_0_rgba(255,255,255,0.06)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
      >
        {props.children}
      </select>
    </div>
  );
}

function PillButton(props: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-white/75 ring-1 ring-white/10 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
    >
      {props.label}
      <span className="text-white/50" aria-hidden="true">
        ×
      </span>
    </button>
  );
}

function buildActiveFilterPills(params: {
  filters: ScoreFilters;
  carrierLabel?: string | null;
  periodLabel?: string | null;
}) {
  const filters = params.filters;
  const pills: Array<{ key: keyof ScoreFilters; label: string }> = [];
  if (filters.carrierId) {
    pills.push({ key: "carrierId", label: `Carrier: ${params.carrierLabel ?? filters.carrierId.slice(0, 8)}` });
  }
  if (filters.region) pills.push({ key: "region", label: `Region: ${filters.region.toUpperCase()}` });
  if (filters.productType) pills.push({ key: "productType", label: `Product: ${filters.productType}` });
  if (filters.period) pills.push({ key: "period", label: `Period: ${params.periodLabel ?? filters.period}` });
  return pills;
}

function ComparisonCard(props: {
  rank: number;
  total: number;
  scorecard: CarrierScorecard;
  selected: boolean;
  onSelect: () => void;
}) {
  const onTime = getComponent(props.scorecard, "commitment_adherence");
  const delay = getComponent(props.scorecard, "delay_severity");
  const resp = getComponent(props.scorecard, "responsiveness");
  const repeat = getComponent(props.scorecard, "repeat_issue_concentration");
  const trend = getComponent(props.scorecard, "completion_trend");
  const topProduct = props.scorecard.mix.productTypes[0] ?? null;

  const pct = Math.min(100, Math.max(0, props.scorecard.totalScore));

  const gradeTone =
    props.scorecard.grade === "A"
      ? "bg-emerald-500/15 text-emerald-100 ring-emerald-400/20"
      : props.scorecard.grade === "B"
        ? "bg-teal-500/15 text-teal-100 ring-teal-400/20"
        : props.scorecard.grade === "C"
          ? "bg-sky-500/15 text-sky-100 ring-sky-400/20"
          : props.scorecard.grade === "D"
            ? "bg-amber-500/15 text-amber-100 ring-amber-400/20"
            : "bg-rose-500/15 text-rose-100 ring-rose-400/20";

  const trendLabel =
    trend?.dataQuality.availability !== "ok"
      ? "Unknown"
      : trend && trend.metric.kind === "scalar" && trend.metric.value >= 0.05
        ? "Improving"
        : trend && trend.metric.kind === "scalar" && trend.metric.value <= -0.05
          ? "Declining"
          : trend && trend.metric.kind === "scalar" && trend.metric.value <= -0.02
            ? "Watch"
            : "Stable";

  return (
    <button
      type="button"
      onClick={props.onSelect}
      className={`group relative w-full overflow-hidden rounded-2xl border bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-4 text-left shadow-[0_1px_0_rgba(255,255,255,0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${
        props.selected ? "border-white/40" : "border-white/10 hover:border-white/20"
      }`}
      aria-pressed={props.selected}
      aria-label={`Select carrier ${props.scorecard.carrier.name} (${props.scorecard.carrier.shortCode})`}
      data-selected={props.selected ? "true" : "false"}
      data-testid="comparison-card"
      data-carrier-id={props.scorecard.carrier.id}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-black/40 px-2 py-0.5 text-[11px] font-semibold text-white/70 ring-1 ring-white/10">
              Rank {props.rank}/{props.total}
            </span>
            {props.selected ? (
              <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold text-white ring-1 ring-white/25">
                Selected
              </span>
            ) : null}
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${gradeTone}`}>
              Grade {props.scorecard.grade} ({props.scorecard.totalScore})
            </span>
            {props.scorecard.confidence.lowVolume ? (
              <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-[11px] font-semibold text-white/70 ring-1 ring-white/10">
                Limited sample ({props.scorecard.sampleCount})
              </span>
            ) : null}
          </div>
          <div className="mt-2 truncate text-base font-semibold text-white">
            {props.scorecard.carrier.name} <span className="text-white/50">({props.scorecard.carrier.shortCode})</span>
          </div>
          <div className="mt-1 text-xs text-white/60">
            Tier: <span className="font-semibold text-white/75">{props.scorecard.carrier.relationshipTier}</span>{" "}
            <span className="mx-1 text-white/25" aria-hidden="true">
              •
            </span>
            Region focus: <span className="font-semibold text-white/75">{props.scorecard.carrier.regionFocus.toUpperCase()}</span>{" "}
            <span className="mx-1 text-white/25" aria-hidden="true">
              •
            </span>
            Product mix:{" "}
            <span className="font-semibold text-white/75">
              {topProduct ? `${formatEnumLabel(topProduct.productType)} (${Math.round(topProduct.share * 100)}%)` : "—"}
            </span>{" "}
            <span className="mx-1 text-white/25" aria-hidden="true">
              •
            </span>
            Trend: <span className="font-semibold text-white/75">{trendLabel}</span>
          </div>
        </div>

        <div className="w-full max-w-[240px] shrink-0">
          <div className="h-2 rounded-full bg-white/10">
            <div
              className="h-2 rounded-full bg-white/45 transition-[width] duration-300"
              style={{ width: `${pct}%` }}
              aria-hidden="true"
            />
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2 text-[11px] text-white/60">
            <div>
              <div className="font-semibold text-white/75">On-time</div>
              <div className="tabular-nums">{formatMetric(onTime)}</div>
            </div>
            <div>
              <div className="font-semibold text-white/75">Delay</div>
              <div className="tabular-nums">{formatMetric(delay)}</div>
            </div>
            <div>
              <div className="font-semibold text-white/75">Resp</div>
              <div className="tabular-nums">{formatMetric(resp)}</div>
            </div>
            <div>
              <div className="font-semibold text-white/75">Repeat</div>
              <div className="tabular-nums">{formatMetric(repeat)}</div>
            </div>
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <div className="absolute -right-24 -top-24 h-56 w-56 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),rgba(255,255,255,0)_60%)] blur-2xl" />
      </div>
    </button>
  );
}

function ScoreBreakdownTable(props: {
  scorecard: CarrierScorecard;
  onOpenEvidenceId: (evidenceId: string) => void;
  onOpenEvidenceDimension: (dimension: ScoringComponentId) => void;
}) {
  const comps = props.scorecard.components;
  return (
    <div className="space-y-3">
      {comps.map((c) => (
        <section key={c.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-white">{c.label}</h4>
              <div className="mt-1 text-xs text-white/60">
                Raw metric:{" "}
                <span className="font-semibold text-white/75">
                  {c.metric.kind === "ratio" ? `${c.metric.numerator}/${c.metric.denominator}` : `${Math.round(c.metric.value * 100) / 100}`}
                </span>{" "}
                <span className="text-white/40">({c.metric.unit})</span>
                <span className="mx-2 text-white/25" aria-hidden="true">
                  •
                </span>
                Sample: <span className="font-semibold text-white/75">{c.sampleCount}</span>
                <span className="mx-2 text-white/25" aria-hidden="true">
                  •
                </span>
                Evidence: <span className="font-semibold text-white/75">{c.evidenceCount}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-[11px] font-semibold text-white/70 ring-1 ring-white/10">
                Normalized {c.normalizedScore}/100
              </span>
              <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-[11px] font-semibold text-white/70 ring-1 ring-white/10">
                Weight {c.weight}
              </span>
              <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-[11px] font-semibold text-white/70 ring-1 ring-white/10">
                Contribution {c.contribution}
              </span>
              <button
                type="button"
                onClick={() => props.onOpenEvidenceDimension(c.id)}
                data-evidence-origin={`dimension:${c.id}`}
                className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white ring-1 ring-white/15 hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              >
                View proof
              </button>
            </div>
          </div>

          <p className="mt-3 text-sm leading-6 text-white/70">{c.explanation}</p>

          {c.dataQuality.availability !== "ok" ? (
            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/70">
              Limited data: {c.dataQuality.notes[0] ?? "Insufficient history in this scope."}
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {c.evidenceIds.length > 0 ? (
              <>
                <div className="text-[11px] font-semibold tracking-wide text-white/60">Evidence IDs</div>
                {c.evidenceIds.slice(0, 4).map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => props.onOpenEvidenceId(id)}
                    data-evidence-origin={`evidenceId:${id}`}
                    className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/75 ring-1 ring-white/10 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                  >
                    {id}
                  </button>
                ))}
                {c.evidenceIds.length > 4 ? (
                  <span className="text-[11px] text-white/50">+{c.evidenceIds.length - 4} more</span>
                ) : null}
              </>
            ) : (
              <span className="text-[11px] text-white/50">No evidence IDs in this scope.</span>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

function EvidencePanel(props: {
  open: boolean;
  title: string;
  subtitle?: string | null;
  origin?: EvidenceFocusRestore | null;
  state: LoadState<EvidenceReadModel>;
  onClose: () => void;
}) {
  const { open, title, subtitle, origin, state, onClose } = props;
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const restoreTarget = useRef<EvidenceFocusRestore | null>(null);

  useEffect(() => {
    if (!open) return;
    if (origin) {
      restoreTarget.current = origin;
    } else {
      const active = document.activeElement;
      restoreTarget.current = active instanceof HTMLElement ? { kind: "element", element: active } : null;
    }
    closeRef.current?.focus();
  }, [open, origin]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (open) return;
    const target = restoreTarget.current;
    if (!target) return;
    const focusTarget = () => {
      const el =
        target.kind === "selector"
          ? document.querySelector(target.selector)
          : (target.element as unknown as { isConnected?: boolean }).isConnected
            ? target.element
            : null;
      if (!(el instanceof HTMLElement)) return;
      try {
        el.scrollIntoView?.({ block: "nearest", inline: "nearest" } as ScrollIntoViewOptions);
      } catch {
        // ignore
      }
      try {
        (el as unknown as { focus?: (opts?: { preventScroll?: boolean }) => void }).focus?.({ preventScroll: true });
      } catch {
        el.focus?.();
      }
    };

    // Next/router may apply its own focus behavior after URL changes. Try a couple times.
    const t1 = window.setTimeout(focusTarget, 0);
    const t2 = window.setTimeout(focusTarget, 75);
    const t3 = window.setTimeout(focusTarget, 200);
    const t4 = window.setTimeout(focusTarget, 600);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.clearTimeout(t4);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Evidence drawer"
      data-testid="evidence-drawer"
    >
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-[#07080A] shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 bg-white/[0.03] px-5 py-4">
          <div>
            <div className="text-xs font-semibold tracking-wide text-white/60">Evidence</div>
            <h3 className="mt-1 text-base font-semibold text-white">{title}</h3>
            {subtitle ? <div className="mt-1 text-xs text-white/60">{subtitle}</div> : null}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white/5 px-3 py-2 text-sm font-semibold text-white/80 ring-1 ring-white/10 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            Close
          </button>
        </div>

        <div
          className="max-h-[70vh] overflow-auto px-5 py-4"
          data-testid="evidence-drawer-body"
          data-evidence-status={state.status}
          aria-busy={state.status === "loading"}
        >
          {state.status === "ready" ? (
            <span data-testid="evidence-drawer-ready" hidden>
              Evidence content ready
            </span>
          ) : null}
          {state.status === "loading" ? (
            <div className="text-sm text-white/70">Loading evidence…</div>
          ) : state.status === "error" ? (
            <div className="rounded-xl border border-white/10 bg-black/35 p-4 text-sm text-white/70">
              {state.message}
            </div>
          ) : state.status === "ready" ? (
            state.data.ok ? (
              state.data.items.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-xs text-white/70">
                    <div>
                      Showing{" "}
                      <span className="font-semibold text-white/85 tabular-nums">{state.data.meta.returnedItems}</span> of{" "}
                      <span className="font-semibold text-white/85 tabular-nums">{state.data.meta.totalItems}</span> proof items
                      {state.data.meta.cap ? (
                        <>
                          {" "}
                          <span className="text-white/40" aria-hidden="true">
                            •
                          </span>{" "}
                          Cap {state.data.meta.cap}
                        </>
                      ) : null}
                    </div>
                    {state.data.meta.missingEvidenceIds.length > 0 ? (
                      <div>
                        <span className="font-semibold text-white/85 tabular-nums">{state.data.meta.missingEvidenceIds.length}</span>{" "}
                        missing reference(s) in this scope
                      </div>
                    ) : null}
                  </div>
                  {state.data.items.map((item) => (
                    <article key={item.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-white">
                          <span className="tabular-nums">{item.id}</span>{" "}
                          <span className="text-white/50">
                            {item.carrierName} • {item.period}
                          </span>
                        </div>
                        <div className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/70 ring-1 ring-white/10">
                          {item.region.toUpperCase()} • {item.productType} • {item.stage}
                        </div>
                      </div>
                      <div className="mt-2">
                        <div className="text-[11px] font-semibold tracking-wide text-white/60">Summary</div>
                        <p className="mt-1 text-sm leading-6 text-white/70">{item.summary}</p>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-white/60 sm:grid-cols-4">
                        <div>
                          <div className="font-semibold text-white/75">Evidence ID</div>
                          <div className="tabular-nums">{item.id}</div>
                        </div>
                        <div>
                          <div className="font-semibold text-white/75">Carrier</div>
                          <div>{item.carrierName}</div>
                        </div>
                        <div>
                          <div className="font-semibold text-white/75">Period</div>
                          <div className="tabular-nums">{item.period}</div>
                        </div>
                        <div>
                          <div className="font-semibold text-white/75">Region</div>
                          <div>{item.region.toUpperCase()}</div>
                        </div>
                        <div>
                          <div className="font-semibold text-white/75">Product</div>
                          <div>{formatEnumLabel(item.productType)}</div>
                        </div>
                        <div>
                          <div className="font-semibold text-white/75">Status / stage</div>
                          <div>{formatEnumLabel(item.stage)}</div>
                        </div>
                        <div>
                          <div className="font-semibold text-white/75">Delay reason</div>
                          <div>{item.delayReason}</div>
                        </div>
                        <div>
                          <div className="font-semibold text-white/75">Delay</div>
                          <div className="tabular-nums">{item.delayDays}d</div>
                        </div>
                        <div className="sm:col-span-2">
                          <div className="font-semibold text-white/75">Timing context</div>
                          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1">
                            <span>
                              Committed <span className="font-semibold text-white/80 tabular-nums">{item.committedDate.slice(0, 10)}</span>
                            </span>
                            <span>
                              Forecast{" "}
                              <span className="font-semibold text-white/80 tabular-nums">
                                {item.forecastDate ? item.forecastDate.slice(0, 10) : "—"}
                              </span>
                            </span>
                            <span>
                              Completed{" "}
                              <span className="font-semibold text-white/80 tabular-nums">
                                {item.completedDate ? item.completedDate.slice(0, 10) : "—"}
                              </span>
                            </span>
                          </div>
                        </div>
                        <div className="sm:col-span-2">
                          <div className="font-semibold text-white/75">Responsiveness / escalation context</div>
                          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1">
                            <span>
                              Response{" "}
                              <span className="font-semibold text-white/80 tabular-nums">{item.responsivenessHours}h</span>
                            </span>
                            <span>
                              Escalations{" "}
                              <span className="font-semibold text-white/80 tabular-nums">{item.escalationCount}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-white/10 bg-black/35 p-4 text-sm text-white/70">
                  No proof items are available for this scope. Broaden filters or select another driver.
                </div>
              )
            ) : (
              <div className="rounded-xl border border-white/10 bg-black/35 p-4 text-sm text-white/70">
                {state.data.error.message}
              </div>
            )
          ) : (
            <div className="text-sm text-white/70">Select a score component to view evidence.</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ExecutiveDashboardInteractive(props: { initialSummary: ScorecardsSummaryModel; runtime: RuntimePosture }) {
  const nextSearchParams = useSearchParams();
  const [searchString, setSearchString] = useState(() => nextSearchParams.toString());

  const [isPending, startTransition] = useTransition();

  const [optionsReloadToken, setOptionsReloadToken] = useState(0);
  const [optionsState, setOptionsState] = useState<LoadState<ScorecardsOptionsModel>>({ status: "loading" });
  const [summaryReloadToken, setSummaryReloadToken] = useState(0);
  const [summaryState, setSummaryState] = useState<LoadState<ScorecardsSummaryModel>>({
    status: "ready",
    data: props.initialSummary,
  });
  const [detailState, setDetailState] = useState<DetailLoadState<CarrierDetailReadModel>>({ status: "idle" });
  const [evidenceState, setEvidenceState] = useState<EvidenceLoadState<EvidenceReadModel>>({ status: "idle" });
  const [evidenceOrigin, setEvidenceOrigin] = useState<EvidenceFocusRestore | null>(null);

  const [transientBanner, setTransientBanner] = useState<string | null>(null);
  const [dismissedIssueKey, setDismissedIssueKey] = useState<string | null>(null);
  const lastAutoRecoveryKey = useRef<string | null>(null);

  const captureEvidenceOrigin = useCallback(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) {
      setEvidenceOrigin(null);
      return;
    }
    const key = active.getAttribute("data-evidence-origin");
    if (key) {
      const escaped = key.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
      setEvidenceOrigin({ kind: "selector", selector: `[data-evidence-origin="${escaped}"]` });
      return;
    }
    setEvidenceOrigin({ kind: "element", element: active });
  }, []);

  const allowedCarrierIds = useMemo(() => {
    if (optionsState.status !== "ready") return null;
    if (!optionsState.data.ok) return null;
    return optionsState.data.carriers.map((c) => c.id);
  }, [optionsState]);

  const allowedPeriods = useMemo(() => {
    if (optionsState.status !== "ready") return null;
    if (!optionsState.data.ok) return null;
    return optionsState.data.periods.map((p) => p.seedKey);
  }, [optionsState]);

  // URL is the source of truth. Keep a local string copy so back/forward and rapid sequential
  // updates are deterministic without relying on router timing.
  useEffect(() => {
    const sync = () => setSearchString(new URLSearchParams(window.location.search).toString());
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const parsed = useMemo(() => {
    const cloned = new URLSearchParams(searchString);
    return parseDashboardStateFromSearchParams(cloned, {
      allowedCarrierIds: allowedCarrierIds ?? undefined,
      allowedPeriods: allowedPeriods ?? undefined,
    });
  }, [searchString, allowedCarrierIds, allowedPeriods]);

  const state = parsed.state;
  const issues = parsed.issues;
  const { carrierId, region, productType, period } = state.filters;
  const stableFilters = useMemo<ScoreFilters>(
    () => ({
      carrierId,
      region,
      productType,
      period,
    }),
    [carrierId, period, productType, region]
  );

  // Keep an eager copy so rapid sequential updates (filter changes, selection changes) don't
  // accidentally drop earlier patches before the URL state is applied.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const issueKey = useMemo(() => issues.map((i) => `${i.kind}:${i.value}`).join("|"), [issues]);
  const issueBannerText = useMemo(() => issueNote(issues), [issues]);
  const issueBanner =
    issueBannerText && issueKey.length > 0 && dismissedIssueKey !== issueKey ? issueBannerText : null;

  const banner = transientBanner ?? issueBanner;
  const dismissBanner = useCallback(() => {
    if (transientBanner) {
      setTransientBanner(null);
      return;
    }
    if (issueKey.length > 0) setDismissedIssueKey(issueKey);
  }, [issueKey, transientBanner]);

  type UrlPatch = {
    filters?: Partial<ScoreFilters>;
    selectedCarrierId?: string | null;
    evidenceId?: string | null;
    evidenceDimension?: ScoringComponentId | null;
    evidenceDelayReason?: string | null;
  };

  const updateUrl = useCallback(
    (next: UrlPatch, opts?: { mode?: "push" | "replace" }) => {
      const base = stateRef.current;
      const nextState = {
        filters: { ...base.filters, ...(next.filters ?? {}) },
        selectedCarrierId: next.selectedCarrierId === undefined ? base.selectedCarrierId : next.selectedCarrierId,
        evidenceId: next.evidenceId === undefined ? base.evidenceId : next.evidenceId,
        evidenceDimension: next.evidenceDimension === undefined ? base.evidenceDimension : next.evidenceDimension,
        evidenceDelayReason: next.evidenceDelayReason === undefined ? base.evidenceDelayReason : next.evidenceDelayReason,
      };
      stateRef.current = nextState;
      const query = buildDashboardQueryString(nextState);
      const href = query.length > 0 ? `/${query}` : "/";
      if (opts?.mode === "replace") window.history.replaceState({}, "", href);
      else window.history.pushState({}, "", href);
      setSearchString(new URLSearchParams(window.location.search).toString());
    },
    []
  );

  const clearSelection = useCallback(() => {
    updateUrl(
      { selectedCarrierId: null, evidenceId: null, evidenceDimension: null, evidenceDelayReason: null },
      { mode: "replace" }
    );
  }, [updateUrl]);

  const clearFilters = useCallback(() => {
    updateUrl(
      {
        filters: { carrierId: null, region: null, productType: null, period: null },
        selectedCarrierId: null,
        evidenceId: null,
        evidenceDimension: null,
        evidenceDelayReason: null,
      },
      { mode: "replace" }
    );
  }, [updateUrl]);

  // Load filter options once (carriers + periods). These are used to sanitize deep links.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function run() {
      try {
        setOptionsState({ status: "loading" });
        const res = await fetch("/api/scorecards/options", { signal: controller.signal });
        const payload = (await res.json()) as ScorecardsOptionsModel;
        if (cancelled) return;
        if (!res.ok) {
          setOptionsState({ status: "error", message: "Unable to load filter options." });
          return;
        }
        setOptionsState({ status: "ready", data: payload });
      } catch (err) {
        if (cancelled) return;
        if ((err as { name?: string }).name === "AbortError") return;
        setOptionsState({ status: "error", message: "Unable to load filter options." });
      }
    }

    run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [optionsReloadToken]);

  const retryOptions = useCallback(() => {
    setOptionsState({ status: "loading" });
    setOptionsReloadToken((prev) => prev + 1);
  }, []);

  const retrySummary = useCallback(() => {
    setSummaryReloadToken((prev) => prev + 1);
  }, []);
  // Sanitize invalid URL state by replacing with a clean query string.
  useEffect(() => {
    if (issues.length === 0) return;

    const sanitizedQuery = buildDashboardQueryString(state);
    const current = searchString.length > 0 ? `?${searchString}` : "";
    if (sanitizedQuery !== current) {
      const note = issueNote(issues);
      if (!transientBanner && note && issueKey.length > 0 && lastAutoRecoveryKey.current !== issueKey) {
        lastAutoRecoveryKey.current = issueKey;
        // Promote the recovery note to a transient banner so it remains visible after we replace the URL.
        setTransientBanner(note);
      }
      const href = sanitizedQuery.length > 0 ? `/${sanitizedQuery}` : "/";
      window.history.replaceState({}, "", href);
      const sync = () => setSearchString(new URLSearchParams(window.location.search).toString());
      sync();
    }
  }, [issues, issueKey, searchString, state, transientBanner]);

  // Fetch summary whenever filters change.
  const summaryRequestSeq = useRef(0);
  useEffect(() => {
    const requestId = ++summaryRequestSeq.current;
    const controller = new AbortController();

    async function run() {
      startTransition(() => {
        setSummaryState((prev) => {
          if (prev.status === "ready") return { status: "loading", previous: prev.data };
          if (prev.status === "loading") return prev.previous ? { status: "loading", previous: prev.previous } : { status: "loading" };
          return { status: "loading" };
        });
      });

      try {
        const res = await fetch(`/api/scorecards/summary${buildFiltersQuery(stableFilters)}`, { signal: controller.signal });
        const payload = (await res.json()) as ScorecardsSummaryModel | { ok: false; error?: { message?: string } };

        if (requestId !== summaryRequestSeq.current) return;
        if (!res.ok || !(payload as ScorecardsSummaryModel).ok) {
          const message =
            (payload as { ok: false; error?: { message?: string } }).error?.message ??
            "Unable to load scorecards for this scope.";
          setSummaryState({ status: "error", message });
          return;
        }

        setSummaryState({ status: "ready", data: payload as ScorecardsSummaryModel });
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        if (requestId !== summaryRequestSeq.current) return;
        setSummaryState({ status: "error", message: "Unable to load scorecards for this scope." });
      }
    }

    run();
    return () => controller.abort();
  }, [stableFilters, startTransition, summaryReloadToken]);

  // Fetch carrier detail when selection changes.
  const detailRequestSeq = useRef(0);
  useEffect(() => {
    if (!state.selectedCarrierId) return;

    const requestId = ++detailRequestSeq.current;
    const controller = new AbortController();
    const requestCarrierId = state.selectedCarrierId;

    async function run() {
      setDetailState({ status: "loading", carrierId: requestCarrierId });
      try {
        const scoped = buildFiltersQuery({ ...stableFilters, carrierId: null });
        const res = await fetch(`/api/carriers/${requestCarrierId}/scorecard${scoped}`, { signal: controller.signal });
        const payload = (await res.json()) as CarrierDetailReadModel;
        if (requestId !== detailRequestSeq.current) return;
        if (!res.ok || !payload.ok) {
          const message =
            (payload as { ok: false; error: { message: string } }).error?.message ??
            "Unable to load carrier detail right now.";
          setDetailState({ status: "error", carrierId: requestCarrierId, message });
          return;
        }
        setDetailState({ status: "ready", carrierId: requestCarrierId, data: payload });
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        if (requestId !== detailRequestSeq.current) return;
        setDetailState({ status: "error", carrierId: requestCarrierId, message: "Unable to load carrier detail right now." });
      }
    }

    run();
    return () => controller.abort();
  }, [stableFilters, state.selectedCarrierId]);

  const evidenceCarrierId = state.selectedCarrierId ?? state.filters.carrierId ?? null;

  function evidenceRequestLabel() {
    if (state.evidenceId) return `Evidence ${state.evidenceId}`;
    if (state.evidenceDimension) return `Score driver: ${SCORE_MANIFEST.components[state.evidenceDimension].label}`;
    if (state.evidenceDelayReason) return `Delay reason: ${formatEnumLabel(state.evidenceDelayReason)}`;
    return "Evidence";
  }

  function evidenceRequestSubtitle() {
    const carrierTag = evidenceCarrierId ? "Scoped to selected carrier" : "All carriers in scope";
    const scope = scopeLabel;
    return `${carrierTag} • ${scope}`;
  }

  // Fetch evidence when evidence state changes.
  const evidenceRequestSeq = useRef(0);
  useEffect(() => {
    const mode = state.evidenceId ? "id" : state.evidenceDimension ? "dimension" : state.evidenceDelayReason ? "delayReason" : null;
    if (!mode) return;

    const requestId = ++evidenceRequestSeq.current;
    const controller = new AbortController();
    const requestKey = JSON.stringify({
      mode,
      evidenceId: state.evidenceId ?? null,
      evidenceDimension: state.evidenceDimension ?? null,
      evidenceDelayReason: state.evidenceDelayReason ?? null,
      evidenceCarrierId,
      filters: stableFilters,
    });

    async function run() {
      setEvidenceState({ status: "loading", requestKey });
      try {
        const filterParams = new URLSearchParams(buildFiltersQuery({ ...stableFilters, carrierId: evidenceCarrierId }).slice(1));
        if (mode === "id") filterParams.set("evidenceIds", state.evidenceId as string);
        if (mode === "dimension") filterParams.set("dimension", state.evidenceDimension as string);
        if (mode === "delayReason") filterParams.set("delayReason", state.evidenceDelayReason as string);
        if (mode !== "id") filterParams.set("cap", "18");
        const res = await fetch(`/api/evidence?${filterParams.toString()}`, { signal: controller.signal });
        const payload = (await res.json()) as EvidenceReadModel;
        if (requestId !== evidenceRequestSeq.current) return;
        if (!res.ok || !payload.ok) {
          const message =
            (payload as { ok: false; error: { message: string } }).error?.message ??
            "Unable to load evidence right now.";
          setEvidenceState({ status: "error", requestKey, message });
          return;
        }

        // If a specific evidence id was requested but not found, treat it as a filtered-out or missing reference.
        // Close it (safe recoverable behavior) and surface a banner.
        if (mode === "id" && payload.items.length === 0) {
          updateUrl({ evidenceId: null, evidenceDimension: null, evidenceDelayReason: null }, { mode: "replace" });
          setTransientBanner("That proof link is not available in the current scope.");
          return;
        }

        setEvidenceState({ status: "ready", requestKey, data: payload });
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        if (requestId !== evidenceRequestSeq.current) return;
        setEvidenceState({ status: "error", requestKey, message: "Unable to load evidence right now." });
      }
    }

    run();
    return () => controller.abort();
  }, [
    evidenceCarrierId,
    state.evidenceDelayReason,
    state.evidenceDimension,
    state.evidenceId,
    stableFilters,
    updateUrl,
  ]);

  const effectiveDetailState = useMemo<LoadState<CarrierDetailReadModel>>(() => {
    if (!state.selectedCarrierId) return { status: "idle" };
    if (detailState.status === "loading" && detailState.carrierId === state.selectedCarrierId) return { status: "loading" };
    if (detailState.status === "error" && detailState.carrierId === state.selectedCarrierId)
      return { status: "error", message: detailState.message };
    if (detailState.status === "ready" && detailState.carrierId === state.selectedCarrierId)
      return { status: "ready", data: detailState.data };
    // Selection changed but the request state hasn't caught up yet: show loading instead of stale carrier detail.
    return { status: "loading" };
  }, [detailState, state.selectedCarrierId]);

  const effectiveEvidenceState = useMemo<LoadState<EvidenceReadModel>>(() => {
    const mode = state.evidenceId ? "id" : state.evidenceDimension ? "dimension" : state.evidenceDelayReason ? "delayReason" : null;
    if (!mode) return { status: "idle" };
    const requestKey = JSON.stringify({
      mode,
      evidenceId: state.evidenceId ?? null,
      evidenceDimension: state.evidenceDimension ?? null,
      evidenceDelayReason: state.evidenceDelayReason ?? null,
      evidenceCarrierId,
      filters: stableFilters,
    });

    if (evidenceState.status === "loading" && evidenceState.requestKey === requestKey) return { status: "loading" };
    if (evidenceState.status === "error" && evidenceState.requestKey === requestKey)
      return { status: "error", message: evidenceState.message };
    if (evidenceState.status === "ready" && evidenceState.requestKey === requestKey)
      return { status: "ready", data: evidenceState.data };
    // Evidence scope changed: show loading instead of stale proof items.
    return { status: "loading" };
  }, [
    evidenceCarrierId,
    evidenceState,
    state.evidenceDelayReason,
    state.evidenceDimension,
    state.evidenceId,
    stableFilters,
  ]);

  const summary =
    summaryState.status === "ready"
      ? summaryState.data
      : summaryState.status === "loading"
        ? summaryState.previous ?? null
        : null;

  const carriersInScope = summary?.carriers ?? [];

  const scopeLabel = (() => {
    if (!summary) return "Scope is loading…";
    const f = summary.scope.filters;
    const period = f.period ? `Period ${f.period}` : summary.scope.periodWindow.mode === "all" ? "All periods" : "Period";
    const region = f.region ? `Region ${f.region.toUpperCase()}` : "All regions";
    const product = f.productType ? `Product ${f.productType}` : "All products";
    return `${period} • ${region} • ${product}`;
  })();

  const hasResults = (summary?.counts.deliveryRecords ?? 0) > 0;
  const activePills = useMemo(() => {
    const carrierLabel =
      state.filters.carrierId && optionsState.status === "ready" && optionsState.data.ok
        ? optionsState.data.carriers.find((c) => c.id === state.filters.carrierId)?.shortCode ?? null
        : null;
    const periodLabel =
      state.filters.period && optionsState.status === "ready" && optionsState.data.ok
        ? optionsState.data.periods.find((p) => p.seedKey === state.filters.period)?.label ?? null
        : null;
    return buildActiveFilterPills({ filters: state.filters, carrierLabel, periodLabel });
  }, [optionsState, state.filters]);

  const evidenceOpen = Boolean(state.evidenceId || state.evidenceDimension || state.evidenceDelayReason);
  const dashboardSettled =
    optionsState.status !== "loading" &&
    summaryState.status !== "loading" &&
    (!state.selectedCarrierId || effectiveDetailState.status !== "loading") &&
    (!evidenceOpen || effectiveEvidenceState.status !== "loading");

  return (
    <div className="relative flex-1 bg-[#07080A] text-white" data-testid="dashboard-root">
      {dashboardSettled ? (
        <span data-testid="dashboard-settled" hidden>
          Dashboard settled
        </span>
      ) : (
        <span data-testid="dashboard-settling" hidden>
          Dashboard settling
        </span>
      )}
      <ExecutiveDashboard
        summary={summary ?? props.initialSummary}
        runtime={props.runtime}
        selectedCarrierId={state.selectedCarrierId}
        onSelectCarrier={(carrierId) => {
          updateUrl({ selectedCarrierId: carrierId, evidenceId: null, evidenceDimension: null, evidenceDelayReason: null });
        }}
        onOpenEvidenceForDelayReason={(delayReason) => {
          captureEvidenceOrigin();
          updateUrl({ evidenceDelayReason: delayReason, evidenceId: null, evidenceDimension: null });
        }}
        onOpenEvidenceForGovernanceItem={(carrierId, dimension) => {
          captureEvidenceOrigin();
          updateUrl({
            selectedCarrierId: carrierId,
            evidenceDimension: dimension,
            evidenceId: null,
            evidenceDelayReason: null,
          });
        }}
        commandSurface={
          <section
            aria-label="Scope filters"
            className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-5 shadow-[0_1px_0_rgba(255,255,255,0.08)]"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold tracking-wide text-white">Scope controls</h2>
                <p className="mt-1 text-sm leading-6 text-white/70">
                  Filters compose by intersection. Use them to tighten the portfolio view without turning this into a ticket queue.
                </p>
                <div className="mt-2 text-xs font-semibold tracking-wide text-white/60" aria-live="polite">
                  {isPending ? "Updating scope…" : scopeLabel}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {activePills.map((p) => (
                  <PillButton
                    key={p.key}
                    label={p.label}
                    onClick={() => {
                      updateUrl({ filters: { [p.key]: null } as Partial<ScoreFilters> });
                    }}
                  />
                ))}
                {activePills.length > 0 ? (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex items-center justify-center rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/15 hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                  >
                    Reset
                  </button>
                ) : null}
              </div>
            </div>

            {banner ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/70">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>{banner}</div>
                  <button
                    type="button"
                  onClick={dismissBanner}
                    className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/75 ring-1 ring-white/10 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <FilterSelect
                id="carrier-filter"
                label="Carrier"
                value={state.filters.carrierId ?? ""}
                onChange={(next) => {
                  const carrierId = next.length > 0 ? next : null;
                  updateUrl({
                    filters: { carrierId },
                    selectedCarrierId: carrierId,
                    evidenceId: null,
                    evidenceDimension: null,
                    evidenceDelayReason: null,
                  });
                }}
              >
                <option value="">All carriers</option>
                {state.filters.carrierId && optionsState.status === "ready" && optionsState.data.ok ? (
                  optionsState.data.carriers.some((c) => c.id === state.filters.carrierId) ? null : (
                    <option value={state.filters.carrierId}>Selected carrier ({state.filters.carrierId.slice(0, 8)}…)</option>
                  )
                ) : state.filters.carrierId ? (
                  <option value={state.filters.carrierId}>Selected carrier ({state.filters.carrierId.slice(0, 8)}…)</option>
                ) : null}
                {optionsState.status === "ready" && optionsState.data.ok
                  ? optionsState.data.carriers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.shortCode})
                      </option>
                    ))
                  : null}
              </FilterSelect>

              <FilterSelect
                id="region-filter"
                label="Region"
                value={state.filters.region ?? ""}
                onChange={(next) => updateUrl({ filters: { region: next.length > 0 ? (next as Region) : null } })}
              >
                <option value="">All regions</option>
                {REGION_VALUES.map((r) => (
                  <option key={r} value={r}>
                    {formatEnumLabel(r)}
                  </option>
                ))}
              </FilterSelect>

              <FilterSelect
                id="product-filter"
                label="Product type"
                value={state.filters.productType ?? ""}
                onChange={(next) => updateUrl({ filters: { productType: next.length > 0 ? (next as ProductType) : null } })}
              >
                <option value="">All products</option>
                {PRODUCT_TYPE_VALUES.map((p) => (
                  <option key={p} value={p}>
                    {formatEnumLabel(p)}
                  </option>
                ))}
              </FilterSelect>

              <FilterSelect
                id="period-filter"
                label="Period"
                value={state.filters.period ?? ""}
                onChange={(next) => updateUrl({ filters: { period: next.length > 0 ? next : null } })}
              >
                <option value="">All periods</option>
                {state.filters.period && optionsState.status === "ready" && optionsState.data.ok ? (
                  optionsState.data.periods.some((p) => p.seedKey === state.filters.period) ? null : (
                    <option value={state.filters.period}>Selected period ({state.filters.period})</option>
                  )
                ) : state.filters.period ? (
                  <option value={state.filters.period}>Selected period ({state.filters.period})</option>
                ) : null}
                {optionsState.status === "ready" && optionsState.data.ok
                  ? optionsState.data.periods.map((p) => (
                      <option key={p.seedKey} value={p.seedKey}>
                        {p.label}
                      </option>
                    ))
                  : null}
              </FilterSelect>
            </div>

            {optionsState.status === "loading" ? (
              <div className="mt-4 text-xs font-semibold tracking-wide text-white/60" aria-live="polite">
                Loading filter options…
              </div>
            ) : optionsState.status === "error" ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-4 text-sm text-white/70">
                {optionsState.message}{" "}
                <button
                  type="button"
                  onClick={retryOptions}
                  className="ml-2 inline-flex items-center justify-center rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/15 hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                >
                  Retry
                </button>
              </div>
            ) : null}

            {summaryState.status === "error" ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-4 text-sm text-white/70">
                {summaryState.message}{" "}
                <button
                  type="button"
                  onClick={() => {
                    retrySummary();
                  }}
                  className="ml-2 inline-flex items-center justify-center rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/15 hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                >
                  Retry
                </button>
              </div>
            ) : null}
          </section>
        }
        comparisonAndDetail={
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold tracking-wide text-white">Carrier comparison</h2>
                  <p className="mt-1 text-sm leading-6 text-white/70">
                    Deterministic ranking follows the score engine, including stable tie rules.
                  </p>
                </div>
                <div className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-white/70 ring-1 ring-white/10">
                  {summary ? `${summary.counts.carriers} carriers` : "Loading"}
                </div>
              </div>

              <div className="mt-4 space-y-3" aria-live="polite">
                {summaryState.status === "loading" ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/70">
                    Updating comparison…
                  </div>
                ) : summaryState.status === "error" ? (
                  <div className="rounded-2xl border border-white/10 bg-black/35 p-5 text-sm text-white/70">
                    {summaryState.message}{" "}
                    <button
                      type="button"
                      onClick={() => {
                        retrySummary();
                      }}
                      className="ml-2 inline-flex items-center justify-center rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/15 hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                    >
                      Retry
                    </button>
                  </div>
                ) : summary && !hasResults ? (
                  <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                    <div className="text-sm font-semibold text-white">No results in this scope</div>
                    <div className="mt-2 text-sm leading-6 text-white/70">
                      The selected filters remove all records. This is safe and expected in a fictional dataset. Broaden the
                      scope to restore rankings and details.
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="inline-flex items-center justify-center rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/15 hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                      >
                        Reset filters
                      </button>
                      <button
                        type="button"
                        onClick={clearSelection}
                        className="inline-flex items-center justify-center rounded-lg bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 ring-1 ring-white/10 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                      >
                        Clear selection
                      </button>
                    </div>
                  </div>
                ) : (
                  carriersInScope.map((sc, idx) => (
                    <ComparisonCard
                      key={sc.carrier.id}
                      rank={idx + 1}
                      total={carriersInScope.length}
                      scorecard={sc}
                      selected={state.selectedCarrierId === sc.carrier.id}
                      onSelect={() => {
                        updateUrl({
                          selectedCarrierId: sc.carrier.id,
                          evidenceId: null,
                          evidenceDimension: null,
                          evidenceDelayReason: null,
                        });
                      }}
                    />
                  ))
                )}
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold tracking-wide text-white">Selected carrier detail</h2>
                  <p className="mt-1 text-sm leading-6 text-white/70">
                    Transparent breakdown with raw metrics, normalization, weights, and evidence IDs.
                  </p>
                </div>
                {state.selectedCarrierId ? (
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-white/70 ring-1 ring-white/10 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                  >
                    Clear
                  </button>
                ) : null}
              </div>

              <div className="mt-4">
                {!state.selectedCarrierId ? (
                  <div className="rounded-2xl border border-white/10 bg-black/35 p-5 text-sm text-white/70">
                    Select a carrier from the comparison list to review its score breakdown.
                  </div>
                ) : effectiveDetailState.status === "loading" ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/70">
                    Loading carrier detail…
                  </div>
                ) : effectiveDetailState.status === "error" ? (
                  <div className="rounded-2xl border border-white/10 bg-black/35 p-5 text-sm text-white/70">
                    {effectiveDetailState.message}
                  </div>
                ) : effectiveDetailState.status === "ready" ? (
                  effectiveDetailState.data.ok ? (
                    effectiveDetailState.data.carrier && effectiveDetailState.data.scorecard ? (
                      <div>
                        <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-5 shadow-[0_1px_0_rgba(255,255,255,0.08)]">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div className="text-xs font-semibold tracking-wide text-white/60">Carrier</div>
                              <div className="mt-1 text-lg font-semibold text-white">
                                {effectiveDetailState.data.carrier.name}{" "}
                                <span className="text-white/50">({effectiveDetailState.data.carrier.shortCode})</span>
                              </div>
                              <div className="mt-1 text-xs text-white/60">
                                Tier{" "}
                                <span className="font-semibold text-white/75">
                                  {effectiveDetailState.data.carrier.relationshipTier}
                                </span>{" "}
                                <span className="mx-1 text-white/25" aria-hidden="true">
                                  •
                                </span>
                                Region focus{" "}
                                <span className="font-semibold text-white/75">
                                  {effectiveDetailState.data.carrier.regionFocus.toUpperCase()}
                                </span>
                                <span className="mx-1 text-white/25" aria-hidden="true">
                                  •
                                </span>
                                Product mix{" "}
                                <span className="font-semibold text-white/75">
                                  {effectiveDetailState.data.scorecard.mix.productTypes[0]
                                    ? `${formatEnumLabel(effectiveDetailState.data.scorecard.mix.productTypes[0].productType)} (${Math.round(effectiveDetailState.data.scorecard.mix.productTypes[0].share * 100)}%)`
                                    : "—"}
                                </span>
                              </div>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-black/35 px-3 py-2">
                              <div className="text-[11px] font-semibold tracking-wide text-white/60">Total</div>
                              <div className="mt-1 text-2xl font-semibold tabular-nums text-white">
                                {effectiveDetailState.data.scorecard.totalScore}{" "}
                                <span className="text-sm font-semibold text-white/60">
                                  Grade {effectiveDetailState.data.scorecard.grade}
                                </span>
                              </div>
                              {effectiveDetailState.data.scorecard.confidence.lowVolume ? (
                                <div className="mt-1 text-xs text-white/60">
                                  Limited sample size ({effectiveDetailState.data.scorecard.sampleCount}). Treat this as directional.
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4">
                          <ScoreBreakdownTable
                            scorecard={effectiveDetailState.data.scorecard}
                            onOpenEvidenceId={(evidenceId) => {
                              captureEvidenceOrigin();
                              updateUrl({ evidenceId, evidenceDimension: null, evidenceDelayReason: null });
                            }}
                            onOpenEvidenceDimension={(dimension) => {
                              captureEvidenceOrigin();
                              updateUrl({ evidenceDimension: dimension, evidenceId: null, evidenceDelayReason: null });
                            }}
                          />
                        </div>
                      </div>
                    ) : effectiveDetailState.data.carrier && !effectiveDetailState.data.scorecard ? (
                      <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                        <div className="text-sm font-semibold text-white">No records in this scope</div>
                        <div className="mt-2 text-sm leading-6 text-white/70">
                          {effectiveDetailState.data.message ?? "This carrier has no records under the selected filters."}
                        </div>
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={clearFilters}
                            className="inline-flex items-center justify-center rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/15 hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                          >
                            Broaden scope
                          </button>
                          <button
                            type="button"
                            onClick={clearSelection}
                            className="inline-flex items-center justify-center rounded-lg bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 ring-1 ring-white/10 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                          >
                            Clear selection
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                        <div className="text-sm font-semibold text-white">Unknown carrier</div>
                        <div className="mt-2 text-sm leading-6 text-white/70">
                          {effectiveDetailState.data.message ?? "This carrier id does not exist in the fictional dataset."}
                        </div>
                        <div className="mt-4">
                          <button
                            type="button"
                            onClick={clearSelection}
                            className="inline-flex items-center justify-center rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/15 hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                          >
                            Return to overview
                          </button>
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="rounded-2xl border border-white/10 bg-black/35 p-5 text-sm text-white/70">
                      {effectiveDetailState.data.error.message}
                    </div>
                  )
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-black/35 p-5 text-sm text-white/70">
                    Select a carrier to see detail.
                  </div>
                )}
              </div>
            </div>
          </div>
        }
      />

      <EvidencePanel
        open={Boolean(state.evidenceId || state.evidenceDimension || state.evidenceDelayReason)}
        title={evidenceRequestLabel()}
        subtitle={evidenceRequestSubtitle()}
        origin={evidenceOrigin}
        state={effectiveEvidenceState}
        onClose={() => updateUrl({ evidenceId: null, evidenceDimension: null, evidenceDelayReason: null }, { mode: "replace" })}
      />
    </div>
  );
}
