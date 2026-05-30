import type { CSSProperties } from "react";

import type { CarrierScorecard, ScoreGrade } from "@/lib/scoring/types";
import { SCORE_GRADE_THRESHOLDS } from "@/lib/scoring/manifest";

function clamp01(value: number) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function gradeColor(grade: ScoreGrade) {
  switch (grade) {
    case "A":
      return "bg-emerald-500/15 text-emerald-100 ring-emerald-400/20";
    case "B":
      return "bg-teal-500/15 text-teal-100 ring-teal-400/20";
    case "C":
      return "bg-sky-500/15 text-sky-100 ring-sky-400/20";
    case "D":
      return "bg-amber-500/15 text-amber-100 ring-amber-400/20";
    case "F":
      return "bg-rose-500/15 text-rose-100 ring-rose-400/20";
  }
}

function segmentStops() {
  const thresholds = [...SCORE_GRADE_THRESHOLDS].sort((a, b) => b.minScore - a.minScore);
  return thresholds.map((t, idx) => {
    const start = t.minScore;
    const end = idx === 0 ? 100 : thresholds[idx - 1]!.minScore;
    return { grade: t.grade, start, end };
  });
}

export function HealthSpectrum(props: {
  scorecards: readonly CarrierScorecard[];
  portfolioScore: number;
  portfolioGrade: ScoreGrade;
  selectedCarrierId?: string | null;
  onSelectCarrier?: (carrierId: string) => void;
}) {
  const segments = segmentStops();
  const interactive = Boolean(props.onSelectCarrier);
  const onSelectCarrier = props.onSelectCarrier;
  const selectedCarrierId = props.selectedCarrierId ?? null;
  const markers = [...props.scorecards]
    .slice(0, 28)
    .map((c, idx) => {
      const left = clamp01(c.totalScore / 100) * 100;
      const row = idx % 2;
      const top = row === 0 ? 14 : 30;
      const style = { left: `${left}%`, top } satisfies CSSProperties;
      return { id: c.carrier.id, shortCode: c.carrier.shortCode, name: c.carrier.name, grade: c.grade, style };
    });

  const portfolioLeft = clamp01(props.portfolioScore / 100) * 100;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-5 shadow-[0_1px_0_rgba(255,255,255,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-white">Carrier health spectrum</h2>
          <p className="mt-1 text-sm leading-6 text-white/70">
            Each marker is a fictional carrier, positioned by deterministic score. Bands map to grade thresholds.
          </p>
        </div>
        <div className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${gradeColor(props.portfolioGrade)}`}>
          Portfolio: {props.portfolioGrade} ({props.portfolioScore})
        </div>
      </div>

      <div className="mt-4">
        <div className="relative h-14 rounded-xl border border-white/10 bg-black/35">
          <div className="absolute inset-0 pointer-events-none opacity-70 [mask-image:radial-gradient(70%_90%_at_50%_10%,black,transparent)]">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.12)_1px,transparent_1px)] bg-[length:32px_32px]" />
            <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[length:32px_32px]" />
          </div>

          <div className="absolute inset-0 flex">
            {segments.map((s) => {
              const width = ((s.end - s.start) / 100) * 100;
              return (
                <div
                  key={s.grade}
                  className="relative flex h-full items-end justify-center border-r border-white/10 last:border-r-0"
                  style={{ width: `${width}%` }}
                >
                  <div className="absolute inset-0 opacity-80">
                    <div
                      className={
                        s.grade === "A"
                          ? "h-full bg-gradient-to-b from-emerald-500/25 to-emerald-500/5"
                          : s.grade === "B"
                            ? "h-full bg-gradient-to-b from-teal-500/25 to-teal-500/5"
                            : s.grade === "C"
                              ? "h-full bg-gradient-to-b from-sky-500/25 to-sky-500/5"
                              : s.grade === "D"
                                ? "h-full bg-gradient-to-b from-amber-500/25 to-amber-500/5"
                                : "h-full bg-gradient-to-b from-rose-500/25 to-rose-500/5"
                      }
                    />
                  </div>
                  <div className="relative mb-2 rounded-full bg-black/40 px-2 py-0.5 text-[11px] font-semibold text-white/80 ring-1 ring-white/10">
                    {s.grade}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="absolute inset-0">
            {markers.map((m) => {
              const selected = selectedCarrierId === m.id;
              const markerClasses = `relative rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${gradeColor(m.grade)} ${
                selected ? "ring-white/50" : ""
              }`;

              return interactive ? (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onSelectCarrier?.(m.id)}
                  className="absolute -translate-x-1/2 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                  style={m.style}
                  aria-label={`Select carrier ${m.name} (${m.shortCode})`}
                  aria-pressed={selected}
                  data-testid="health-spectrum-carrier"
                  data-carrier-id={m.id}
                >
                  <span className={markerClasses}>{m.shortCode}</span>
                </button>
              ) : (
                <div key={m.id} className="absolute -translate-x-1/2" style={m.style}>
                  <div className={markerClasses}>{m.shortCode}</div>
                </div>
              );
            })}

            <div className="absolute -translate-x-1/2" style={{ left: `${portfolioLeft}%`, top: 2 }}>
              <div className="h-11 w-0.5 rounded-full bg-white/70 shadow-[0_0_0_1px_rgba(0,0,0,0.6)]" aria-hidden="true" />
              <div className="mt-1 text-[10px] font-semibold text-white/80">portfolio</div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/70">
          <span className="rounded-full bg-white/5 px-2 py-1 ring-1 ring-white/10">A: strong</span>
          <span className="rounded-full bg-white/5 px-2 py-1 ring-1 ring-white/10">B: healthy</span>
          <span className="rounded-full bg-white/5 px-2 py-1 ring-1 ring-white/10">C: watch</span>
          <span className="rounded-full bg-white/5 px-2 py-1 ring-1 ring-white/10">D/F: governance</span>
          <span className="ml-auto text-[11px] text-white/50">Showing up to 28 carriers</span>
        </div>
      </div>
    </div>
  );
}
