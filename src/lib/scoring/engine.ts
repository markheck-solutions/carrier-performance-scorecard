import {
  SCORE_COMPONENTS,
  SCORE_GRADE_THRESHOLDS,
  SCORE_MANIFEST,
  SCORE_ROUNDING,
  SCORE_TIE_BREAKERS,
} from "./manifest";
import { normalizeLinear, roundTo } from "./normalize";
import { selectEvidenceIds, type EvidenceCandidate } from "./evidence";
import type { ProductType, Region } from "../domain/demo-values";
import type {
  CarrierScorecard,
  ConfidenceLabel,
  PeriodWindow,
  ScoreComponentResult,
  ScoreFilters,
  ScoreScope,
  ScoringComponentId,
  ScoreGrade,
} from "./types";

export type CarrierInfo = {
  id: string;
  name: string;
  shortCode: string;
  relationshipTier: string;
  regionFocus: string;
};

export type PeriodInfo = {
  id: string;
  seedKey: string;
  label: string;
  startDate: string;
  endDate: string;
};

export type DeliveryInfo = {
  id: string;
  carrierId: string;
  periodId: string;
  periodSeedKey: string;
  region: Region;
  productType: ProductType;
  stage: string;
  committedDate: string;
  completedDate: string | null;
  delayDays: number;
  delayReason: string;
  responsivenessHours: number;
  escalationCount: number;
  isRepeat: boolean;
  issueSignature: string;
  openedAtIso: string;
};

function normalizeFilters(filters: ScoreFilters): ScoreFilters {
  return {
    carrierId: filters.carrierId ?? null,
    region: filters.region ?? null,
    productType: filters.productType ?? null,
    period: filters.period ?? null,
  };
}

function computePeriodWindow(
  periodsInScope: readonly PeriodInfo[],
  selectedPeriodSeedKey: string | null,
): PeriodWindow {
  if (selectedPeriodSeedKey) {
    const match = periodsInScope.find((p) => p.seedKey === selectedPeriodSeedKey);
    if (match) {
      return {
        mode: "single",
        seedKey: match.seedKey,
        startDate: match.startDate,
        endDate: match.endDate,
      };
    }
    return { mode: "single", seedKey: selectedPeriodSeedKey };
  }

  if (periodsInScope.length === 0) return { mode: "all" };

  const sorted = [...periodsInScope].sort((a, b) => a.startDate.localeCompare(b.startDate));
  return {
    mode: "all",
    startDate: sorted[0]?.startDate,
    endDate: sorted[sorted.length - 1]?.endDate,
  };
}

function confidenceLabelForSample(sampleCount: number): ConfidenceLabel {
  if (sampleCount < SCORE_MANIFEST.lowVolume.sampleCountThreshold) return "low";
  if (sampleCount < SCORE_MANIFEST.lowVolume.sampleCountThreshold * 2) return "medium";
  return "high";
}

function pickEvidence(componentId: ScoringComponentId, candidates: readonly EvidenceCandidate[]) {
  const byDimension = candidates.filter((c) => c.dimension === componentId);
  const ids = byDimension.length > 0 ? selectEvidenceIds({ componentId, candidates: byDimension }) : [];
  return ids;
}

function average(values: readonly number[]) {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return sum / values.length;
}

function onTimeCompletionRate(deliveries: readonly DeliveryInfo[]) {
  const completed = deliveries.filter((d) => d.stage === "completed");
  if (completed.length === 0) return { numerator: 0, denominator: 0, rate: 0 };
  const onTime = completed.filter((d) => d.delayDays === 0).length;
  return { numerator: onTime, denominator: completed.length, rate: onTime / completed.length };
}

function computeTrendDelta(deliveries: readonly DeliveryInfo[]) {
  const byPeriod = new Map<string, DeliveryInfo[]>();
  for (const d of deliveries) {
    const arr = byPeriod.get(d.periodSeedKey) ?? [];
    arr.push(d);
    byPeriod.set(d.periodSeedKey, arr);
  }

  const periods = Array.from(byPeriod.keys()).sort((a, b) => a.localeCompare(b));
  if (periods.length < 2) return { available: false as const, delta: 0, start: 0, end: 0, periods: periods.length };

  const first = byPeriod.get(periods[0]) ?? [];
  const last = byPeriod.get(periods[periods.length - 1]) ?? [];
  const start = onTimeCompletionRate(first).rate;
  const end = onTimeCompletionRate(last).rate;
  return { available: true as const, delta: end - start, start, end, periods: periods.length };
}

