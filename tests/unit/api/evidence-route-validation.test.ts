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
    sql: { end: async () => undefined },
  };
}

function clearRouteDb() {
  (globalThis as unknown as { __carrierPerfScorecardDb?: unknown }).__carrierPerfScorecardDb = undefined;
}

function safeJsonString(value: unknown) {
  return JSON.stringify(value ?? null);
}

describe("/api/evidence evidenceIds validation (VAL-CROSS-007)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    clearRouteDb();
    process.env = { ...originalEnv };
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? "configured";
  });

  afterEach(() => {
    clearRouteDb();
    process.env = { ...originalEnv };
  });

  it("rejects malformed evidenceIds with a sanitized 400 JSON error (VAL-CROSS-007, VAL-SAFE-006)", async () => {
    const { db } = createTestDb();
    await seed(db);
    installRouteDb(db);

    const res = await getEvidence(new NextRequest("http://example.test/api/evidence?evidenceIds=not-a-real-evidence-id"));
    expect(res.status).toBe(400);

    const payload = await res.json();
    expect(payload).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: "INVALID_EVIDENCE_IDS",
        }),
      })
    );

    // No internal details.
    expect(safeJsonString(payload)).not.toMatch(/stack|select \*|drizzle|postgres:\/\/|DATABASE_URL|OPENAI_COMPATIBLE/i);
  });

  it("preserves the safe empty evidence response for syntactically valid but unknown UUIDs", async () => {
    const { db } = createTestDb();
    await seed(db);
    installRouteDb(db);

    const missingId = "99999999-9999-4999-8999-999999999999";
    const res = await getEvidence(new NextRequest(`http://example.test/api/evidence?evidenceIds=${missingId}`));
    expect(res.status).toBe(200);

    const payload = await res.json();
    expect(payload.ok).toBe(true);
    expect(payload.items).toEqual([]);
    expect(payload.meta?.missingEvidenceIds).toEqual([missingId]);
  });
});
