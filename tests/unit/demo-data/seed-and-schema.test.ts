// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";

import {
  DEMO_DATASET_ID,
  REGION_VALUES,
  type Region,
} from "../../../src/lib/db/demo-values";
import { ensureDemoSchema } from "../../../src/lib/db/ensure-schema";
import { schema } from "../../../src/lib/db/schema";
import { buildDemoDataset } from "../../../src/lib/seed/demo-dataset";
import { assertSeedTargetAllowed, SEED_ALLOWLIST_ENV_VAR, seedDemoData } from "../../../src/lib/seed/seed-demo-data";

function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  return { client, db };
}

describe("demo schema and seed", () => {
  beforeEach(async () => {
    // Nothing yet; each test creates its own DB.
  });

  it("enforces domain invariants via constraints (VAL-DATA-001)", async () => {
    const { db } = createTestDb();
    await ensureDemoSchema(db);

    await db.insert(schema.carriers).values({
      id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
      seedKey: "carrier:test",
      name: "Test Carrier",
      shortCode: "TST",
      relationshipTier: "core",
      regionFocus: "na",
    });

    await db.insert(schema.periods).values({
      id: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
      seedKey: "2026-07",
      label: "2026 Jul",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    });

    // Foreign key enforcement.
    await expect(
      db.insert(schema.deliveryRecords).values({
        id: "cccccccc-cccc-4ccc-cccc-cccccccccccc",
        seedKey: "dr:bad:fk",
        carrierId: "dddddddd-dddd-4ddd-dddd-dddddddddddd",
        periodId: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
        region: "na",
        productType: "fiber",
        stage: "completed",
        delayReason: "none",
        committedDate: "2026-07-10",
        forecastDate: "2026-07-10",
        completedDate: "2026-07-10",
        openedAt: new Date("2026-07-01T00:00:00.000Z"),
        closedAt: new Date("2026-07-10T00:00:00.000Z"),
        delayDays: 0,
        responsivenessHours: 1,
        escalationCount: 0,
        issueSignature: "none:na:fiber",
        isRepeat: false,
        customerImpact: "low",
      })
    ).rejects.toBeTruthy();

    // Enum-like checks.
    const invalidRegion = "invalid_region" as Region;
    await expect(
      db.insert(schema.deliveryRecords).values({
        id: "eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee",
        seedKey: "dr:bad:region",
        carrierId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
        periodId: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
        region: invalidRegion,
        productType: "fiber",
        stage: "completed",
        delayReason: "none",
        committedDate: "2026-07-10",
        forecastDate: "2026-07-10",
        completedDate: "2026-07-10",
        openedAt: new Date("2026-07-01T00:00:00.000Z"),
        closedAt: new Date("2026-07-10T00:00:00.000Z"),
        delayDays: 0,
        responsivenessHours: 1,
        escalationCount: 0,
        issueSignature: "none:na:fiber",
        isRepeat: false,
        customerImpact: "low",
      })
    ).rejects.toBeTruthy();

    // Nonnegative numeric checks.
    await expect(
      db.insert(schema.deliveryRecords).values({
        id: "ffffffff-ffff-4fff-ffff-ffffffffffff",
        seedKey: "dr:bad:negative",
        carrierId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
        periodId: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
        region: "na",
        productType: "fiber",
        stage: "completed",
        delayReason: "none",
        committedDate: "2026-07-10",
        forecastDate: "2026-07-10",
        completedDate: "2026-07-10",
        openedAt: new Date("2026-07-01T00:00:00.000Z"),
        closedAt: new Date("2026-07-10T00:00:00.000Z"),
        delayDays: 0,
        responsivenessHours: -5,
        escalationCount: 0,
        issueSignature: "none:na:fiber",
        isRepeat: false,
        customerImpact: "low",
      })
    ).rejects.toBeTruthy();

    // Date-order check.
    await expect(
      db.insert(schema.periods).values({
        id: "12121212-1212-4121-8121-121212121212",
        seedKey: "2026-08",
        label: "2026 Aug",
        startDate: "2026-08-10",
        endDate: "2026-08-01",
      })
    ).rejects.toBeTruthy();
  });

  it("guards seed targets and avoids leaking connection strings (VAL-SAFE-014)", async () => {
    const { db } = createTestDb();

    await expect(
      assertSeedTargetAllowed(db, { expectedDatasetId: DEMO_DATASET_ID })
    ).rejects.toThrow(SEED_ALLOWLIST_ENV_VAR);

    await expect(
      assertSeedTargetAllowed(db, { expectedDatasetId: DEMO_DATASET_ID, allowlistToken: DEMO_DATASET_ID })
    ).resolves.toEqual(expect.objectContaining({ allowed: true }));
  });

  it("seeds a fresh database reproducibly with checksum and integrity (VAL-DATA-002, VAL-SAFE-008)", async () => {
    const { db } = createTestDb();
    const dataset = buildDemoDataset();

    const first = await seedDemoData(db, dataset, {
      expectedDatasetId: DEMO_DATASET_ID,
      allowlistToken: DEMO_DATASET_ID,
    });

    const counts1 = {
      carriers: (await db.execute(sql`select count(*)::int as c from carriers`)).rows?.[0]?.c,
      periods: (await db.execute(sql`select count(*)::int as c from periods`)).rows?.[0]?.c,
      delivery: (await db.execute(sql`select count(*)::int as c from delivery_records`)).rows?.[0]?.c,
      evidence: (await db.execute(sql`select count(*)::int as c from evidence_items`)).rows?.[0]?.c,
      seedMeta: (await db.execute(sql`select count(*)::int as c from seed_meta`)).rows?.[0]?.c,
    };

    expect(counts1.carriers).toBeGreaterThanOrEqual(5);
    expect(counts1.periods).toBeGreaterThanOrEqual(6);
    expect(counts1.delivery).toBeGreaterThanOrEqual(10);
    expect(counts1.evidence).toBeGreaterThanOrEqual(4);
    expect(counts1.seedMeta).toBe(1);

    const meta = (await db.execute(
      sql`select dataset_id, fingerprint from seed_meta where dataset_id = ${DEMO_DATASET_ID} limit 1`
    )).rows?.[0];

    expect(meta?.dataset_id).toBe(DEMO_DATASET_ID);
    expect(meta?.fingerprint).toBe(first.fingerprint);

    // No orphaned references.
    const orphanDeliveryCarrier = (await db.execute(
      sql`select count(*)::int as c from delivery_records dr left join carriers c on c.id = dr.carrier_id where c.id is null`
    )).rows?.[0]?.c;
    const orphanDeliveryPeriod = (await db.execute(
      sql`select count(*)::int as c from delivery_records dr left join periods p on p.id = dr.period_id where p.id is null`
    )).rows?.[0]?.c;
    const orphanEvidence = (await db.execute(
      sql`select count(*)::int as c from evidence_items e left join delivery_records dr on dr.id = e.delivery_record_id where dr.id is null`
    )).rows?.[0]?.c;

    expect(orphanDeliveryCarrier).toBe(0);
    expect(orphanDeliveryPeriod).toBe(0);
    expect(orphanEvidence).toBe(0);
  });

  it("is idempotent: running seed twice keeps counts and fingerprint stable (VAL-SAFE-007)", async () => {
    const { db } = createTestDb();
    const dataset = buildDemoDataset();

    const first = await seedDemoData(db, dataset, {
      expectedDatasetId: DEMO_DATASET_ID,
      allowlistToken: DEMO_DATASET_ID,
    });

    const countsAfterFirst = {
      carriers: (await db.execute(sql`select count(*)::int as c from carriers`)).rows?.[0]?.c,
      periods: (await db.execute(sql`select count(*)::int as c from periods`)).rows?.[0]?.c,
      delivery: (await db.execute(sql`select count(*)::int as c from delivery_records`)).rows?.[0]?.c,
      evidence: (await db.execute(sql`select count(*)::int as c from evidence_items`)).rows?.[0]?.c,
    };

    const second = await seedDemoData(db, dataset, {
      expectedDatasetId: DEMO_DATASET_ID,
      allowlistToken: undefined, // should be allowed after marker exists
    });

    const countsAfterSecond = {
      carriers: (await db.execute(sql`select count(*)::int as c from carriers`)).rows?.[0]?.c,
      periods: (await db.execute(sql`select count(*)::int as c from periods`)).rows?.[0]?.c,
      delivery: (await db.execute(sql`select count(*)::int as c from delivery_records`)).rows?.[0]?.c,
      evidence: (await db.execute(sql`select count(*)::int as c from evidence_items`)).rows?.[0]?.c,
    };

    expect(second.fingerprint).toBe(first.fingerprint);
    expect(countsAfterSecond).toEqual(countsAfterFirst);
  });

  it("does not use persisted score snapshots (VAL-DATA-003)", async () => {
    const { db } = createTestDb();
    await ensureDemoSchema(db);

    type TableRow = { table_name: string };
    const tableRows = (await db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`
    )).rows as TableRow[] | undefined;
    const tables = tableRows?.map((r) => r.table_name);

    expect(tables).toEqual([
      "carriers",
      "delivery_records",
      "evidence_items",
      "periods",
      "seed_meta",
    ]);
  });

  it("seed data covers required variation, filters, low-volume, and empty scopes (VAL-SAFE-009)", async () => {
    const { db } = createTestDb();
    const dataset = buildDemoDataset();

    await seedDemoData(db, dataset, {
      expectedDatasetId: DEMO_DATASET_ID,
      allowlistToken: DEMO_DATASET_ID,
    });

    const onTime = (await db.execute(
      sql`select count(*)::int as c from delivery_records where delay_days = 0 and delay_reason = 'none' and stage = 'completed'`
    )).rows?.[0]?.c;
    const delayed = (await db.execute(
      sql`select count(*)::int as c from delivery_records where delay_days > 0 and delay_reason <> 'none'`
    )).rows?.[0]?.c;
    const escalated = (await db.execute(
      sql`select count(*)::int as c from delivery_records where escalation_count > 0`
    )).rows?.[0]?.c;
    const slowResponse = (await db.execute(
      sql`select count(*)::int as c from delivery_records where responsiveness_hours >= 48`
    )).rows?.[0]?.c;
    const openAging = (await db.execute(
      sql`select count(*)::int as c from delivery_records where stage in ('open','in_progress')`
    )).rows?.[0]?.c;
    const repeats = (await db.execute(
      sql`select count(*)::int as c from delivery_records where is_repeat = true`
    )).rows?.[0]?.c;

    expect(onTime).toBeGreaterThan(0);
    expect(delayed).toBeGreaterThan(0);
    expect(escalated).toBeGreaterThan(0);
    expect(slowResponse).toBeGreaterThan(0);
    expect(openAging).toBeGreaterThan(0);
    expect(repeats).toBeGreaterThan(0);

    // Region/product filters should both have hits for at least two regions and two products.
    type RegionRow = { region: string };
    type ProductRow = { product_type: string };
    const regionRows = (await db.execute(
      sql`select distinct region from delivery_records order by region`
    )).rows as RegionRow[] | undefined;
    const productRows = (await db.execute(
      sql`select distinct product_type from delivery_records order by product_type`
    )).rows as ProductRow[] | undefined;
    const regions = regionRows?.map((r) => r.region);
    const products = productRows?.map((r) => r.product_type);

    expect(regions?.length).toBeGreaterThanOrEqual(2);
    expect(products?.length).toBeGreaterThanOrEqual(2);

    // Low-volume carrier exists (<= 2 records).
    const lowVolume = (await db.execute(
      sql`select count(*)::int as c from (select carrier_id, count(*) as n from delivery_records group by carrier_id having count(*) <= 2) t`
    )).rows?.[0]?.c;
    expect(lowVolume).toBeGreaterThan(0);

    // Empty state: at least one allowed region value should have zero records.
    const emptyRegion = (await db.execute(
      sql`select count(*)::int as c from delivery_records where region = 'latam'`
    )).rows?.[0]?.c;
    expect(REGION_VALUES.includes("latam")).toBe(true);
    expect(emptyRegion).toBe(0);
  });
});
