// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { NextRequest } from "next/server";

import { ensureDemoSchema } from "../../../src/lib/db/ensure-schema";
import { schema } from "../../../src/lib/db/schema";
import { DEMO_DATASET_ID, type Region } from "../../../src/lib/db/demo-values";
import { buildDemoDataset } from "../../../src/lib/seed/demo-dataset";
import { seedDemoData } from "../../../src/lib/seed/seed-demo-data";
import { InvalidFilterError } from "../../../src/lib/scoring/invalid-filter";
import { readEvidence, readScorecardsSummary } from "../../../src/lib/scoring/read-models";

import { GET as getSummary } from "../../../src/app/api/scorecards/summary/route";
import { GET as getCarrierScorecard } from "../../../src/app/api/carriers/[carrierId]/scorecard/route";
import { GET as getEvidence } from "../../../src/app/api/evidence/route";

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

function installRouteDb(db: ReturnType<typeof createTestDb>["db"]) {
  (globalThis as unknown as { __carrierPerfScorecardDb?: unknown }).__carrierPerfScorecardDb = {
    db,
    // Route handlers never call end(), but keep a harmless stub for parity.
    sql: { end: async () => undefined },
  };
}

function clearRouteDb() {
  (globalThis as unknown as { __carrierPerfScorecardDb?: unknown }).__carrierPerfScorecardDb = undefined;
}

describe("invalid scoring filters never broaden scope", () => {
  beforeEach(() => {
    clearRouteDb();
  });

  it("rejects invalid period values in read models (no all-period fallback)", async () => {
    const { db } = createTestDb();
    await seed(db);

    await expect(
      readScorecardsSummary(db, { carrierId: null, region: null, productType: null, period: "2099-01" }),
    ).rejects.toBeInstanceOf(InvalidFilterError);
  });

  it("rejects invalid region values in read models (runtime guard)", async () => {
    const { db } = createTestDb();
    await seed(db);

    await expect(
      readScorecardsSummary(db, {
        carrierId: null,
        region: "moon" as unknown as Region,
        productType: null,
        period: null,
      }),
    ).rejects.toBeInstanceOf(InvalidFilterError);
  });

  it("returns controlled 400 INVALID_FILTER for invalid region on summary API", async () => {
    const { db } = createTestDb();
    await seed(db);
    installRouteDb(db);

    const response = await getSummary(new NextRequest("http://example.test/api/scorecards/summary?region=moon"));
    expect(response.status).toBe(400);

    const payload = await response.json();
    expect(payload).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: "INVALID_FILTER",
        }),
      }),
    );
  });

  it("returns controlled 400 INVALID_FILTER for malformed carrierId on summary API", async () => {
    const { db } = createTestDb();
    await seed(db);
    installRouteDb(db);

    const response = await getSummary(
      new NextRequest("http://example.test/api/scorecards/summary?carrierId=not-a-real-carrier"),
    );
    expect(response.status).toBe(400);

    const payload = await response.json();
    expect(payload.error?.code).toBe("INVALID_FILTER");
    expect(payload.error?.details?.field).toBe("carrierId");
  });

  it("returns controlled 400 INVALID_FILTER for malformed carrierId path values", async () => {
    const { db } = createTestDb();
    await seed(db);
    installRouteDb(db);

    const carrierId = "not-a-real-carrier";
    const response = await getCarrierScorecard(
      new NextRequest(`http://example.test/api/carriers/${carrierId}/scorecard`),
      { params: Promise.resolve({ carrierId }) },
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error?.code).toBe("INVALID_FILTER");
    expect(payload.error?.details?.field).toBe("carrierId");
  });

  it("returns controlled 400 INVALID_FILTER for invalid productType on carrier scorecard API", async () => {
    const { db } = createTestDb();
    const dataset = await seed(db);
    installRouteDb(db);

    const carrierId = dataset.carriers[0]!.id;
    const response = await getCarrierScorecard(
      new NextRequest(`http://example.test/api/carriers/${carrierId}/scorecard?productType=satellite`),
      { params: Promise.resolve({ carrierId }) },
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error?.code).toBe("INVALID_FILTER");
    expect(payload.error?.details?.field).toBe("productType");
  });

  it("returns controlled 400 INVALID_FILTER for invalid period on evidence API (no broadening)", async () => {
    const { db } = createTestDb();
    await seed(db);
    installRouteDb(db);

    const response = await getEvidence(new NextRequest("http://example.test/api/evidence?period=2099-01"));
    expect(response.status).toBe(400);

    const payload = await response.json();
    expect(payload.error?.code).toBe("INVALID_FILTER");
    expect(payload.error?.details?.field).toBe("period");
  });

  it("allows valid filters that yield zero results and returns a safe empty model", async () => {
    const { db } = createTestDb();
    await seed(db);
    installRouteDb(db);

    const response = await getSummary(new NextRequest("http://example.test/api/scorecards/summary?region=latam"));
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(payload.counts.deliveryRecords).toBe(0);
    expect(payload.carriers).toEqual([]);
  });

  it("rejects invalid period filters in evidence read model without broadening", async () => {
    const { db } = createTestDb();
    await seed(db);

    await expect(
      readEvidence(db, {
        carrierId: null,
        region: null,
        productType: null,
        period: "2099-01",
        dimension: null,
        evidenceIds: null,
      }),
    ).rejects.toBeInstanceOf(InvalidFilterError);
  });
});