function gradeFromScore(totalScore: number): ScoreGrade {
  const sorted = [...SCORE_GRADE_THRESHOLDS].sort((a, b) => b.minScore - a.minScore);
  for (const t of sorted) {
    if (totalScore >= t.minScore) return t.grade;
  }
  return "F";
}

function buildScope(filters: ScoreFilters, periodsInScope: readonly PeriodInfo[]): ScoreScope {
  const normalized = normalizeFilters(filters);
  const periodWindow = computePeriodWindow(periodsInScope, normalized.period);
  return { filters: normalized, periodWindow };
}

type ComponentMetricDraft = {
  availability: "ok" | "insufficient_data";
  dataNotes: string[];
  denominator: number;
  metricKind: "scalar" | "ratio";
  metricValue: number;
  numerator: number;
};

function missingData(
  note: string,
  draft: Omit<ComponentMetricDraft, "availability" | "dataNotes">,
): ComponentMetricDraft {
  return { ...draft, availability: "insufficient_data", dataNotes: [note] };
}

function okMetric(draft: Omit<ComponentMetricDraft, "availability" | "dataNotes">): ComponentMetricDraft {
  return { ...draft, availability: "ok", dataNotes: [] };
}

function commitmentMetric(deliveries: readonly DeliveryInfo[], note: string): ComponentMetricDraft {
  const rate = onTimeCompletionRate(deliveries);
  const draft = {
    denominator: rate.denominator,
    metricKind: "ratio" as const,
    metricValue: rate.rate,
    numerator: rate.numerator,
  };
  return rate.denominator === 0 ? missingData(note, { ...draft, metricValue: 0 }) : okMetric(draft);
}

function delayMetric(deliveries: readonly DeliveryInfo[], note: string): ComponentMetricDraft {
  const completed = deliveries.filter((d) => d.stage === "completed");
  const draft = {
    denominator: 0,
    metricKind: "scalar" as const,
    metricValue: average(completed.map((d) => d.delayDays)),
    numerator: 0,
  };
  return completed.length === 0 ? missingData(note, draft) : okMetric(draft);
}

function repeatMetric(deliveries: readonly DeliveryInfo[], note: string): ComponentMetricDraft {
  const repeats = deliveries.filter((d) => d.isRepeat).length;
  const denominator = deliveries.length;
  const draft = {
    denominator,
    metricKind: "ratio" as const,
    metricValue: denominator === 0 ? 0 : repeats / denominator,
    numerator: repeats,
  };
  return denominator === 0 ? missingData(note, draft) : okMetric(draft);
}

function averageMetric(values: readonly number[], note: string): ComponentMetricDraft {
  const draft = { denominator: 0, metricKind: "scalar" as const, metricValue: average(values), numerator: 0 };
  return values.length === 0 ? missingData(note, draft) : okMetric(draft);
}

function agingOpenCommitmentsMetric(
  deliveries: readonly DeliveryInfo[],
  periodsInScope: readonly PeriodInfo[],
  note: string,
): ComponentMetricDraft {
  const open = deliveries.filter((d) => d.stage === "open" || d.stage === "in_progress");
  const periodBySeedKey = new Map(periodsInScope.map((p) => [p.seedKey, p]));
  const aging = open.filter((d) => isAgingOpenCommitment(d, periodBySeedKey)).length;
  const draft = {
    denominator: open.length,
    metricKind: "ratio" as const,
    metricValue: open.length === 0 ? 0 : aging / open.length,
    numerator: aging,
  };
  return open.length === 0 ? missingData(note, draft) : okMetric(draft);
}

function isAgingOpenCommitment(delivery: DeliveryInfo, periodBySeedKey: Map<string, PeriodInfo>) {
  const period = periodBySeedKey.get(delivery.periodSeedKey);
  const end = period?.endDate ? Date.parse(`${period.endDate}T00:00:00.000Z`) : 0;
  const opened = Date.parse(delivery.openedAtIso);
  if (!Number.isFinite(end) || !Number.isFinite(opened) || end <= 0 || opened <= 0) return false;
  const ageDays = (end - opened) / (1000 * 60 * 60 * 24);
  return ageDays >= 30;
}

function trendMetric(deliveries: readonly DeliveryInfo[], note: string): ComponentMetricDraft {
  const trend = computeTrendDelta(deliveries);
  const draft = { denominator: 0, metricKind: "scalar" as const, metricValue: trend.delta, numerator: 0 };
  return trend.available ? okMetric(draft) : missingData(note, draft);
}

