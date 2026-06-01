// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import { ensureDemoSchema } from "../../../src/lib/db/ensure-schema";
import { schema } from "../../../src/lib/db/schema";
import { DEMO_DATASET_ID } from "../../../src/lib/db/demo-values";
import { buildDemoDataset } from "../../../src/lib/seed/demo-dataset";
import { seedDemoData } from "../../../src/lib/seed/seed-demo-data";
import { SCORE_MANIFEST, SCORE_WEIGHTS } from "../../../src/lib/scoring/manifest";
import { readCarrierDetail, readEvidence, readScorecardsSummary } from "../../../src/lib/scoring/read-models";
import { buildCarrierScorecards, type CarrierInfo, type PeriodInfo } from "../../../src/lib/scoring/engine";
import type { EvidenceCandidate } from "../../../src/lib/scoring/evidence";
import { selectEvidenceIds } from "../../../src/lib/scoring/evidence";

function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  return { client, db };
}

async function seed(db: ReturnType<typeof createTestDb>["db"]) {
  await ensureDemoSchema(db);
  const dataset = buildDemoDataset();
  await seedDemoData(db, dataset, { expectedDatasetId: DEMO_DATASET_ID, allowlistToken: DEMO_DATASET_ID });
  return dataset;
}

describe("scoring engine and read models", () => {
  beforeEach(async () => {
    // Isolated per test.
  });

  it("returns deterministic summary results for identical requests (VAL-SCORE-001)", async () => {
    const { db } = createTestDb();
    await seed(db);

    const first = await readScorecardsSummary(db, { region: null, productType: null, period: null, carrierId: null });
    const second = await readScorecardsSummary(db, { region: null, productType: null, period: null, carrierId: null });

    expect(second).toEqual(first);
  });

  it("orders carrier scorecards by deterministic rank rule (VAL-CARRIER-007)", async () => {
    const { db } = createTestDb();
    await seed(db);

    const summary = await readScorecardsSummary(db, { region: null, productType: null, period: null, carrierId: null });
    expect(summary.carriers.length).toBeGreaterThan(0);

    const sorted = [...summary.carriers].sort((a, b) => {
      if (a.totalScore !== b.totalScore) return b.totalScore - a.totalScore;
      if (a.carrier.name !== b.carrier.name) return a.carrier.name.localeCompare(b.carrier.name);
      return a.carrier.id.localeCompare(b.carrier.id);
    });

    expect(summary.carriers.map((c) => c.carrier.id)).toEqual(sorted.map((c) => c.carrier.id));
  });

  it("keeps all scores finite and bounded (VAL-SCORE-002)", async () => {
    const { db } = createTestDb();
    await seed(db);

    const summary = await readScorecardsSummary(db, { region: null, productType: null, period: null, carrierId: null });

    for (const c of summary.carriers) {
      expect(Number.isFinite(c.totalScore)).toBe(true);
      expect(c.totalScore).toBeGreaterThanOrEqual(0);
      expect(c.totalScore).toBeLessThanOrEqual(100);

      for (const comp of c.components) {
        expect(Number.isFinite(comp.normalizedScore)).toBe(true);
        expect(comp.normalizedScore).toBeGreaterThanOrEqual(0);
        expect(comp.normalizedScore).toBeLessThanOrEqual(100);

        expect(Number.isFinite(comp.contribution)).toBe(true);
        expect(comp.contribution).toBeGreaterThanOrEqual(0);
        expect(comp.contribution).toBeLessThanOrEqual(comp.weight + 0.0001);
      }
    }
  });

  it("includes every required component exactly once per carrier (VAL-SCORE-003)", async () => {
    const { db } = createTestDb();
    await seed(db);

    const summary = await readScorecardsSummary(db, { region: null, productType: null, period: null, carrierId: null });

    const required = Object.keys(SCORE_MANIFEST.components).sort();
    for (const carrier of summary.carriers) {
      const ids = carrier.components.map((c) => c.id).sort();
      expect(ids).toEqual(required);
    }
  });

  it("publishes stable weights that sum to 100 (VAL-SCORE-004)", () => {
    const weights = Object.values(SCORE_WEIGHTS);
    const sum = weights.reduce((acc, w) => acc + w, 0);
    expect(sum).toBe(100);
    for (const w of weights) expect(w).toBeGreaterThan(0);
  });

  it("reconciles contributions and total score within rounding tolerance (VAL-SCORE-005)", async () => {
    const { db } = createTestDb();
    await seed(db);

    const summary = await readScorecardsSummary(db, { region: null, productType: null, period: null, carrierId: null });
    for (const carrier of summary.carriers) {
      for (const comp of carrier.components) {
        const expected = Math.round((comp.normalizedScore / 100) * comp.weight * 10) / 10;
        expect(comp.contribution).toBeCloseTo(expected, 6);
      }
      const expectedTotal = Math.round(carrier.components.reduce((acc, c) => acc + c.contribution, 0));
      expect(carrier.totalScore).toBeCloseTo(expectedTotal, 6);
    }
  });

  it("derives grades only from documented thresholds and is stable at boundaries (VAL-SCORE-006)", async () => {
    const { db } = createTestDb();
    const dataset = await seed(db);

    // Use the scoring output itself to find a representative carrier, then test boundary mapping.
    const summary = await readScorecardsSummary(db, { region: null, productType: null, period: null, carrierId: null });
    expect(summary.carriers.length).toBeGreaterThan(0);

    const thresholds = [...SCORE_MANIFEST.gradeThresholds].sort((a, b) => b.minScore - a.minScore);
    const top = thresholds[0]!;
    const bottom = thresholds[thresholds.length - 1]!;
    expect(top.minScore).toBeGreaterThanOrEqual(bottom.minScore);

    // Boundary checks: ensure minScore maps to its grade in at least one observed example by recomputing via manifest rule.
    for (const c of summary.carriers) {
      const derived = thresholds.find((t) => c.totalScore >= t.minScore)?.grade ?? "F";
      expect(c.grade).toBe(derived);
    }

    // Also ensure the dataset carrier ids are stable and present.
    expect(dataset.carriers.map((c) => c.id).length).toBeGreaterThanOrEqual(5);
  });

  it("improves component scores in the correct direction for paired fixtures (VAL-SCORE-007)", () => {
    const carrier: CarrierInfo = {
      id: "carrier-1",
      name: "Fixture Carrier",
      shortCode: "FIX",
      relationshipTier: "core",
      regionFocus: "na",
    };

    const periods: PeriodInfo[] = [
      { id: "p1", seedKey: "2026-01", label: "2026 Jan", startDate: "2026-01-01", endDate: "2026-01-31" },
      { id: "p2", seedKey: "2026-02", label: "2026 Feb", startDate: "2026-02-01", endDate: "2026-02-28" },
    ];

    const base = {
      id: "d",
      carrierId: carrier.id,
      periodId: "p1",
      periodSeedKey: "2026-01",
      region: "na" as const,
      productType: "fiber" as const,
      stage: "completed",
      committedDate: "2026-01-10",
      completedDate: "2026-01-10",
      delayDays: 0,
      delayReason: "none",
      responsivenessHours: 4,
      escalationCount: 0,
      isRepeat: false,
      issueSignature: "none:na:fiber",
      openedAtIso: "2026-01-01T00:00:00.000Z",
    };

    const evidence: EvidenceCandidate[] = [];

    const goodCommit = buildCarrierScorecards({
      carriers: [carrier],
      periods,
      deliveries: [
        { ...base, id: "c1", delayDays: 0 },
        { ...base, id: "c2", delayDays: 0 },
      ],
      evidenceCandidates: evidence,
      filters: { carrierId: null, region: null, productType: null, period: null },
    }).scorecards[0]!;

    const badCommit = buildCarrierScorecards({
      carriers: [carrier],
      periods,
      deliveries: [
        { ...base, id: "c1", delayDays: 10, delayReason: "permit" },
        { ...base, id: "c2", delayDays: 10, delayReason: "permit" },
      ],
      evidenceCandidates: evidence,
      filters: { carrierId: null, region: null, productType: null, period: null },
    }).scorecards[0]!;

    expect(goodCommit.components.find((c) => c.id === "commitment_adherence")!.normalizedScore).toBeGreaterThan(
      badCommit.components.find((c) => c.id === "commitment_adherence")!.normalizedScore,
    );

    expect(goodCommit.components.find((c) => c.id === "delay_severity")!.normalizedScore).toBeGreaterThan(
      badCommit.components.find((c) => c.id === "delay_severity")!.normalizedScore,
    );

    const goodRepeat = buildCarrierScorecards({
      carriers: [carrier],
      periods,
      deliveries: [
        { ...base, id: "r1", isRepeat: false },
        { ...base, id: "r2", isRepeat: false },
      ],
      evidenceCandidates: evidence,
      filters: { carrierId: null, region: null, productType: null, period: null },
    }).scorecards[0]!;

    const badRepeat = buildCarrierScorecards({
      carriers: [carrier],
      periods,
      deliveries: [
        { ...base, id: "r1", isRepeat: true, issueSignature: "x" },
        { ...base, id: "r2", isRepeat: true, issueSignature: "x" },
      ],
      evidenceCandidates: evidence,
      filters: { carrierId: null, region: null, productType: null, period: null },
    }).scorecards[0]!;

    expect(goodRepeat.components.find((c) => c.id === "repeat_issue_concentration")!.normalizedScore).toBeGreaterThan(
      badRepeat.components.find((c) => c.id === "repeat_issue_concentration")!.normalizedScore,
    );

    const goodResp = buildCarrierScorecards({
      carriers: [carrier],
      periods,
      deliveries: [
        { ...base, id: "s1", responsivenessHours: 4 },
        { ...base, id: "s2", responsivenessHours: 4 },
      ],
      evidenceCandidates: evidence,
      filters: { carrierId: null, region: null, productType: null, period: null },
    }).scorecards[0]!;
    const badResp = buildCarrierScorecards({
      carriers: [carrier],
      periods,
      deliveries: [
        { ...base, id: "s1", responsivenessHours: 80 },
        { ...base, id: "s2", responsivenessHours: 80 },
      ],
      evidenceCandidates: evidence,
      filters: { carrierId: null, region: null, productType: null, period: null },
    }).scorecards[0]!;
    expect(goodResp.components.find((c) => c.id === "responsiveness")!.normalizedScore).toBeGreaterThan(
      badResp.components.find((c) => c.id === "responsiveness")!.normalizedScore,
    );

    const goodAging = buildCarrierScorecards({
      carriers: [carrier],
      periods,
      deliveries: [{ ...base, id: "a1", stage: "open", openedAtIso: "2026-01-20T00:00:00.000Z" }],
      evidenceCandidates: evidence,
      filters: { carrierId: null, region: null, productType: null, period: null },
    }).scorecards[0]!;

    const badAging = buildCarrierScorecards({
      carriers: [carrier],
      periods,
      deliveries: [{ ...base, id: "a1", stage: "open", openedAtIso: "2025-12-01T00:00:00.000Z" }],
      evidenceCandidates: evidence,
      filters: { carrierId: null, region: null, productType: null, period: null },
    }).scorecards[0]!;

    expect(goodAging.components.find((c) => c.id === "aging_open_commitments")!.normalizedScore).toBeGreaterThan(
      badAging.components.find((c) => c.id === "aging_open_commitments")!.normalizedScore,
    );

    const goodEsc = buildCarrierScorecards({
      carriers: [carrier],
      periods,
      deliveries: [
        { ...base, id: "e1", escalationCount: 0 },
        { ...base, id: "e2", escalationCount: 0 },
      ],
      evidenceCandidates: evidence,
      filters: { carrierId: null, region: null, productType: null, period: null },
    }).scorecards[0]!;
    const badEsc = buildCarrierScorecards({
      carriers: [carrier],
      periods,
      deliveries: [
        { ...base, id: "e1", escalationCount: 4 },
        { ...base, id: "e2", escalationCount: 4 },
      ],
      evidenceCandidates: evidence,
      filters: { carrierId: null, region: null, productType: null, period: null },
    }).scorecards[0]!;
    expect(goodEsc.components.find((c) => c.id === "escalation_volume")!.normalizedScore).toBeGreaterThan(
      badEsc.components.find((c) => c.id === "escalation_volume")!.normalizedScore,
    );

    const improving = buildCarrierScorecards({
      carriers: [carrier],
      periods,
      deliveries: [
        { ...base, id: "t1", periodSeedKey: "2026-01", periodId: "p1", delayDays: 10, delayReason: "permit" },
        { ...base, id: "t2", periodSeedKey: "2026-02", periodId: "p2", delayDays: 0, delayReason: "none" },
      ],
      evidenceCandidates: evidence,
      filters: { carrierId: null, region: null, productType: null, period: null },
    }).scorecards[0]!;

    const declining = buildCarrierScorecards({
      carriers: [carrier],
      periods,
      deliveries: [
        { ...base, id: "t1", periodSeedKey: "2026-01", periodId: "p1", delayDays: 0, delayReason: "none" },
        { ...base, id: "t2", periodSeedKey: "2026-02", periodId: "p2", delayDays: 10, delayReason: "permit" },
      ],
      evidenceCandidates: evidence,
      filters: { carrierId: null, region: null, productType: null, period: null },
    }).scorecards[0]!;

    expect(improving.components.find((c) => c.id === "completion_trend")!.normalizedScore).toBeGreaterThan(
      declining.components.find((c) => c.id === "completion_trend")!.normalizedScore,
    );
  });

  it("uses only filtered records when filters are applied (VAL-SCORE-008, VAL-SCORE-010)", async () => {
    const { db } = createTestDb();
    await seed(db);

    const baseline = await readScorecardsSummary(db, {
      region: null,
      productType: null,
      period: null,
      carrierId: null,
    });
    const filtered = await readScorecardsSummary(db, {
      region: "na",
      productType: null,
      period: null,
      carrierId: null,
    });

    expect(filtered.counts.deliveryRecords).toBeLessThanOrEqual(baseline.counts.deliveryRecords);
    expect(filtered.aggregates.regions.every((r) => r.region === "na")).toBe(true);

    const totalDelayReason = filtered.aggregates.delayReasons.reduce((acc, d) => acc + d.count, 0);
    const totalRegions = filtered.aggregates.regions.reduce((acc, d) => acc + d.count, 0);
    const totalProducts = filtered.aggregates.productTypes.reduce((acc, d) => acc + d.count, 0);
    expect(totalDelayReason).toBe(filtered.counts.deliveryRecords);
    expect(totalRegions).toBe(filtered.counts.deliveryRecords);
    expect(totalProducts).toBe(filtered.counts.deliveryRecords);

    const evidenceForFiltered = await readEvidence(db, {
      carrierId: null,
      region: "na",
      productType: null,
      period: null,
      dimension: null,
      evidenceIds: null,
    });
    expect(evidenceForFiltered.items.length).toBe(filtered.counts.evidenceItems);

    const productFiltered = await readScorecardsSummary(db, {
      region: null,
      productType: "fiber",
      period: null,
      carrierId: null,
    });
    expect(productFiltered.counts.deliveryRecords).toBeLessThanOrEqual(baseline.counts.deliveryRecords);
    expect(productFiltered.aggregates.productTypes.every((p) => p.productType === "fiber")).toBe(true);

    const periodFiltered = await readScorecardsSummary(db, {
      region: null,
      productType: null,
      period: "2026-02",
      carrierId: null,
    });
    expect(periodFiltered.counts.deliveryRecords).toBeLessThanOrEqual(baseline.counts.deliveryRecords);
    expect(periodFiltered.aggregates.periods.every((p) => p.period === "2026-02")).toBe(true);
  });

  it("keeps summary and carrier detail scorecards consistent under identical filters (VAL-SCORE-009)", async () => {
    const { db } = createTestDb();
    const dataset = await seed(db);

    const targetCarrierId = dataset.carriers[0]!.id;
    const summary = await readScorecardsSummary(db, { region: null, productType: null, period: null, carrierId: null });
    const fromSummary = summary.carriers.find((c) => c.carrier.id === targetCarrierId);
    expect(fromSummary).toBeTruthy();

    const detail = await readCarrierDetail(db, targetCarrierId, {
      region: null,
      productType: null,
      period: null,
      carrierId: null,
    });
    expect(detail.scorecard).toBeTruthy();

    expect(detail.scorecard).toEqual(fromSummary);
  });

  it("selects evidence deterministically and every cited id resolves through evidence endpoint (VAL-SCORE-011)", async () => {
    const { db } = createTestDb();
    const dataset = await seed(db);

    const carrierId = dataset.carriers[0]!.id;
    const detail = await readCarrierDetail(db, carrierId, {
      region: null,
      productType: null,
      period: null,
      carrierId: null,
    });
    expect(detail.scorecard).toBeTruthy();

    const cited = new Set(detail.scorecard!.components.flatMap((c) => c.evidenceIds));
    const ids = Array.from(cited);

    const evidence = await readEvidence(db, {
      carrierId,
      region: null,
      productType: null,
      period: null,
      dimension: null,
      evidenceIds: ids,
    });

    const returned = new Set(evidence.items.map((i) => i.id));
    for (const id of ids) expect(returned.has(id)).toBe(true);

    // Deterministic: re-read evidence with same params yields same list.
    const evidence2 = await readEvidence(db, {
      carrierId,
      region: null,
      productType: null,
      period: null,
      dimension: null,
      evidenceIds: ids,
    });
    expect(evidence2).toEqual(evidence);
  });

  it("caps evidence selection deterministically when more items exist than shown (VAL-SCORE-011)", () => {
    const candidates: EvidenceCandidate[] = [
      {
        evidenceId: "e-1",
        carrierId: "c",
        periodSeedKey: "2026-01",
        region: "na",
        productType: "fiber",
        dimension: "delay_severity",
        delayDays: 5,
        responsivenessHours: 10,
        escalationCount: 0,
        openedAtIso: "2026-01-01T00:00:00.000Z",
        stage: "completed",
        issueSignature: "x",
        isRepeat: false,
      },
      {
        evidenceId: "e-2",
        carrierId: "c",
        periodSeedKey: "2026-01",
        region: "na",
        productType: "fiber",
        dimension: "delay_severity",
        delayDays: 20,
        responsivenessHours: 10,
        escalationCount: 0,
        openedAtIso: "2026-01-01T00:00:00.000Z",
        stage: "completed",
        issueSignature: "x",
        isRepeat: false,
      },
      {
        evidenceId: "e-3",
        carrierId: "c",
        periodSeedKey: "2026-01",
        region: "na",
        productType: "fiber",
        dimension: "delay_severity",
        delayDays: 1,
        responsivenessHours: 10,
        escalationCount: 0,
        openedAtIso: "2026-01-01T00:00:00.000Z",
        stage: "completed",
        issueSignature: "x",
        isRepeat: false,
      },
      {
        evidenceId: "e-4",
        carrierId: "c",
        periodSeedKey: "2026-01",
        region: "na",
        productType: "fiber",
        dimension: "delay_severity",
        delayDays: 20,
        responsivenessHours: 10,
        escalationCount: 0,
        openedAtIso: "2026-01-01T00:00:00.000Z",
        stage: "completed",
        issueSignature: "x",
        isRepeat: false,
      },
    ];

    const first = selectEvidenceIds({ componentId: "delay_severity", candidates });
    const second = selectEvidenceIds({ componentId: "delay_severity", candidates });
    expect(second).toEqual(first);
    expect(first.length).toBe(3);
    // Highest delay first; tie breaks by id.
    expect(first).toEqual(["e-2", "e-4", "e-1"]);
  });

  it("handles empty scopes safely without fabricating scores (VAL-SCORE-012, VAL-CROSS-008)", async () => {
    const { db } = createTestDb();
    await seed(db);

    // Seeded demo guarantees region 'latam' has zero records.
    const empty = await readScorecardsSummary(db, {
      region: "latam",
      productType: null,
      period: null,
      carrierId: null,
    });
    expect(empty.counts.deliveryRecords).toBe(0);
    expect(empty.carriers).toEqual([]);
    expect(empty.aggregates.delayReasons).toEqual([]);
  });

  it("exposes scoring manifest metadata and keeps component output aligned with it (VAL-SCORE-013, VAL-SCORE-014)", async () => {
    const { db } = createTestDb();
    await seed(db);

    const summary = await readScorecardsSummary(db, { region: null, productType: null, period: null, carrierId: null });
    expect(summary.manifest.version).toBe(SCORE_MANIFEST.version);
    expect(summary.manifest.weights).toEqual(SCORE_MANIFEST.weights);

    for (const carrier of summary.carriers) {
      for (const comp of carrier.components) {
        const manifest = SCORE_MANIFEST.components[comp.id];
        expect(comp.weight).toBe(manifest.weight);
        expect(comp.normalization.best).toBe(manifest.normalization.best);
        expect(comp.normalization.worst).toBe(manifest.normalization.worst);
        expect(comp.sampleCount).toBeGreaterThan(0);
        expect(comp.evidenceCount).toBe(comp.evidenceIds.length);
        expect(comp.scope.filters).toBeTruthy();
        expect(comp.scope.periodWindow).toBeTruthy();
      }
    }
  });

  it("propagates low-volume confidence consistently through scorecards (VAL-SCORE-015, VAL-CROSS-008)", async () => {
    const { db } = createTestDb();
    await seed(db);

    const summary = await readScorecardsSummary(db, { region: null, productType: null, period: null, carrierId: null });
    const low = summary.carriers.find((c) => c.confidence.lowVolume);
    expect(low).toBeTruthy();
    expect(low!.confidence.label).toBe("low");
    expect(low!.sampleCount).toBeLessThan(SCORE_MANIFEST.lowVolume.sampleCountThreshold);
  });

  it("caps and floors normalization as documented, including outliers (VAL-SCORE-016)", async () => {
    const { db } = createTestDb();
    const dataset = await seed(db);

    // Choose a carrier and force an outlier scenario via filter: period with the largest delay outlier exists in seed (Aurora 14 day delay, still within cap).
    const aurora = dataset.carriers.find((c) => c.seedKey === "carrier:aurora")!;
    const summary = await readScorecardsSummary(db, {
      carrierId: aurora.id,
      region: null,
      productType: null,
      period: null,
    });
    expect(summary.carriers.length).toBe(1);

    const comps = summary.carriers[0]!.components;
    for (const comp of comps) {
      expect(comp.normalizedScore).toBeGreaterThanOrEqual(0);
      expect(comp.normalizedScore).toBeLessThanOrEqual(100);
      expect(comp.contribution).toBeGreaterThanOrEqual(0);
      expect(comp.contribution).toBeLessThanOrEqual(comp.weight + 0.0001);
    }
  });

  it("floors and caps each component at its manifest boundaries (VAL-SCORE-016)", () => {
    const carrier: CarrierInfo = {
      id: "carrier-2",
      name: "Boundary Carrier",
      shortCode: "BND",
      relationshipTier: "core",
      regionFocus: "na",
    };
    const periods: PeriodInfo[] = [
      { id: "p1", seedKey: "2026-01", label: "2026 Jan", startDate: "2026-01-01", endDate: "2026-01-31" },
      { id: "p2", seedKey: "2026-02", label: "2026 Feb", startDate: "2026-02-01", endDate: "2026-02-28" },
    ];

    const extremes = buildCarrierScorecards({
      carriers: [carrier],
      periods,
      deliveries: [
        {
          id: "x1",
          carrierId: carrier.id,
          periodId: "p1",
          periodSeedKey: "2026-01",
          region: "na" as const,
          productType: "fiber" as const,
          stage: "completed",
          committedDate: "2026-01-10",
          completedDate: "2026-01-20",
          delayDays: 999,
          delayReason: "permit",
          responsivenessHours: 999,
          escalationCount: 999,
          isRepeat: true,
          issueSignature: "repeat",
          openedAtIso: "2020-01-01T00:00:00.000Z",
        },
        {
          id: "x2",
          carrierId: carrier.id,
          periodId: "p2",
          periodSeedKey: "2026-02",
          region: "na" as const,
          productType: "fiber" as const,
          stage: "completed",
          committedDate: "2026-02-10",
          completedDate: "2026-02-10",
          delayDays: 0,
          delayReason: "none",
          responsivenessHours: 0,
          escalationCount: 0,
          isRepeat: true,
          issueSignature: "repeat",
          openedAtIso: "2020-01-01T00:00:00.000Z",
        },
      ],
      evidenceCandidates: [],
      filters: { carrierId: null, region: null, productType: null, period: null },
    }).scorecards[0]!;

    const byId = new Map(extremes.components.map((c) => [c.id, c]));

    // Worst-case outliers should floor to 0 for lower-is-better components.
    expect(byId.get("delay_severity")!.normalizedScore).toBe(0);
    expect(byId.get("responsiveness")!.normalizedScore).toBe(0);
    expect(byId.get("escalation_volume")!.normalizedScore).toBe(0);
    expect(byId.get("repeat_issue_concentration")!.normalizedScore).toBe(0);

    // Trend delta of +1 should cap to +0.25, mapping to 100.
    expect(byId.get("completion_trend")!.normalizedScore).toBe(100);
  });
});
