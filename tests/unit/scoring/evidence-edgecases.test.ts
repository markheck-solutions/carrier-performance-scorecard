// @vitest-environment node
import { describe, expect, it } from "vitest";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import { ensureDemoSchema } from "../../../src/lib/db/ensure-schema";
import { schema } from "../../../src/lib/db/schema";
import { DEMO_DATASET_ID, type Region } from "../../../src/lib/db/demo-values";
import { buildDemoDataset } from "../../../src/lib/seed/demo-dataset";
import { seedDemoData } from "../../../src/lib/seed/seed-demo-data";
import { readCarrierDetail, readEvidence } from "../../../src/lib/scoring/read-models";

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

describe("evidence proof surface edge cases (VAL-CARRIER-028)", () => {
  it("returns a safe empty evidence model when filters remove all evidence", async () => {
    const { db } = createTestDb();
    await seed(db);

    // Seed guarantees LATAM has no records.
    const empty = await readEvidence(db, {
      carrierId: null,
      region: "latam",
      productType: null,
      period: null,
      dimension: null,
      delayReason: null,
      evidenceIds: null,
      cap: 10,
    });

    expect(empty.ok).toBe(true);
    expect(empty.items).toEqual([]);
    expect(empty.meta.totalItems).toBe(0);
    expect(empty.meta.returnedItems).toBe(0);
  });

  it("de-duplicates duplicate evidence id requests deterministically", async () => {
    const { db } = createTestDb();
    const dataset = await seed(db);

    const evidenceId = dataset.evidenceItems[0]!.id;
    const model = await readEvidence(db, {
      carrierId: null,
      region: null,
      productType: null,
      period: null,
      dimension: null,
      delayReason: null,
      evidenceIds: [evidenceId, evidenceId, evidenceId],
      cap: null,
    });

    expect(model.items.map((i) => i.id)).toEqual([evidenceId]);
    expect(model.meta.missingEvidenceIds).toEqual([]);
  });

  it("caps evidence lists with deterministic sort and publishes total vs returned counts", async () => {
    const { db } = createTestDb();
    const dataset = await seed(db);

    const skybridge = dataset.carriers.find((c) => c.seedKey === "carrier:skybridge");
    expect(skybridge).toBeTruthy();

    const delayed = dataset.deliveryRecords
      .filter((d) => d.carrierId === skybridge!.id && d.delayDays > 0)
      .sort((a, b) => b.delayDays - a.delayDays || a.id.localeCompare(b.id))
      .slice(0, 3);
    expect(delayed.length).toBeGreaterThanOrEqual(3);

    const inserted = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        seedKey: "ev:test:skybridge:delay:1",
        carrierId: skybridge!.id,
        periodId: delayed[0]!.periodId,
        deliveryRecordId: delayed[0]!.id,
        dimension: "delay_severity",
        summary: "Fixture proof item A for delay severity cap test.",
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        seedKey: "ev:test:skybridge:delay:2",
        carrierId: skybridge!.id,
        periodId: delayed[1]!.periodId,
        deliveryRecordId: delayed[1]!.id,
        dimension: "delay_severity",
        summary: "Fixture proof item B for delay severity cap test.",
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        seedKey: "ev:test:skybridge:delay:3",
        carrierId: skybridge!.id,
        periodId: delayed[2]!.periodId,
        deliveryRecordId: delayed[2]!.id,
        dimension: "delay_severity",
        summary: "Fixture proof item C for delay severity cap test.",
      },
    ];

    await db.insert(schema.evidenceItems).values(inserted);

    const first = await readEvidence(db, {
      carrierId: skybridge!.id,
      region: null,
      productType: null,
      period: null,
      dimension: "delay_severity",
      delayReason: null,
      evidenceIds: null,
      cap: 2,
    });

    const second = await readEvidence(db, {
      carrierId: skybridge!.id,
      region: null,
      productType: null,
      period: null,
      dimension: "delay_severity",
      delayReason: null,
      evidenceIds: null,
      cap: 2,
    });

    expect(second).toEqual(first);
    expect(first.meta.totalItems).toBeGreaterThan(first.meta.returnedItems);
    expect(first.meta.cap).toBe(2);
    expect(first.items).toHaveLength(2);

    // Sorted: largest delay days first for delay severity.
    expect(first.items[0]!.delayDays).toBeGreaterThanOrEqual(first.items[1]!.delayDays);
  });

  it("treats filtered-out or missing evidence IDs as missing references under the current scope", async () => {
    const { db } = createTestDb();
    const dataset = await seed(db);

    const skybridge = dataset.carriers.find((c) => c.seedKey === "carrier:skybridge");
    expect(skybridge).toBeTruthy();

    const target = dataset.deliveryRecords.find((d) => d.carrierId === skybridge!.id && d.region === "emea" && d.delayDays > 0);
    expect(target).toBeTruthy();

    const evidenceId = "44444444-4444-4444-8444-444444444444";
    await db.insert(schema.evidenceItems).values({
      id: evidenceId,
      seedKey: "ev:test:skybridge:filtered-out",
      carrierId: skybridge!.id,
      periodId: target!.periodId,
      deliveryRecordId: target!.id,
      dimension: "delay_severity",
      summary: "Fixture proof item for filtered-out test.",
    });

    // Now apply a region filter that excludes the target (EMEA evidence) so the reference is missing in this scope.
    const filteredOut = await readEvidence(db, {
      carrierId: skybridge!.id,
      region: "na" as Region,
      productType: null,
      period: null,
      dimension: null,
      delayReason: null,
      evidenceIds: [evidenceId],
      cap: null,
    });

    expect(filteredOut.items).toEqual([]);
    expect(filteredOut.meta.missingEvidenceIds).toEqual([evidenceId]);

    const missing = await readEvidence(db, {
      carrierId: skybridge!.id,
      region: null,
      productType: null,
      period: null,
      dimension: null,
      delayReason: null,
      evidenceIds: ["99999999-9999-4999-8999-999999999999"],
      cap: null,
    });

    expect(missing.items).toEqual([]);
    expect(missing.meta.missingEvidenceIds).toEqual(["99999999-9999-4999-8999-999999999999"]);
  });
});