function componentMetric(params: {
  componentId: ScoringComponentId;
  deliveries: readonly DeliveryInfo[];
  periodsInScope: readonly PeriodInfo[];
  missingDataNote: string;
}): ComponentMetricDraft {
  switch (params.componentId) {
    case "commitment_adherence":
      return commitmentMetric(params.deliveries, params.missingDataNote);
    case "delay_severity":
      return delayMetric(params.deliveries, params.missingDataNote);
    case "repeat_issue_concentration":
      return repeatMetric(params.deliveries, params.missingDataNote);
    case "responsiveness":
      return averageMetric(
        params.deliveries.map((d) => d.responsivenessHours),
        params.missingDataNote,
      );
    case "aging_open_commitments":
      return agingOpenCommitmentsMetric(params.deliveries, params.periodsInScope, params.missingDataNote);
    case "escalation_volume":
      return averageMetric(
        params.deliveries.map((d) => d.escalationCount),
        params.missingDataNote,
      );
    case "completion_trend":
      return trendMetric(params.deliveries, params.missingDataNote);
  }
}

const staticComponentExplanations: Partial<Record<ScoringComponentId, string>> = {
  delay_severity: "Average delay days for completed deliveries in the selected scope.",
  escalation_volume: "Average escalations per record in the selected scope.",
  responsiveness: "Average responsiveness time in hours in the selected scope.",
};

function ratioExplanation(draft: ComponentMetricDraft, empty: string, populated: string) {
  return draft.denominator === 0 ? empty : populated;
}

function componentExplanation(componentId: ScoringComponentId, draft: ComponentMetricDraft): string {
  if (componentId === "commitment_adherence")
    return ratioExplanation(
      draft,
      "No completed deliveries in scope. Treat this signal as neutral and low confidence.",
      `On-time deliveries: ${draft.numerator}/${draft.denominator} in the selected scope.`,
    );
  if (componentId === "repeat_issue_concentration")
    return ratioExplanation(
      draft,
      "No deliveries in scope. Treat this signal as neutral and low confidence.",
      `Repeat-flagged records: ${draft.numerator}/${draft.denominator} in the selected scope.`,
    );
  if (componentId === "aging_open_commitments")
    return ratioExplanation(
      draft,
      "No open commitments in scope. Treat this signal as best-case.",
      `Aging open items (30+ days within period window): ${draft.numerator}/${draft.denominator}.`,
    );
  if (componentId === "completion_trend") return completionTrendExplanation(draft);
  return staticComponentExplanations[componentId] ?? "Score component in the selected scope.";
}

function completionTrendExplanation(draft: ComponentMetricDraft) {
  return draft.availability === "insufficient_data"
    ? "Not enough period history in the selected scope to determine momentum."
    : "Change in on-time completion rate from earlier to later periods in scope.";
}

function buildComponent(params: {
  componentId: ScoringComponentId;
  scope: ScoreScope;
  deliveries: readonly DeliveryInfo[];
  evidenceCandidates: readonly EvidenceCandidate[];
  sampleCount: number;
  periodsInScope: readonly PeriodInfo[];
}): ScoreComponentResult {
  const manifest = SCORE_COMPONENTS[params.componentId];
  const evidenceIds = pickEvidence(params.componentId, params.evidenceCandidates);
  const norm = manifest.normalization;
  const draft = componentMetric({
    componentId: params.componentId,
    deliveries: params.deliveries,
    periodsInScope: params.periodsInScope,
    missingDataNote: manifest.missingDataPolicy.note,
  });

  const normalizedScoreRaw =
    draft.availability === "insufficient_data"
      ? manifest.missingDataPolicy.normalizedScore
      : normalizeLinear({
          value: draft.metricValue,
          best: norm.best,
          worst: norm.worst,
          floor: norm.floor,
          cap: norm.cap,
          direction: manifest.direction,
        });

  const normalizedScore = roundTo(normalizedScoreRaw, SCORE_ROUNDING.normalizedScoreDecimals);
  const contributionRaw = (normalizedScore / 100) * manifest.weight;
  const contribution = roundTo(contributionRaw, SCORE_ROUNDING.contributionDecimals);

  return {
    id: manifest.id,
    label: manifest.label,
    direction: manifest.direction,
    weight: manifest.weight,
    metric:
      draft.metricKind === "ratio"
        ? { kind: "ratio", numerator: draft.numerator, denominator: draft.denominator, unit: manifest.unit }
        : { kind: "scalar", value: draft.metricValue, unit: manifest.unit },
    sampleCount: params.sampleCount,
    evidenceCount: evidenceIds.length,
    evidenceIds,
    normalization: norm,
    normalizedScore,
    contribution,
    explanation: componentExplanation(params.componentId, draft),
    dataQuality: {
      availability: draft.availability,
      notes: draft.dataNotes,
    },
    scope: params.scope,
  };
}

