import { and, eq, inArray } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import type { DemoDb } from "../db/ensure-schema";
import { schema } from "../db/schema";
import { PRODUCT_TYPE_VALUES, REGION_VALUES, type ProductType, type Region } from "../domain/demo-values";
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

function assertScoreFilters(f: ScoreFilters) {
  assertAllowedFilter({ field: "region", value: f.region, allowed: REGION_VALUES });
  assertAllowedFilter({ field: "productType", value: f.productType, allowed: PRODUCT_TYPE_VALUES });
}

function resolvePeriodMatch(periods: Array<typeof schema.periods.$inferSelect>, f: ScoreFilters) {
  const periodMatch = f.period ? periods.find((p) => p.seedKey === f.period) : null;
  if (f.period && !periodMatch) {
    throw new InvalidFilterError({
      field: "period",
      value: f.period,
      allowed: periods.map((p) => p.seedKey),
    });
  }
  return periodMatch ?? null;
}

async function loadDeliveries(db: DemoDb, clauses: SQL[]) {
  return clauses.length
    ? await db
        .select()
        .from(schema.deliveryRecords)
        .where(and(...clauses))
    : await db.select().from(schema.deliveryRecords);
}

async function loadCarriers(db: DemoDb, carrierIds: string[]) {
  return carrierIds.length
    ? await db.select().from(schema.carriers).where(inArray(schema.carriers.id, carrierIds))
    : [];
}

async function loadEvidenceRows(db: DemoDb, carrierIds: string[], clauses: SQL[]) {
  return carrierIds.length
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
        .where(and(inArray(schema.evidenceItems.carrierId, carrierIds), ...clauses))
    : [];
}

function toCarrierInfoRows(carriers: Array<typeof schema.carriers.$inferSelect>): CarrierInfo[] {
  return carriers.map((c) => ({
    id: c.id,
    name: c.name,
    shortCode: c.shortCode,
    relationshipTier: c.relationshipTier,
    regionFocus: c.regionFocus,
  }));
}

function toPeriodInfoRows(periods: Array<typeof schema.periods.$inferSelect>): PeriodInfo[] {
  return periods.map((p) => ({
    id: p.id,
    seedKey: p.seedKey,
    label: p.label,
    startDate: p.startDate,
    endDate: p.endDate,
  }));
}

function scopePeriodsFor(params: {
  deliveries: Array<typeof schema.deliveryRecords.$inferSelect>;
  periodInfo: PeriodInfo[];
  periodMatch: typeof schema.periods.$inferSelect | null;
}) {
  const periodIdsInScope = new Set(params.deliveries.map((d) => d.periodId));
  const periodsForScope = params.periodMatch
    ? params.periodInfo.filter((p) => p.id === params.periodMatch?.id)
    : params.periodInfo.filter((p) => periodIdsInScope.has(p.id));
  return periodsForScope.length > 0 ? periodsForScope : params.periodInfo;
}

