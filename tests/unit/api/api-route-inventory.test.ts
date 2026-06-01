// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readdirSync, statSync } from "node:fs";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { NextRequest } from "next/server";

import { ensureDemoSchema } from "../../../src/lib/db/ensure-schema";
import { schema } from "../../../src/lib/db/schema";
import { DEMO_DATASET_ID } from "../../../src/lib/db/demo-values";
import { buildDemoDataset } from "../../../src/lib/seed/demo-dataset";
import { seedDemoData } from "../../../src/lib/seed/seed-demo-data";

import * as healthRoute from "../../../src/app/api/health/route";
import * as demoDataRoute from "../../../src/app/api/demo-data/route";
import * as summaryRoute from "../../../src/app/api/scorecards/summary/route";
import * as optionsRoute from "../../../src/app/api/scorecards/options/route";
import * as evidenceRoute from "../../../src/app/api/evidence/route";
import * as carrierScorecardRoute from "../../../src/app/api/carriers/[carrierId]/scorecard/route";
import * as qbrBriefRoute from "../../../src/app/api/qbr/brief/route";

function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  return { client, db };
}

async function seed(db: ReturnType<typeof createTestDb>["db"]) {
  await ensureDemoSchema(db);
  const dataset = buildDemoDataset();
  const result = await seedDemoData(db, dataset, {
    expectedDatasetId: DEMO_DATASET_ID,
    allowlistToken: DEMO_DATASET_ID,
  });
  return { dataset, fingerprint: result.fingerprint };
}

function installRouteDb(db: ReturnType<typeof createTestDb>["db"]) {
  (globalThis as unknown as { __carrierPerfScorecardDb?: unknown }).__carrierPerfScorecardDb = {
    db,
    sql: { end: async () => undefined },
  };
}

function safeJsonString(value: unknown) {
  return JSON.stringify(value ?? null);
}

function expectMethodNotAllowed(response: Response) {
  expect(response.status).toBe(405);
  return response.json().then((payload) => {
    expect(payload).toEqual(expect.objectContaining({ ok: false }));
    expect(safeJsonString(payload)).not.toMatch(
      /stack|select \*|drizzle|postgres:\/\/|DATABASE_URL|OPENAI_COMPATIBLE/i,
    );
  });
}

