import {
  SCORE_COMPONENTS,
  SCORE_GRADE_THRESHOLDS,
  SCORE_MANIFEST,
  SCORE_ROUNDING,
  SCORE_TIE_BREAKERS,
} from "./manifest";
import { normalizeLinear, roundTo } from "./normalize";
import { selectEvidenceIds, type EvidenceCandidate } from "./evidence";
import type { ProductType, Region } from "../db/demo-values";
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

  const dataNotes: string[] = [];
  let availability: "ok" | "insufficient_data" = "ok";

  const norm = manifest.normalization;
  let metricValue: number;
  let metricKind: "scalar" | "ratio" = "scalar";
  let numerator = 0;
  let denominator = 0;

  switch (params.componentId) {
    case "commitment_adherence": {
      const rate = onTimeCompletionRate(params.deliveries);
      metricKind = "ratio";
      numerator = rate.numerator;
      denominator = rate.denominator;
      metricValue = rate.rate;
      if (denominator === 0) {
        availability = "insufficient_data";
        dataNotes.push(manifest.missingDataPolicy.note);
        metricValue = 0;
      }
      break;
    }
    case "delay_severity": {
      const completed = params.deliveries.filter((d) => d.stage === "completed");
      metricValue = average(completed.map((d) => d.delayDays));
      metricKind = "scalar";
      if (completed.length === 0) {
        availability = "insufficient_data";
        dataNotes.push(manifest.missingDataPolicy.note);
      }
      break;
    }
    case "repeat_issue_concentration": {
      const repeats = params.deliveries.filter((d) => d.isRepeat).length;
      metricKind = "ratio";
      numerator = repeats;
      denominator = params.deliveries.length;
      metricValue = denominator === 0 ? 0 : repeats / denominator;
      if (denominator === 0) {
        availability = "insufficient_data";
        dataNotes.push(manifest.missingDataPolicy.note);
      }
      break;
    }
    case "responsiveness": {
      const values = params.deliveries.map((d) => d.responsivenessHours);
      metricKind = "scalar";
      metricValue = average(values);
      if (values.length === 0) {
        availability = "insufficient_data";
        dataNotes.push(manifest.missingDataPolicy.note);
      }
      break;
    }
    case "aging_open_commitments": {
      const open = params.deliveries.filter((d) => d.stage === "open" || d.stage === "in_progress");
      metricKind = "ratio";
      denominator = open.length;

      const periodBySeedKey = new Map(params.periodsInScope.map((p) => [p.seedKey, p]));
      const aging = open.filter((d) => {
        const period = periodBySeedKey.get(d.periodSeedKey);
        const end = period?.endDate ? Date.parse(`${period.endDate}T00:00:00.000Z`) : 0;
        const opened = Date.parse(d.openedAtIso);
        if (!Number.isFinite(end) || !Number.isFinite(opened) || end <= 0 || opened <= 0) return false;
        const ageDays = (end - opened) / (1000 * 60 * 60 * 24);
        return ageDays >= 30;
      }).length;

      numerator = aging;
      metricValue = denominator === 0 ? 0 : aging / denominator;
      if (denominator === 0) {
        availability = "insufficient_data";
        dataNotes.push(manifest.missingDataPolicy.note);
      }
      break;
    }
    case "escalation_volume": {
      const escalations = params.deliveries.map((d) => d.escalationCount);
      metricKind = "scalar";
      metricValue = average(escalations);
      if (escalations.length === 0) {
        availability = "insufficient_data";
        dataNotes.push(manifest.missingDataPolicy.note);
      }
      break;
    }
    case "completion_trend": {
      const trend = computeTrendDelta(params.deliveries);
      metricKind = "scalar";
      metricValue = trend.delta;
      if (!trend.available) {
        availability = "insufficient_data";
        dataNotes.push(manifest.missingDataPolicy.note);
      }
      break;
    }
  }

  const normalizedScoreRaw =
    availability === "insufficient_data"
      ? manifest.missingDataPolicy.normalizedScore
      : normalizeLinear({
          value: metricValue,
          best: norm.best,
          worst: norm.worst,
          floor: norm.floor,
          cap: norm.cap,
          direction: manifest.direction,
        });

  const normalizedScore = roundTo(normalizedScoreRaw, SCORE_ROUNDING.normalizedScoreDecimals);
  const contributionRaw = (normalizedScore / 100) * manifest.weight;
  const contribution = roundTo(contributionRaw, SCORE_ROUNDING.contributionDecimals);

  const explanationBase = (() => {
    switch (params.componentId) {
      case "commitment_adherence":
        return denominator === 0
          ? "No completed deliveries in scope. Treat this signal as neutral and low confidence."
          : `On-time deliveries: ${numerator}/${denominator} in the selected scope.`;
      case "delay_severity":
        return "Average delay days for completed deliveries in the selected scope.";
      case "repeat_issue_concentration":
        return denominator === 0
          ? "No deliveries in scope. Treat this signal as neutral and low confidence."
          : `Repeat-flagged records: ${numerator}/${denominator} in the selected scope.`;
      case "responsiveness":
        return "Average responsiveness time in hours in the selected scope.";
      case "aging_open_commitments":
        return denominator === 0
          ? "No open commitments in scope. Treat this signal as best-case."
          : `Aging open items (30+ days within period window): ${numerator}/${denominator}.`;
      case "escalation_volume":
        return "Average escalations per record in the selected scope.";
      case "completion_trend":
        return availability === "insufficient_data"
          ? "Not enough period history in the selected scope to determine momentum."
          : "Change in on-time completion rate from earlier to later periods in scope.";
    }
  })();

  return {
    id: manifest.id,
    label: manifest.label,
    direction: manifest.direction,
    weight: manifest.weight,
    metric:
      metricKind === "ratio"
        ? { kind: "ratio", numerator, denominator, unit: manifest.unit }
        : { kind: "scalar", value: metricValue, unit: manifest.unit },
    sampleCount: params.sampleCount,
    evidenceCount: evidenceIds.length,
    evidenceIds,
    normalization: norm,
    normalizedScore,
    contribution,
    explanation: explanationBase,
    dataQuality: {
      availability,
      notes: dataNotes,
    },
    scope: params.scope,
  };
}