function toDeliveryInfoRows(
  deliveries: Array<typeof schema.deliveryRecords.$inferSelect>,
  periodSeedKeyById: Map<string, string>,
): DeliveryInfo[] {
  return deliveries.map((d) => ({
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
}

function toEvidenceCandidates(evidence: Awaited<ReturnType<typeof loadEvidenceRows>>): EvidenceCandidate[] {
  return evidence.map((e) => ({
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
}

function incrementMap(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function aggregateDeliveries(deliveryInfo: DeliveryInfo[]): ScorecardsSummaryReadModel["aggregates"] {
  const delayReasonCounts = new Map<string, number>();
  const regionCounts = new Map<string, number>();
  const productCounts = new Map<string, number>();
  const periodCounts = new Map<string, { completed: number; onTime: number; delayed: number }>();

  for (const d of deliveryInfo) {
    incrementMap(delayReasonCounts, d.delayReason);
    incrementMap(regionCounts, d.region);
    incrementMap(productCounts, d.productType);
    updatePeriodCounts(periodCounts, d);
  }

  return {
    delayReasons: sortedCountRows(delayReasonCounts, "delayReason"),
    regions: sortedCountRows(regionCounts, "region"),
    productTypes: sortedCountRows(productCounts, "productType"),
    periods: Array.from(periodCounts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([period, b]) => ({ period, ...b })),
  };
}

function updatePeriodCounts(
  periodCounts: Map<string, { completed: number; onTime: number; delayed: number }>,
  delivery: DeliveryInfo,
) {
  const bucket = periodCounts.get(delivery.periodSeedKey) ?? { completed: 0, onTime: 0, delayed: 0 };
  if (delivery.stage === "completed") {
    bucket.completed += 1;
    if (delivery.delayDays === 0) bucket.onTime += 1;
    else bucket.delayed += 1;
  }
  periodCounts.set(delivery.periodSeedKey, bucket);
}

function sortedCountRows<Key extends "delayReason" | "productType" | "region">(counts: Map<string, number>, key: Key) {
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ [key]: value, count })) as Array<Record<Key, string> & { count: number }>;
}

export async function readScorecardsSummary(db: DemoDb, filters: ScoreFilters): Promise<ScorecardsSummaryReadModel> {
  const f = normalizeFilters(filters);
  assertScoreFilters(f);

  const periods = await db.select().from(schema.periods);
  const periodMatch = resolvePeriodMatch(periods, f);
  const clauses = whereClauses(f, periodMatch?.id ?? null);
  const deliveries = await loadDeliveries(db, clauses);
  const carrierIds = Array.from(new Set(deliveries.map((d) => d.carrierId)));
  const carriers = await loadCarriers(db, carrierIds);
  const evidence = await loadEvidenceRows(db, carrierIds, clauses);
  const carrierInfo = toCarrierInfoRows(carriers);
  const periodInfo = toPeriodInfoRows(periods);
  const periodSeedKeyById = new Map(periodInfo.map((p) => [p.id, p.seedKey]));
  const scopePeriods = scopePeriodsFor({ deliveries, periodInfo, periodMatch });
  const deliveryInfo = toDeliveryInfoRows(deliveries, periodSeedKeyById);
  const evidenceCandidates = toEvidenceCandidates(evidence);

  const scored = buildCarrierScorecards({
    carriers: carrierInfo,
    periods: scopePeriods,
    deliveries: deliveryInfo,
    evidenceCandidates,
    filters: f,
  });

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
    aggregates: aggregateDeliveries(deliveryInfo),
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

function normalizeEvidenceIds(rawIds: string[] | null | undefined) {
  return rawIds && rawIds.length > 0 ? Array.from(new Set(rawIds)) : null;
}

function normalizeEvidenceCap(cap: number | null | undefined) {
  return typeof cap === "number" && Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : null;
}

function evidenceWhereClauses(params: {
  baseClauses: SQL[];
  delayReason: string | null;
  dimension: string | null;
  ids: string[] | null;
}) {
  const clauses = [...params.baseClauses];
  if (params.dimension) clauses.push(eq(schema.evidenceItems.dimension, params.dimension));
  if (params.delayReason) clauses.push(eq(schema.deliveryRecords.delayReason, params.delayReason));
  if (params.ids && params.ids.length > 0) clauses.push(inArray(schema.evidenceItems.id, params.ids));
  return clauses;
}

async function loadEvidenceReadRows(db: DemoDb, evidenceClauses: SQL[]) {
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

  return evidenceClauses.length ? await baseQuery.where(and(...evidenceClauses)) : await baseQuery;
}

type EvidenceReadRow = Awaited<ReturnType<typeof loadEvidenceReadRows>>[number];

function stableById(a: EvidenceReadRow, b: EvidenceReadRow) {
  return a.id.localeCompare(b.id);
}

function compareDesc(aValue: number, bValue: number, fallback: number) {
  return aValue !== bValue ? bValue - aValue : fallback;
}

function compareEvidenceRows(params: {
  a: EvidenceReadRow;
  b: EvidenceReadRow;
  delayReason: string | null;
  dimension: string | null;
}) {
  const { a, b, delayReason, dimension } = params;
  const fallback = stableById(a, b);
  if (dimension === "delay_severity" || dimension === "commitment_adherence")
    return compareDesc(a.delayDays, b.delayDays, fallback);
  if (dimension === "responsiveness") return compareDesc(a.responsivenessHours, b.responsivenessHours, fallback);
  if (dimension === "escalation_volume") return compareDesc(a.escalationCount, b.escalationCount, fallback);
  if (dimension === "aging_open_commitments") return compareEvidenceAge(a, b, fallback);
  if (dimension === "repeat_issue_concentration") return compareRepeatEvidence(a, b, fallback);
  if (dimension === "completion_trend") return a.period !== b.period ? a.period.localeCompare(b.period) : fallback;
  return delayReason ? compareDelayReasonEvidence(a, b, fallback) : fallback;
}

function compareEvidenceAge(a: EvidenceReadRow, b: EvidenceReadRow, fallback: number) {
  const aMs = a.openedAt instanceof Date ? a.openedAt.getTime() : Date.parse(String(a.openedAt));
  const bMs = b.openedAt instanceof Date ? b.openedAt.getTime() : Date.parse(String(b.openedAt));
  return aMs !== bMs ? aMs - bMs : fallback;
}

function compareRepeatEvidence(a: EvidenceReadRow, b: EvidenceReadRow, fallback: number) {
  if (Boolean(a.isRepeat) !== Boolean(b.isRepeat)) return a.isRepeat ? -1 : 1;
  if (a.issueSignature !== b.issueSignature) return String(a.issueSignature).localeCompare(String(b.issueSignature));
  return fallback;
}

function compareDelayReasonEvidence(a: EvidenceReadRow, b: EvidenceReadRow, fallback: number) {
  if (a.delayDays !== b.delayDays) return b.delayDays - a.delayDays;
  if (a.escalationCount !== b.escalationCount) return b.escalationCount - a.escalationCount;
  if (a.responsivenessHours !== b.responsivenessHours) return b.responsivenessHours - a.responsivenessHours;
  return fallback;
}

function toEvidenceItems(rows: EvidenceReadRow[]): EvidenceReadModel["items"] {
  return rows.map((r) => ({
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
  }));
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
  const ids = normalizeEvidenceIds(filters.evidenceIds);
  const cap = normalizeEvidenceCap(filters.cap);

  const periods = await db.select().from(schema.periods);
  const periodMatch = resolvePeriodMatch(periods, f);

  const clauses = whereClauses(f, periodMatch?.id ?? null);
  const evidenceClauses = evidenceWhereClauses({ baseClauses: clauses, delayReason, dimension, ids });
  const rows = await loadEvidenceReadRows(db, evidenceClauses);

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

  const sorted = [...rows].sort((a, b) => compareEvidenceRows({ a, b, delayReason, dimension }));

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
    items: toEvidenceItems(visible),
  };
}
