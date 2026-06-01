import { and, eq, inArray } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import type { DemoDb } from "../db/ensure-schema";
import { schema } from "../db/schema";
import { PRODUCT_TYPE_VALUES, REGION_VALUES, type ProductType, type Region } from "../db/demo-values";
import { buildCarrierScorecards, type CarrierInfo, type DeliveryInfo, type PeriodInfo } from "./engine";
import type { EvidenceCandidate } from "./evidence";
import type { ScoreFilters } from "./types";
import { SCORE_MANIFEST } from "./manifest";
import { InvalidFilterError } from "./invalid-filter";

export type ScorecardsSummaryReadModel = {
  ok: true;
  manifest: typeof SCORE_MANIFEST;
  scope: ReturnType<typeof buildCarrierScorecards>["scope"];
  counts: {
    carriers: number;
    periods: number;
    deliveryRecords: number;
    evidenceItems: number;
  };
  aggregates: {
    delayReasons: Array<{ delayReason: string; count: number }>;
    regions: Array<{ region: string; count: number }>;
    productTypes: Array<{ productType: string; count: number }>;
    periods: Array<{ period: string; completed: number; onTime: number; delayed: number }>;
  };
  carriers: ReturnType<typeof buildCarrierScorecards>["scorecards"];
};

export type CarrierDetailReadModel = {
  ok: true;
  manifest: typeof SCORE_MANIFEST;
  scope: ReturnType<typeof buildCarrierScorecards>["scope"];
  carrier: CarrierInfo | null;
  scorecard: ReturnType<typeof buildCarrierScorecards>["scorecards"][number] | null;
  message: string | null;
};

export type EvidenceReadModel = {
  ok: true;
  scope: ReturnType<typeof buildCarrierScorecards>["scope"];
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
};

function normalizeFilters(filters: ScoreFilters): ScoreFilters {
  return {
    carrierId: filters.carrierId ?? null,
    region: filters.region ?? null,
    productType: filters.productType ?? null,
    period: filters.period ?? null,
  };
}

function assertAllowedFilter(params: {
  field: "region" | "productType";
  value: string | null;
  allowed: readonly string[];
}) {
  if (!params.value) return;
  if (params.allowed.includes(params.value)) return;
  throw new InvalidFilterError({
    field: params.field,
    value: params.value,
    allowed: [...params.allowed],
  });
}

function whereClauses(filters: ScoreFilters, periodId: string | null) {
  const clauses: SQL[] = [];
  if (filters.carrierId) clauses.push(eq(schema.deliveryRecords.carrierId, filters.carrierId));
  if (filters.region) clauses.push(eq(schema.deliveryRecords.region, filters.region));
  if (filters.productType) clauses.push(eq(schema.deliveryRecords.productType, filters.productType));
  if (periodId) clauses.push(eq(schema.deliveryRecords.periodId, periodId));
  return clauses;
}

function toIsoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date(0).toISOString();
}

