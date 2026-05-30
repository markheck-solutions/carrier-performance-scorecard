import "server-only";

import { eq } from "drizzle-orm";

import type { DemoDb } from "@/lib/db/ensure-schema";
import { schema } from "@/lib/db/schema";
import type { ProductType, Region } from "@/lib/db/demo-values";
import { readEvidence, readScorecardsSummary } from "@/lib/scoring/read-models";
import type { CarrierScorecard, ScoreFilters, ScoreMetric, ScoringComponentId } from "@/lib/scoring/types";

export type QbrSafeContextV1 = {
  kind: "qbr_safe_context_v1";
  carrier: {
    id: string;
    name: string;
    shortCode: string;
    relationshipTier: string;
    regionFocus: string;
  };
  scope: {
    filters: ScoreFilters;
    periodWindow: {
      mode: "all" | "single";
      seedKey?: string;
      startDate?: string;
      endDate?: string;
    };
  };
  records: {
    deliveryRecords: number;
    evidenceItems: number;
    sampleCount: number;
    lowVolume: boolean;
    confidenceLabel: "high" | "medium" | "low";
  };
  score: {
    totalScore: number;
    grade: "A" | "B" | "C" | "D" | "F";
    trendLabel: "improving" | "declining" | "stable" | "watch" | "unknown";
    components: Array<{
      id: ScoringComponentId;
      label: string;
      direction: "higher_is_better" | "lower_is_better";
      metric: ScoreMetric;
      normalizedScore: number;
      contribution: number;
      dataQuality: { availability: "ok" | "insufficient_data"; notes: string[] };
    }>;
  };
  delays: {
    topDelayReasons: Array<{ delayReason: string; count: number }>;
  };
  evidence: {
    highlights: Array<{
      id: string;
      dimension: string;
      summary: string;
      period: string;
      region: Region;
      productType: ProductType;
      delayReason: string;
      stage: string;
      delayDays: number;
      responsivenessHours: number;
      escalationCount: number;
    }>;
  };
};

export class QbrInvalidCarrierError extends Error {
  readonly code = "INVALID_CARRIER" as const;
  readonly status = 400 as const;

  constructor() {
    super("Carrier id is not recognized.");
    this.name = "QbrInvalidCarrierError";
  }
}

export function isQbrInvalidCarrierError(error: unknown): error is QbrInvalidCarrierError {
  return error instanceof QbrInvalidCarrierError;
}

function trendLabelForDelta(delta: number, available: boolean) {
  if (!available) return "unknown" as const;
  if (delta >= 0.05) return "improving" as const;
  if (delta <= -0.05) return "declining" as const;
  if (delta <= -0.02) return "watch" as const;
  return "stable" as const;
}

function stableSortComponents(scorecard: CarrierScorecard, dir: "asc" | "desc") {
  const copy = [...scorecard.components];
  copy.sort((a, b) => {
    const d = a.normalizedScore - b.normalizedScore;
    if (d !== 0) return dir === "asc" ? d : -d;
    // Stable tie-breaker.
    return a.id.localeCompare(b.id);
  });
  return copy;
}

function toSafeFilters(filters: ScoreFilters) {
  return {
    carrierId: filters.carrierId ?? null,
    region: filters.region ?? null,
    productType: filters.productType ?? null,
    period: filters.period ?? null,
  } satisfies ScoreFilters;
}

