import { SCORE_GRADE_THRESHOLDS } from "@/lib/scoring/manifest";
import type {
  CarrierScorecard,
  ScoreComponentResult,
  ScoreGrade,
  ScoreScope,
  ScoringComponentId,
} from "@/lib/scoring/types";

export type TrendLabel = "improving" | "declining" | "stable" | "watch" | "unknown";

export function gradeFromScore(score: number): ScoreGrade {
  const sorted = [...SCORE_GRADE_THRESHOLDS].sort((a, b) => b.minScore - a.minScore);
  for (const t of sorted) {
    if (score >= t.minScore) return t.grade;
  }
  return "F";
}

export function trendLabelForDelta(delta: number, available: boolean): TrendLabel {
  if (!available) return "unknown";
  if (delta >= 0.05) return "improving";
  if (delta <= -0.05) return "declining";
  if (delta <= -0.02) return "watch";
  return "stable";
}

function getComponent(scorecard: CarrierScorecard, id: ScoringComponentId): ScoreComponentResult | null {
  return scorecard.components.find((c) => c.id === id) ?? null;
}

export function gradeCounts(scorecards: readonly CarrierScorecard[]) {
  const counts: Record<ScoreGrade, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const c of scorecards) counts[c.grade] += 1;
  return counts;
}

export function scopeLabel(scope: ScoreScope) {
  const filters = scope.filters;
  const period = (() => {
    if (scope.periodWindow.mode === "single") {
      const seedKey = scope.periodWindow.seedKey ?? "unknown";
      const dates =
        scope.periodWindow.startDate && scope.periodWindow.endDate
          ? ` (${scope.periodWindow.startDate} to ${scope.periodWindow.endDate})`
          : "";
      return `Period: ${seedKey}${dates}`;
    }
    if (scope.periodWindow.startDate && scope.periodWindow.endDate) {
      return `All periods: ${scope.periodWindow.startDate} to ${scope.periodWindow.endDate}`;
    }
    return "All periods";
  })();

  const region = filters.region ? `Region: ${filters.region.toUpperCase()}` : "All regions";
  const product = filters.productType ? `Product: ${filters.productType}` : "All products";
  const carrier = filters.carrierId ? "Single carrier scope" : "All carriers";

  return { period, region, product, carrier };
}

export function portfolioHealth(scorecards: readonly CarrierScorecard[]) {
  if (scorecards.length === 0) return { score: 0, grade: gradeFromScore(0) };
  const avg = scorecards.reduce((acc, c) => acc + c.totalScore, 0) / scorecards.length;
  const score = Math.round(avg);
  return { score, grade: gradeFromScore(score) };
}

export function governanceAttentionCount(scorecards: readonly CarrierScorecard[]) {
  return scorecards.filter((c) => c.grade === "D" || c.grade === "F").length;
}

export function lowConfidenceCount(scorecards: readonly CarrierScorecard[]) {
  return scorecards.filter((c) => c.confidence.label === "low").length;
}

export function commitmentOnTimeRate(scorecards: readonly CarrierScorecard[]) {
  let onTime = 0;
  let completed = 0;

  for (const sc of scorecards) {
    const comp = getComponent(sc, "commitment_adherence");
    if (!comp) continue;
    if (comp.metric.kind !== "ratio") continue;
    onTime += comp.metric.numerator;
    completed += comp.metric.denominator;
  }

  const rate = completed > 0 ? onTime / completed : 0;
  return { onTime, completed, rate };
}

export function completionTrend(scorecards: readonly CarrierScorecard[]) {
  let weightedDelta = 0;
  let weight = 0;
  let unavailable = 0;

  for (const sc of scorecards) {
    const comp = getComponent(sc, "completion_trend");
    if (!comp || comp.metric.kind !== "scalar") continue;
    const available = comp.dataQuality.availability === "ok";
    if (!available) {
      unavailable += 1;
      continue;
    }
    weightedDelta += comp.metric.value * sc.sampleCount;
    weight += sc.sampleCount;
  }

  const delta = weight > 0 ? weightedDelta / weight : 0;
  const available = weight > 0;
  const label = trendLabelForDelta(delta, available);
  return { delta, label, unavailableCarriers: unavailable };
}

export function topDrivers(scorecard: CarrierScorecard, count: number, kind: "strength" | "concern") {
  const ranked = [...scorecard.components].sort((a, b) => {
    const aScore = a.normalizedScore;
    const bScore = b.normalizedScore;
    return kind === "strength" ? bScore - aScore : aScore - bScore;
  });
  return ranked.slice(0, count);
}

export function executiveAttentionList(scorecards: readonly CarrierScorecard[]) {
  const candidates = scorecards.filter((c) => c.grade === "D" || c.grade === "F" || c.confidence.lowVolume);
  const sorted = [...candidates].sort((a, b) => a.totalScore - b.totalScore);

  return sorted.slice(0, 6).map((c) => {
    const concerns = topDrivers(c, 2, "concern");
    const primary = concerns[0];
    const label =
      c.grade === "F"
        ? "Immediate governance"
        : c.grade === "D"
          ? "Governance attention"
          : c.confidence.lowVolume
            ? "Low-confidence read"
            : "Watch";

    const reason =
      primary?.id === "delay_severity"
        ? "Delay severity is pulling the grade."
        : primary?.id === "commitment_adherence"
          ? "On-time delivery rate is below the portfolio."
          : primary?.id === "repeat_issue_concentration"
            ? "Repeat-issue concentration is elevated."
            : primary?.id === "responsiveness"
              ? "Responsiveness is slower than expected."
              : primary?.id === "aging_open_commitments"
                ? "Open commitments are aging in the window."
                : primary?.id === "escalation_volume"
                  ? "Escalation density is elevated."
                  : primary?.id === "completion_trend"
                    ? "Momentum is softening over the window."
                    : "Multiple drivers are pulling the grade.";

    return {
      carrierId: c.carrier.id,
      carrierName: c.carrier.name,
      grade: c.grade,
      totalScore: c.totalScore,
      priorityLabel: label,
      reason,
      discussionAngle: "Agree next actions and escalation cadence for the next QBR cycle.",
      concerns,
      lowConfidence: c.confidence.lowVolume,
      sampleCount: c.sampleCount,
    };
  });
}