export async function readScorecardsSummary(db: DemoDb, filters: ScoreFilters): Promise<ScorecardsSummaryReadModel> {
  const f = normalizeFilters(filters);
  assertAllowedFilter({ field: "region", value: f.region, allowed: REGION_VALUES });
  assertAllowedFilter({ field: "productType", value: f.productType, allowed: PRODUCT_TYPE_VALUES });

  const periods = await db.select().from(schema.periods);
  const periodMatch = f.period ? periods.find((p) => p.seedKey === f.period) : null;
  if (f.period && !periodMatch) {
    throw new InvalidFilterError({
      field: "period",
      value: f.period,
      allowed: periods.map((p) => p.seedKey),
    });
  }

  const clauses = whereClauses(f, periodMatch?.id ?? null);

  const deliveries = clauses.length
    ? await db
        .select()
        .from(schema.deliveryRecords)
        .where(and(...clauses))
    : await db.select().from(schema.deliveryRecords);

  const carrierIds = Array.from(new Set(deliveries.map((d) => d.carrierId)));
  const carriers = carrierIds.length
    ? await db.select().from(schema.carriers).where(inArray(schema.carriers.id, carrierIds))
    : [];

  const evidence = carrierIds.length
    ? await db
        .select({
          id: schema.evidenceItems.id,
          carrierId: schema.evidenceItems.carrierId,
          periodId: schema.evidenceItems.periodId,
          deliveryRecordId: schema.evidenceItems.deliveryRecordId,
          dimension: schema.evidenceItems.dimension,
          summary: schema.evidenceItems.summary,
          region: schema.deliveryRecords.region,
          productType: schema.deliveryRecords.productType,
          delayDays: schema.deliveryRecords.delayDays,
          responsivenessHours: schema.deliveryRecords.responsivenessHours,
          escalationCount: schema.deliveryRecords.escalationCount,
          openedAt: schema.deliveryRecords.openedAt,
          stage: schema.deliveryRecords.stage,
          issueSignature: schema.deliveryRecords.issueSignature,
          isRepeat: schema.deliveryRecords.isRepeat,
          periodSeedKey: schema.periods.seedKey,
        })
        .from(schema.evidenceItems)
        .innerJoin(schema.deliveryRecords, eq(schema.deliveryRecords.id, schema.evidenceItems.deliveryRecordId))
        .innerJoin(schema.periods, eq(schema.periods.id, schema.evidenceItems.periodId))
        .where(and(inArray(schema.evidenceItems.carrierId, carrierIds), ...(clauses as SQL[])))
    : [];

  const carrierInfo: CarrierInfo[] = carriers.map((c) => ({
    id: c.id,
    name: c.name,
    shortCode: c.shortCode,
    relationshipTier: c.relationshipTier,
    regionFocus: c.regionFocus,
  }));

  const periodInfo: PeriodInfo[] = periods.map((p) => ({
    id: p.id,
    seedKey: p.seedKey,
    label: p.label,
    startDate: p.startDate,
    endDate: p.endDate,
  }));

  const periodSeedKeyById = new Map(periodInfo.map((p) => [p.id, p.seedKey]));
  const periodIdsInScope = new Set(deliveries.map((d) => d.periodId));
  const periodsForScope = periodMatch
    ? periodInfo.filter((p) => p.id === periodMatch.id)
    : periodInfo.filter((p) => periodIdsInScope.has(p.id));
  const scopePeriods = periodsForScope.length > 0 ? periodsForScope : periodInfo;

  const deliveryInfo: DeliveryInfo[] = deliveries.map((d) => ({
    id: d.id,
    carrierId: d.carrierId,
    periodId: d.periodId,
    periodSeedKey: periodSeedKeyById.get(d.periodId) ?? "unknown",
    region: d.region as Region,
    productType: d.productType as ProductType,
    stage: d.stage,
    committedDate: d.committedDate,
    completedDate: d.completedDate ?? null,
    delayDays: d.delayDays,
    delayReason: d.delayReason,
    responsivenessHours: d.responsivenessHours,
    escalationCount: d.escalationCount,
    isRepeat: d.isRepeat,
    issueSignature: d.issueSignature,
    openedAtIso: toIsoString(d.openedAt),
  }));

  const evidenceCandidates: EvidenceCandidate[] = evidence.map((e) => ({
    evidenceId: e.id,
    carrierId: e.carrierId,
    periodSeedKey: e.periodSeedKey,
    region: e.region as Region,
    productType: e.productType as ProductType,
    dimension: e.dimension,
    delayDays: e.delayDays,
    responsivenessHours: e.responsivenessHours,
    escalationCount: e.escalationCount,
    openedAtIso: toIsoString(e.openedAt),
    stage: e.stage,
    issueSignature: e.issueSignature,
    isRepeat: e.isRepeat,
  }));

  const scored = buildCarrierScorecards({
    carriers: carrierInfo,
    periods: scopePeriods,
    deliveries: deliveryInfo,
    evidenceCandidates,
    filters: f,
  });

  const delayReasonCounts = new Map<string, number>();
  const regionCounts = new Map<string, number>();
  const productCounts = new Map<string, number>();
  const periodCounts = new Map<string, { completed: number; onTime: number; delayed: number }>();

  for (const d of deliveryInfo) {
    delayReasonCounts.set(d.delayReason, (delayReasonCounts.get(d.delayReason) ?? 0) + 1);
    regionCounts.set(d.region, (regionCounts.get(d.region) ?? 0) + 1);
    productCounts.set(d.productType, (productCounts.get(d.productType) ?? 0) + 1);

    const bucket = periodCounts.get(d.periodSeedKey) ?? { completed: 0, onTime: 0, delayed: 0 };
    if (d.stage === "completed") {
      bucket.completed += 1;
      if (d.delayDays === 0) bucket.onTime += 1;
      else bucket.delayed += 1;
    }
    periodCounts.set(d.periodSeedKey, bucket);
  }

  const aggregates = {
    delayReasons: Array.from(delayReasonCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([delayReason, count]) => ({ delayReason, count })),
    regions: Array.from(regionCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([region, count]) => ({ region, count })),
    productTypes: Array.from(productCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([productType, count]) => ({ productType, count })),
    periods: Array.from(periodCounts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([period, b]) => ({ period, ...b })),
  };

  return {
    ok: true,
    manifest: SCORE_MANIFEST,
    scope: scored.scope,
    counts: {
      carriers: scored.scorecards.length,
      periods: scopePeriods.length,
      deliveryRecords: deliveryInfo.length,
      evidenceItems: evidenceCandidates.length,
    },
    aggregates,
    carriers: scored.scorecards,
  };
}