describe("evidence honors filters and resolves cited IDs (VAL-CARRIER-016)", () => {
  it("resolves scorecard-cited evidence IDs through dimension-scoped evidence reads under the same carrier and filters", async () => {
    const { db } = createTestDb();
    const dataset = await seed(db);

    const carrier = dataset.carriers.find((c) => c.seedKey === "carrier:skybridge") ?? dataset.carriers[0]!;
    const detail = await readCarrierDetail(db, carrier.id, { carrierId: null, region: null, productType: null, period: null });
    expect(detail.ok).toBe(true);
    expect(detail.scorecard).toBeTruthy();

    const withEvidence = detail.scorecard!.components.find((c) => c.evidenceIds.length > 0);
    expect(withEvidence).toBeTruthy();

    const byDimension = await readEvidence(db, {
      carrierId: carrier.id,
      region: null,
      productType: null,
      period: null,
      dimension: withEvidence!.id,
      delayReason: null,
      evidenceIds: null,
      cap: null,
    });

    const returned = new Set(byDimension.items.map((i) => i.id));
    for (const id of withEvidence!.evidenceIds) expect(returned.has(id)).toBe(true);

    // Filters are honored: apply a region filter and ensure all returned items match it.
    const region = (byDimension.items[0]?.region ?? "emea") as Region;
    const byDimensionFiltered = await readEvidence(db, {
      carrierId: carrier.id,
      region,
      productType: null,
      period: null,
      dimension: withEvidence!.id,
      delayReason: null,
      evidenceIds: null,
      cap: null,
    });
    expect(byDimensionFiltered.items.every((i) => i.region === region)).toBe(true);
  });
});
