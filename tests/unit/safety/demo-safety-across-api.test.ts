// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { NextRequest } from "next/server";

import { ensureDemoSchema } from "../../../src/lib/db/ensure-schema";
import { schema } from "../../../src/lib/db/schema";
import { DEMO_DATASET_ID } from "../../../src/lib/db/demo-values";
import { buildDemoDataset } from "../../../src/lib/seed/demo-dataset";
import { seedDemoData } from "../../../src/lib/seed/seed-demo-data";
import { scanUnknownForDemoSafety } from "../../../src/lib/safety/demo-data-safety";

import { GET as getHealth } from "../../../src/app/api/health/route";
import { GET as getDemoData } from "../../../src/app/api/demo-data/route";
import { GET as getSummary } from "../../../src/app/api/scorecards/summary/route";
import { GET as getOptions } from "../../../src/app/api/scorecards/options/route";
import { GET as getEvidence } from "../../../src/app/api/evidence/route";
import { GET as getCarrierScorecard } from "../../../src/app/api/carriers/[carrierId]/scorecard/route";
import { POST as postQbr } from "../../../src/app/api/qbr/brief/route";

function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  return { client, db };
}

async function seed(db: ReturnType<typeof createTestDb>["db"]) {
  await ensureDemoSchema(db);
  const dataset = buildDemoDataset();
  const seeded = await seedDemoData(db, dataset, { expectedDatasetId: DEMO_DATASET_ID, allowlistToken: DEMO_DATASET_ID });
  return { dataset, fingerprint: seeded.fingerprint };
}

function installRouteDb(db: ReturnType<typeof createTestDb>["db"]) {
  (globalThis as unknown as { __carrierPerfScorecardDb?: unknown }).__carrierPerfScorecardDb = {
    db,
    sql: { end: async () => undefined },
  };
}

describe("demo safety holds across API surfaces (VAL-SAFE-010, VAL-CROSS-003, VAL-CROSS-006, VAL-QBR-026)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? "configured";
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";
    process.env.AI_PROVIDER = "mock";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    (globalThis as unknown as { __carrierPerfScorecardDb?: unknown }).__carrierPerfScorecardDb = undefined;
  });

  it("scans representative API responses for forbidden demo-data patterns and proves API surfaces are seeded-data-backed (VAL-CROSS-006, VAL-QBR-026)", async () => {
    const { db } = createTestDb();
    const { dataset, fingerprint } = await seed(db);
    installRouteDb(db);

    const health = await (await getHealth()).json();
    const demoData = await (await getDemoData()).json();
    const options = await (await getOptions()).json();

    const summary = await (
      await getSummary(new NextRequest("http://example.test/api/scorecards/summary?region=emea&period=2026-05"))
    ).json();

    // Use an EMEA-focused carrier that is guaranteed to have seeded records in typical filter scopes.
    const carrierId = dataset.carriers.find((c) => c.seedKey === "carrier:skybridge")?.id ?? dataset.carriers[0]!.id;
    const carrierName = dataset.carriers.find((c) => c.id === carrierId)?.name ?? "";
    const carrierDetail = await (
      await getCarrierScorecard(
        new NextRequest(`http://example.test/api/carriers/${carrierId}/scorecard?region=emea&period=2026-05`),
        { params: Promise.resolve({ carrierId }) }
      )
    ).json();

    const evidence = await (
      await getEvidence(new NextRequest(`http://example.test/api/evidence?carrierId=${carrierId}&cap=10`))
    ).json();

    const qbr = await (
      await postQbr(
        new NextRequest("http://example.test/api/qbr/brief", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ carrierId }),
        })
      )
    ).json();

    // Seeded-data proof: demo-data metadata and carrier/QBR facts must align with the seeded dataset.
    expect(health.ok).toBe(true);
    expect(demoData.ok).toBe(true);
    expect(demoData.dataset?.id).toBe(dataset.datasetId);
    expect(demoData.dataset?.fingerprint).toBe(fingerprint);
    expect(demoData.counts?.carriers ?? 0).toBeGreaterThan(0);
    expect(summary.ok).toBe(true);
    expect(carrierDetail.ok).toBe(true);
    expect(carrierDetail.carrier?.id).toBe(carrierId);
    expect(qbr.ok).toBe(true);
    expect(String(qbr.provider?.id ?? "")).toBe("mock");
    expect(carrierName).toBeTruthy();
    expect(JSON.stringify(qbr)).toContain(carrierName);

    const payloads = { health, demoData, options, summary, carrierDetail, evidence, qbr };
    const findings = scanUnknownForDemoSafety(payloads);
    expect(findings).toEqual([]);
  });
});