function groupDeliveriesByCarrier(deliveries: readonly DeliveryInfo[]) {
  const grouped = new Map<string, DeliveryInfo[]>();
  for (const delivery of deliveries) {
    grouped.set(delivery.carrierId, [...(grouped.get(delivery.carrierId) ?? []), delivery]);
  }
  return grouped;
}

function groupEvidenceByCarrier(evidenceCandidates: readonly EvidenceCandidate[]) {
  const grouped = new Map<string, EvidenceCandidate[]>();
  for (const evidence of evidenceCandidates) {
    grouped.set(evidence.carrierId, [...(grouped.get(evidence.carrierId) ?? []), evidence]);
  }
  return grouped;
}

function countBy<T extends string>(values: readonly T[]) {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function sortedShares<T extends string>(counts: Map<T, number>, sampleCount: number, key: "region" | "productType") {
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ [key]: value, count, share: sampleCount > 0 ? count / sampleCount : 0 }));
}

function confidenceForSample(sampleCount: number) {
  const lowVolume = sampleCount < SCORE_MANIFEST.lowVolume.sampleCountThreshold;
  return {
    label: confidenceLabelForSample(sampleCount),
    lowVolume,
    threshold: SCORE_MANIFEST.lowVolume.sampleCountThreshold,
    notes: lowVolume
      ? [`Limited sample size (${sampleCount} record(s)) in this scope. Treat rankings and grades as directional.`]
      : [],
  };
}

function buildCarrierScorecard(params: {
  carrier: CarrierInfo;
  carrierDeliveries: readonly DeliveryInfo[];
  carrierEvidence: readonly EvidenceCandidate[];
  periods: readonly PeriodInfo[];
  scope: ScoreScope;
}): CarrierScorecard {
  const sampleCount = params.carrierDeliveries.length;
  const regions = sortedShares(countBy(params.carrierDeliveries.map((d) => d.region)), sampleCount, "region") as Array<{
    region: Region;
    count: number;
    share: number;
  }>;
  const productTypes = sortedShares(
    countBy(params.carrierDeliveries.map((d) => d.productType)),
    sampleCount,
    "productType",
  ) as Array<{ productType: ProductType; count: number; share: number }>;
  const components = (Object.keys(SCORE_COMPONENTS) as ScoringComponentId[]).map((id) =>
    buildComponent({
      componentId: id,
      scope: params.scope,
      deliveries: params.carrierDeliveries,
      evidenceCandidates: params.carrierEvidence,
      sampleCount,
      periodsInScope: params.periods,
    }),
  );
  const totalScore = roundTo(
    components.reduce((acc, c) => acc + c.contribution, 0),
    SCORE_ROUNDING.totalScoreDecimals,
  );

  return {
    carrier: params.carrier,
    scope: params.scope,
    mix: {
      regions,
      productTypes,
      topRegion: regions[0]?.region ?? null,
      topProductType: productTypes[0]?.productType ?? null,
    },
    sampleCount,
    confidence: confidenceForSample(sampleCount),
    components,
    totalScore,
    grade: gradeFromScore(totalScore),
    rankTieBreaker: [...SCORE_TIE_BREAKERS],
  };
}

function rankScorecards(scorecards: CarrierScorecard[]) {
  return scorecards.sort((a, b) => {
    if (a.totalScore !== b.totalScore) return b.totalScore - a.totalScore;
    if (a.carrier.name !== b.carrier.name) return a.carrier.name.localeCompare(b.carrier.name);
    return a.carrier.id.localeCompare(b.carrier.id);
  });
}

export function buildCarrierScorecards(params: {
  carriers: readonly CarrierInfo[];
  periods: readonly PeriodInfo[];
  deliveries: readonly DeliveryInfo[];
  evidenceCandidates: readonly EvidenceCandidate[];
  filters: ScoreFilters;
}) {
  const scope = buildScope(params.filters, params.periods);
  const deliveriesByCarrier = groupDeliveriesByCarrier(params.deliveries);
  const evidenceByCarrier = groupEvidenceByCarrier(params.evidenceCandidates);
  const scorecards = params.carriers.flatMap((carrier) => {
    const carrierDeliveries = deliveriesByCarrier.get(carrier.id) ?? [];
    return carrierDeliveries.length === 0
      ? []
      : [
          buildCarrierScorecard({
            carrier,
            carrierDeliveries,
            carrierEvidence: evidenceByCarrier.get(carrier.id) ?? [],
            periods: params.periods,
            scope,
          }),
        ];
  });

  return { scope, scorecards: rankScorecards(scorecards) };
}