export function buildCarrierScorecards(params: {
  carriers: readonly CarrierInfo[];
  periods: readonly PeriodInfo[];
  deliveries: readonly DeliveryInfo[];
  evidenceCandidates: readonly EvidenceCandidate[];
  filters: ScoreFilters;
}) {
  const scope = buildScope(params.filters, params.periods);

  const deliveriesByCarrier = new Map<string, DeliveryInfo[]>();
  for (const d of params.deliveries) {
    const arr = deliveriesByCarrier.get(d.carrierId) ?? [];
    arr.push(d);
    deliveriesByCarrier.set(d.carrierId, arr);
  }

  const evidenceByCarrier = new Map<string, EvidenceCandidate[]>();
  for (const ev of params.evidenceCandidates) {
    const arr = evidenceByCarrier.get(ev.carrierId) ?? [];
    arr.push(ev);
    evidenceByCarrier.set(ev.carrierId, arr);
  }

  const scorecards: CarrierScorecard[] = [];

  for (const carrier of params.carriers) {
    const carrierDeliveries = deliveriesByCarrier.get(carrier.id) ?? [];
    if (carrierDeliveries.length === 0) continue;

    const sampleCount = carrierDeliveries.length;
    const lowVolume = sampleCount < SCORE_MANIFEST.lowVolume.sampleCountThreshold;
    const confidenceLabel = confidenceLabelForSample(sampleCount);

    const confidenceNotes: string[] = [];
    if (lowVolume) {
      confidenceNotes.push(
        `Limited sample size (${sampleCount} record(s)) in this scope. Treat rankings and grades as directional.`,
      );
    }

    const carrierEvidence = evidenceByCarrier.get(carrier.id) ?? [];

    const regionCounts = new Map<Region, number>();
    const productCounts = new Map<ProductType, number>();
    for (const d of carrierDeliveries) {
      regionCounts.set(d.region, (regionCounts.get(d.region) ?? 0) + 1);
      productCounts.set(d.productType, (productCounts.get(d.productType) ?? 0) + 1);
    }

    const regions = Array.from(regionCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([region, count]) => ({ region, count, share: sampleCount > 0 ? count / sampleCount : 0 }));

    const productTypes = Array.from(productCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([productType, count]) => ({ productType, count, share: sampleCount > 0 ? count / sampleCount : 0 }));

    const components = (Object.keys(SCORE_COMPONENTS) as ScoringComponentId[]).map((id) =>
      buildComponent({
        componentId: id,
        scope,
        deliveries: carrierDeliveries,
        evidenceCandidates: carrierEvidence,
        sampleCount,
        periodsInScope: params.periods,
      }),
    );

    const totalScoreRaw = components.reduce((acc, c) => acc + c.contribution, 0);
    const totalScore = roundTo(totalScoreRaw, SCORE_ROUNDING.totalScoreDecimals);

    scorecards.push({
      carrier,
      scope,
      mix: {
        regions,
        productTypes,
        topRegion: regions[0]?.region ?? null,
        topProductType: productTypes[0]?.productType ?? null,
      },
      sampleCount,
      confidence: {
        label: confidenceLabel,
        lowVolume,
        threshold: SCORE_MANIFEST.lowVolume.sampleCountThreshold,
        notes: confidenceNotes,
      },
      components,
      totalScore,
      grade: gradeFromScore(totalScore),
      rankTieBreaker: [...SCORE_TIE_BREAKERS],
    });
  }

  const ranked = scorecards.sort((a, b) => {
    if (a.totalScore !== b.totalScore) return b.totalScore - a.totalScore;
    if (a.carrier.name !== b.carrier.name) return a.carrier.name.localeCompare(b.carrier.name);
    return a.carrier.id.localeCompare(b.carrier.id);
  });

  return { scope, scorecards: ranked };
}