export async function readCarrierDetail(
  db: DemoDb,
  carrierId: string,
  filters: ScoreFilters,
): Promise<CarrierDetailReadModel> {
  const f = normalizeFilters(filters);
  const carrierScoped = normalizeFilters({ ...filters, carrierId });

  const carriers = await db.select().from(schema.carriers).where(eq(schema.carriers.id, carrierId));
  const carrier = carriers[0]
    ? {
        id: carriers[0].id,
        name: carriers[0].name,
        shortCode: carriers[0].shortCode,
        relationshipTier: carriers[0].relationshipTier,
        regionFocus: carriers[0].regionFocus,
      }
    : null;

  const carrierSummary = await readScorecardsSummary(db, carrierScoped);
  const scorecard = carrierSummary.carriers.find((c) => c.carrier.id === carrierId) ?? null;
  const globalScope = (await readScorecardsSummary(db, f)).scope;

  if (!carrier) {
    return {
      ok: true,
      manifest: SCORE_MANIFEST,
      scope: globalScope,
      carrier: null,
      scorecard: null,
      message: "Carrier not found.",
    };
  }

  if (!scorecard) {
    return {
      ok: true,
      manifest: SCORE_MANIFEST,
      scope: globalScope,
      carrier,
      scorecard: null,
      message: "No records in the selected scope for this carrier.",
    };
  }

  // For summary/detail parity, keep the scope matching the unscoped filter context (region/product/period),
  // even though the detail endpoint is carrier-specific.
  const normalizedScorecard = {
    ...scorecard,
    scope: globalScope,
    components: scorecard.components.map((c) => ({ ...c, scope: globalScope })),
  };

  return {
    ok: true,
    manifest: SCORE_MANIFEST,
    scope: globalScope,
    carrier,
    scorecard: normalizedScorecard,
    message: null,
  };
}