export async function buildQbrSafeContextV1(db: DemoDb, params: { carrierId: string; filters: ScoreFilters }): Promise<QbrSafeContextV1> {
  const carrierId = params.carrierId.trim();
  const filters = {
    carrierId,
    region: params.filters.region ?? null,
    productType: params.filters.productType ?? null,
    period: params.filters.period ?? null,
  };

  const carriers = await db.select().from(schema.carriers).where(eq(schema.carriers.id, carrierId));
  if (!carriers[0]) throw new QbrInvalidCarrierError();

  const summary = await readScorecardsSummary(db, filters);
  const scorecard = summary.carriers.find((c) => c.carrier.id === carrierId) ?? null;

  // If the carrier has no records in this scope, build a safe no-data context.
  if (!scorecard) {
    return {
      kind: "qbr_safe_context_v1",
      carrier: {
        id: carrierId,
        name: carriers[0].name,
        shortCode: carriers[0].shortCode,
        relationshipTier: carriers[0].relationshipTier,
        regionFocus: carriers[0].regionFocus,
      },
      scope: {
        filters: toSafeFilters(filters),
        periodWindow: summary.scope.periodWindow,
      },
      records: {
        deliveryRecords: summary.counts.deliveryRecords,
        evidenceItems: summary.counts.evidenceItems,
        sampleCount: 0,
        lowVolume: true,
        confidenceLabel: "low",
      },
      score: {
        totalScore: 0,
        grade: "F",
        trendLabel: "unknown",
        components: [],
      },
      delays: {
        topDelayReasons: summary.aggregates.delayReasons.filter((d) => d.delayReason !== "none").slice(0, 3),
      },
      evidence: { highlights: [] },
    };
  }

  const trendComp = scorecard.components.find((c) => c.id === "completion_trend") ?? null;
  const trendDelta = trendComp && trendComp.metric.kind === "scalar" ? trendComp.metric.value : 0;
  const trendAvailable = trendComp ? trendComp.dataQuality.availability === "ok" : false;
  const trendLabel = trendLabelForDelta(trendDelta, trendAvailable);

  const concerns = stableSortComponents(scorecard, "asc").slice(0, 2).map((c) => c.id);
  const strengths = stableSortComponents(scorecard, "desc").slice(0, 1).map((c) => c.id);
  const highlightDims: ScoringComponentId[] = Array.from(new Set([...concerns, ...strengths]));

  const highlights: QbrSafeContextV1["evidence"]["highlights"] = [];
  for (const dim of highlightDims) {
    const evidence = await readEvidence(db, {
      carrierId,
      region: filters.region,
      productType: filters.productType,
      period: filters.period,
      dimension: dim,
      evidenceIds: null,
      cap: 2,
    });
    for (const item of evidence.items) {
      highlights.push({
        id: item.id,
        dimension: item.dimension,
        summary: item.summary,
        period: item.period,
        region: item.region,
        productType: item.productType,
        delayReason: item.delayReason,
        stage: item.stage,
        delayDays: item.delayDays,
        responsivenessHours: item.responsivenessHours,
        escalationCount: item.escalationCount,
      });
    }
  }

  const seen = new Set<string>();
  const deduped = highlights.filter((h) => {
    if (seen.has(h.id)) return false;
    seen.add(h.id);
    return true;
  });

  const safeTopDelayReasons = summary.aggregates.delayReasons.filter((d) => d.delayReason !== "none").slice(0, 3);

  return {
    kind: "qbr_safe_context_v1",
    carrier: scorecard.carrier,
    scope: {
      filters: toSafeFilters(filters),
      periodWindow: summary.scope.periodWindow,
    },
    records: {
      deliveryRecords: summary.counts.deliveryRecords,
      evidenceItems: summary.counts.evidenceItems,
      sampleCount: scorecard.sampleCount,
      lowVolume: scorecard.confidence.lowVolume,
      confidenceLabel: scorecard.confidence.label,
    },
    score: {
      totalScore: scorecard.totalScore,
      grade: scorecard.grade,
      trendLabel,
      components: scorecard.components.map((c) => ({
        id: c.id,
        label: c.label,
        direction: c.direction,
        metric: c.metric,
        normalizedScore: c.normalizedScore,
        contribution: c.contribution,
        dataQuality: c.dataQuality,
      })),
    },
    delays: {
      topDelayReasons: safeTopDelayReasons,
    },
    evidence: { highlights: deduped.slice(0, 6) },
  };
}

function assertExactKeys(obj: Record<string, unknown>, allowed: readonly string[], path: string) {
  const keys = Object.keys(obj);
  for (const k of keys) {
    if (!allowed.includes(k)) throw new Error(`QBR context whitelist violation at ${path}: unexpected key "${k}".`);
  }
}

export function assertQbrSafeContextWhitelisted(context: QbrSafeContextV1) {
  assertExactKeys(context as unknown as Record<string, unknown>, ["kind", "carrier", "scope", "records", "score", "delays", "evidence"], "root");
  assertExactKeys(context.carrier as unknown as Record<string, unknown>, ["id", "name", "shortCode", "relationshipTier", "regionFocus"], "carrier");
  assertExactKeys(context.scope as unknown as Record<string, unknown>, ["filters", "periodWindow"], "scope");
  assertExactKeys(context.scope.filters as unknown as Record<string, unknown>, ["carrierId", "region", "productType", "period"], "scope.filters");
  assertExactKeys(context.records as unknown as Record<string, unknown>, ["deliveryRecords", "evidenceItems", "sampleCount", "lowVolume", "confidenceLabel"], "records");
  assertExactKeys(context.score as unknown as Record<string, unknown>, ["totalScore", "grade", "trendLabel", "components"], "score");
  assertExactKeys(context.delays as unknown as Record<string, unknown>, ["topDelayReasons"], "delays");
  assertExactKeys(context.evidence as unknown as Record<string, unknown>, ["highlights"], "evidence");
}