describe("API route inventory and safety (VAL-SAFE-001, VAL-SAFE-004, VAL-SAFE-005, VAL-SAFE-013)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Most unit tests use a stubbed in-memory DB via globalThis.__carrierPerfScorecardDb.
    // Ensure the health endpoint reflects "configured" posture without needing a real connection string.
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? "configured";
    process.env.NEXT_PUBLIC_DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE ?? "true";
    process.env.AI_PROVIDER = process.env.AI_PROVIDER ?? "mock";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    (globalThis as unknown as { __carrierPerfScorecardDb?: unknown }).__carrierPerfScorecardDb = undefined;
  });

  it("enumerates every API route module under src/app/api (VAL-SAFE-013)", () => {
    const apiRoot = path.join(process.cwd(), "src", "app", "api");

    function walk(dir: string, out: string[]) {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) walk(full, out);
        else if (entry === "route.ts") out.push(full);
      }
    }

    const discovered: string[] = [];
    walk(apiRoot, discovered);
    const relative = discovered.map((p) => path.relative(process.cwd(), p).replaceAll("\\", "/")).sort();

    expect(relative).toEqual(
      [
        "src/app/api/carriers/[carrierId]/scorecard/route.ts",
        "src/app/api/demo-data/route.ts",
        "src/app/api/evidence/route.ts",
        "src/app/api/health/route.ts",
        "src/app/api/qbr/brief/route.ts",
        "src/app/api/scorecards/options/route.ts",
        "src/app/api/scorecards/summary/route.ts",
      ].sort(),
    );
  });

  it("exports runtime=nodejs and rejects unsupported methods with controlled JSON errors", async () => {
    const routes = [
      { id: "/api/health", mod: healthRoute, allowed: "GET" as const },
      { id: "/api/demo-data", mod: demoDataRoute, allowed: "GET" as const },
      { id: "/api/scorecards/summary", mod: summaryRoute, allowed: "GET" as const },
      { id: "/api/scorecards/options", mod: optionsRoute, allowed: "GET" as const },
      { id: "/api/evidence", mod: evidenceRoute, allowed: "GET" as const },
      { id: "/api/carriers/[carrierId]/scorecard", mod: carrierScorecardRoute, allowed: "GET" as const },
      { id: "/api/qbr/brief", mod: qbrBriefRoute, allowed: "POST" as const },
    ] as const;

    for (const r of routes) {
      expect((r.mod as Record<string, unknown>).runtime).toBe("nodejs");
      // Each route must explicitly reject the unsupported mutation methods with JSON (read-only posture).
      if (r.allowed !== "POST") {
        for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
          const handler = (r.mod as Record<string, unknown>)[method] as (() => Response) | undefined;
          expect(handler, `${r.id} should export ${method}()`).toBeTypeOf("function");
          if (typeof handler !== "function") {
            throw new Error(`${r.id} should export ${method}()`);
          }
          await expectMethodNotAllowed(handler());
        }
      } else {
        // POST is allowed for QBR generation (read-only generation), but other methods must be blocked.
        for (const method of ["GET", "PUT", "PATCH", "DELETE"] as const) {
          const handler = (r.mod as Record<string, unknown>)[method] as (() => Response) | undefined;
          expect(handler, `${r.id} should export ${method}()`).toBeTypeOf("function");
          if (typeof handler !== "function") {
            throw new Error(`${r.id} should export ${method}()`);
          }
          await expectMethodNotAllowed(handler());
        }
      }
    }
  });

  it("returns safe health and demo-data metadata without leaking private configuration", async () => {
    const { db } = createTestDb();
    const { dataset, fingerprint } = await seed(db);
    installRouteDb(db);

    const health = await healthRoute.GET();
    expect(health.status).toBe(200);
    const healthPayload = await health.json();
    expect(healthPayload.ok).toBe(true);
    expect(healthPayload.demoMode).toBeTypeOf("boolean");
    expect(healthPayload.dependencies).toEqual(expect.objectContaining({ databaseConfigured: true }));
    expect(safeJsonString(healthPayload)).not.toMatch(/OPENAI_COMPATIBLE|API_KEY|BASE_URL|postgres:\/\//i);

    const demoData = await demoDataRoute.GET();
    expect(demoData.status).toBe(200);
    const demoPayload = await demoData.json();
    expect(demoPayload.ok).toBe(true);
    expect(demoPayload.dataset?.id).toBe(dataset.datasetId);
    expect(demoPayload.dataset?.fingerprint).toBe(fingerprint);
    expect(demoPayload.counts.carriers).toBeGreaterThan(0);
    expect(demoPayload.counts.deliveryRecords).toBeGreaterThan(0);
    expect(safeJsonString(demoPayload)).not.toMatch(/OPENAI_COMPATIBLE|API_KEY|BASE_URL|postgres:\/\//i);
  });

  it("classifies QBR generation as read-only and rejects malformed JSON safely", async () => {
    const { db } = createTestDb();
    const { dataset } = await seed(db);
    installRouteDb(db);

    const malformed = new NextRequest("http://example.test/api/qbr/brief", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    const res = await qbrBriefRoute.POST(malformed);
    expect(res.status).toBe(400);
    const payload = await res.json();
    expect(payload.ok).toBe(false);
    expect(safeJsonString(payload)).not.toMatch(/stack|select \*|drizzle|DATABASE_URL|OPENAI_COMPATIBLE/i);

    const okReq = new NextRequest("http://example.test/api/qbr/brief", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ carrierId: dataset.carriers[0]!.id }),
    });
    const okRes = await qbrBriefRoute.POST(okReq);
    expect(okRes.status).toBe(200);
    const okPayload = await okRes.json();
    expect(okPayload.ok).toBe(true);
  });

  it("GET endpoints return stable results for identical requests and do not mutate seeded data (VAL-SAFE-002)", async () => {
    const { db } = createTestDb();
    const { dataset } = await seed(db);
    installRouteDb(db);

    const beforeCounts = {
      carriers: (await db.select().from(schema.carriers)).length,
      periods: (await db.select().from(schema.periods)).length,
      deliveries: (await db.select().from(schema.deliveryRecords)).length,
      evidence: (await db.select().from(schema.evidenceItems)).length,
    };

    const req1 = new NextRequest("http://example.test/api/scorecards/summary?region=emea&period=2026-05");
    const res1 = await summaryRoute.GET(req1);
    expect(res1.status).toBe(200);
    const payload1 = await res1.json();

    const req2 = new NextRequest("http://example.test/api/scorecards/summary?region=emea&period=2026-05");
    const res2 = await summaryRoute.GET(req2);
    expect(res2.status).toBe(200);
    const payload2 = await res2.json();

    expect(payload2).toEqual(payload1);

    const evidenceReq1 = new NextRequest(`http://example.test/api/evidence?carrierId=${dataset.carriers[0]!.id}&cap=5`);
    const evidenceRes1 = await evidenceRoute.GET(evidenceReq1);
    expect(evidenceRes1.status).toBe(200);
    const evidencePayload1 = await evidenceRes1.json();

    const evidenceReq2 = new NextRequest(`http://example.test/api/evidence?carrierId=${dataset.carriers[0]!.id}&cap=5`);
    const evidenceRes2 = await evidenceRoute.GET(evidenceReq2);
    expect(evidenceRes2.status).toBe(200);
    const evidencePayload2 = await evidenceRes2.json();

    expect(evidencePayload2).toEqual(evidencePayload1);

    const afterCounts = {
      carriers: (await db.select().from(schema.carriers)).length,
      periods: (await db.select().from(schema.periods)).length,
      deliveries: (await db.select().from(schema.deliveryRecords)).length,
      evidence: (await db.select().from(schema.evidenceItems)).length,
    };
    expect(afterCounts).toEqual(beforeCounts);
  });

  it("carrier detail endpoint returns safe not-found messaging for unknown carrier IDs (VAL-SAFE-003)", async () => {
    const { db } = createTestDb();
    await seed(db);
    installRouteDb(db);

    const carrierId = "00000000-0000-4000-8000-000000000000";
    const res = await carrierScorecardRoute.GET(
      new NextRequest(`http://example.test/api/carriers/${carrierId}/scorecard`),
      { params: Promise.resolve({ carrierId }) },
    );
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.ok).toBe(true);
    expect(payload.carrier).toBe(null);
    expect(String(payload.message ?? "")).toMatch(/not found/i);
  });
});