export async function readEvidence(
  db: DemoDb,
  filters: ScoreFilters & {
    dimension?: string | null;
    delayReason?: string | null;
    evidenceIds?: string[] | null;
    cap?: number | null;
  },
): Promise<EvidenceReadModel> {
  const f = normalizeFilters(filters);
  assertAllowedFilter({ field: "region", value: f.region, allowed: REGION_VALUES });
  assertAllowedFilter({ field: "productType", value: f.productType, allowed: PRODUCT_TYPE_VALUES });
  const dimension = filters.dimension ?? null;
  const delayReason = filters.delayReason ?? null;
  const rawIds = filters.evidenceIds ?? null;
  const ids = rawIds && rawIds.length > 0 ? Array.from(new Set(rawIds)) : null;
  const cap =
    typeof filters.cap === "number" && Number.isFinite(filters.cap) && filters.cap > 0 ? Math.floor(filters.cap) : null;

  const periods = await db.select().from(schema.periods);
  const periodMatch = f.period ? periods.find((p) => p.seedKey === f.period) : null;
  if (f.period && !periodMatch) {
    throw new InvalidFilterError({
      field: "period",
      value: f.period,
      allowed: periods.map((p) => p.seedKey),
    });
  }

  const clauses = whereClauses(f, periodMatch?.id ?? null);
  const evidenceClauses: SQL[] = [...clauses];
  if (dimension) evidenceClauses.push(eq(schema.evidenceItems.dimension, dimension));
  if (delayReason) evidenceClauses.push(eq(schema.deliveryRecords.delayReason, delayReason));
  if (ids && ids.length > 0) evidenceClauses.push(inArray(schema.evidenceItems.id, ids));

  const baseQuery = db
    .select({
      id: schema.evidenceItems.id,
      dimension: schema.evidenceItems.dimension,
      summary: schema.evidenceItems.summary,
      carrierId: schema.evidenceItems.carrierId,
      carrierName: schema.carriers.name,
      period: schema.periods.seedKey,
      region: schema.deliveryRecords.region,
      productType: schema.deliveryRecords.productType,
      delayReason: schema.deliveryRecords.delayReason,
      committedDate: schema.deliveryRecords.committedDate,
      forecastDate: schema.deliveryRecords.forecastDate,
      completedDate: schema.deliveryRecords.completedDate,
      stage: schema.deliveryRecords.stage,
      responsivenessHours: schema.deliveryRecords.responsivenessHours,
      escalationCount: schema.deliveryRecords.escalationCount,
      delayDays: schema.deliveryRecords.delayDays,
      openedAt: schema.deliveryRecords.openedAt,
      isRepeat: schema.deliveryRecords.isRepeat,
      issueSignature: schema.deliveryRecords.issueSignature,
    })
    .from(schema.evidenceItems)
    .innerJoin(schema.deliveryRecords, eq(schema.deliveryRecords.id, schema.evidenceItems.deliveryRecordId))
    .innerJoin(schema.periods, eq(schema.periods.id, schema.evidenceItems.periodId))
    .innerJoin(schema.carriers, eq(schema.carriers.id, schema.evidenceItems.carrierId));

  const rows = evidenceClauses.length ? await baseQuery.where(and(...evidenceClauses)) : await baseQuery;

  const scope = buildCarrierScorecards({
    carriers: [],
    periods: periods.map((p) => ({
      id: p.id,
      seedKey: p.seedKey,
      label: p.label,
      startDate: p.startDate,
      endDate: p.endDate,
    })),
    deliveries: [],
    evidenceCandidates: [],
    filters: f,
  }).scope;

  const requestedIds = ids ? [...ids] : [];
  const returnedIds = new Set(rows.map((r) => r.id));
  const missingEvidenceIds = requestedIds.filter((id) => !returnedIds.has(id));

  // Deterministic sort: for known score dimensions, align with evidence-selection severity ordering.
  // Fall back to stable id ordering for unrecognized dimensions.
  const sorted = [...rows].sort((a, b) => {
    const dim = dimension ?? null;
    if (dim === "delay_severity" || dim === "commitment_adherence") {
      if (a.delayDays !== b.delayDays) return b.delayDays - a.delayDays;
      return a.id.localeCompare(b.id);
    }
    if (dim === "responsiveness") {
      if (a.responsivenessHours !== b.responsivenessHours) return b.responsivenessHours - a.responsivenessHours;
      return a.id.localeCompare(b.id);
    }
    if (dim === "escalation_volume") {
      if (a.escalationCount !== b.escalationCount) return b.escalationCount - a.escalationCount;
      return a.id.localeCompare(b.id);
    }
    if (dim === "aging_open_commitments") {
      // Oldest first.
      const aMs = a.openedAt instanceof Date ? a.openedAt.getTime() : Date.parse(String(a.openedAt));
      const bMs = b.openedAt instanceof Date ? b.openedAt.getTime() : Date.parse(String(b.openedAt));
      if (aMs !== bMs) return aMs - bMs;
      return a.id.localeCompare(b.id);
    }
    if (dim === "repeat_issue_concentration") {
      // Prefer repeats first, then stable issue signature grouping.
      if (Boolean(a.isRepeat) !== Boolean(b.isRepeat)) return a.isRepeat ? -1 : 1;
      if (a.issueSignature !== b.issueSignature)
        return String(a.issueSignature).localeCompare(String(b.issueSignature));
      return a.id.localeCompare(b.id);
    }
    if (dim === "completion_trend") {
      if (a.period !== b.period) return a.period.localeCompare(b.period);
      return a.id.localeCompare(b.id);
    }
    if (!dim && delayReason) {
      // Delay-reason proof: prioritize largest misses, then escalation/responsiveness, then stable id.
      if (a.delayDays !== b.delayDays) return b.delayDays - a.delayDays;
      if (a.escalationCount !== b.escalationCount) return b.escalationCount - a.escalationCount;
      if (a.responsivenessHours !== b.responsivenessHours) return b.responsivenessHours - a.responsivenessHours;
      return a.id.localeCompare(b.id);
    }
    return a.id.localeCompare(b.id);
  });

  const totalItems = sorted.length;
  const visible = cap ? sorted.slice(0, cap) : sorted;

  return {
    ok: true,
    scope,
    meta: {
      totalItems,
      returnedItems: visible.length,
      cap,
      missingEvidenceIds,
    },
    items: visible.map((r) => ({
      id: r.id,
      dimension: r.dimension,
      summary: r.summary,
      carrierId: r.carrierId,
      carrierName: r.carrierName,
      period: r.period,
      region: r.region as Region,
      productType: r.productType as ProductType,
      delayReason: r.delayReason,
      committedDate: r.committedDate,
      forecastDate: r.forecastDate ?? null,
      completedDate: r.completedDate ?? null,
      stage: r.stage,
      responsivenessHours: r.responsivenessHours,
      escalationCount: r.escalationCount,
      delayDays: r.delayDays,
    })),
  };
}
