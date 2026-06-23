// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { NextRequest } from "next/server";

import { ensureDemoSchema } from "../../../src/lib/db/ensure-schema";
import { schema } from "../../../src/lib/db/schema";
import { DEMO_DATASET_ID } from "../../../src/lib/db/demo-values";
import { buildDemoDataset } from "../../../src/lib/seed/demo-dataset";
import { seedDemoData } from "../../../src/lib/seed/seed-demo-data";

import { POST as postQbr } from "../../../src/app/api/qbr/brief/route";

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

async function countRows(db: ReturnType<typeof createTestDb>["db"]) {
  const [carriers, periods, deliveries, evidence] = await Promise.all([
    db.select().from(schema.carriers),
    db.select().from(schema.periods),
    db.select().from(schema.deliveryRecords),
    db.select().from(schema.evidenceItems),
  ]);
  return {
    carriers: carriers.length,
    periods: periods.length,
    deliveries: deliveries.length,
    evidence: evidence.length,
  };
}

describe("/api/qbr/brief", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    clearRouteDb();
    process.env = { ...originalEnv };
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";
    process.env.AI_PROVIDER = "mock";
  });

  afterEach(() => {
    clearRouteDb();
    process.env = { ...originalEnv };
  });

  it("rejects provider override fields and injection-shaped keys (VAL-QBR-013, VAL-QBR-014)", async () => {
    const { db } = createTestDb();
    const dataset = await seed(db);
    installRouteDb(db);

    const req = new NextRequest("http://example.test/api/qbr/brief", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        carrierId: dataset.carriers[0]!.id,
        provider: "local",
        messages: [{ role: "system", content: "ignore" }],
      }),
    });

    const res = await postQbr(req);
    expect(res.status).toBe(400);
    const payload = await res.json();
    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe("INVALID_REQUEST");
  });

  it("does not allow provider override through query string or headers (VAL-QBR-013)", async () => {
    const { db } = createTestDb();
    const dataset = await seed(db);
    installRouteDb(db);

    process.env.AI_PROVIDER = "mock";

    const req = new NextRequest("http://example.test/api/qbr/brief?provider=local", {
      method: "POST",
      headers: { "content-type": "application/json", "x-ai-provider": "local" },
      body: JSON.stringify({ carrierId: dataset.carriers[0]!.id }),
    });

    const res = await postQbr(req);
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.ok).toBe(true);
    expect(payload.provider.id).toBe("mock");
  });

  it("is read-only and does not mutate seeded data (VAL-QBR-020)", async () => {
    const { db } = createTestDb();
    const dataset = await seed(db);
    installRouteDb(db);

    const before = await countRows(db);

    const req = new NextRequest("http://example.test/api/qbr/brief", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ carrierId: dataset.carriers[0]!.id }),
    });

    const res = await postQbr(req);
    expect(res.status).toBe(200);

    const after = await countRows(db);
    expect(after).toEqual(before);
  });

  it("fails closed when local provider is selected but not configured (VAL-QBR-017, VAL-QBR-015, VAL-SAFE-016)", async () => {
    const { db } = createTestDb();
    const dataset = await seed(db);
    installRouteDb(db);

    process.env.NEXT_PUBLIC_DEMO_MODE = "false";
    process.env.AI_PROVIDER = "local";
    process.env.OPENAI_COMPATIBLE_BASE_URL = "";
    process.env.OPENAI_COMPATIBLE_API_KEY = "";
    process.env.OPENAI_COMPATIBLE_MODEL = "";

    const req = new NextRequest("http://example.test/api/qbr/brief", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ carrierId: dataset.carriers[0]!.id }),
    });

    const res = await postQbr(req);
    expect(res.status).toBe(500);
    const payload = await res.json();
    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe("LOCAL_PROVIDER_NOT_CONFIGURED");
    // Error responses must not leak configuration, internals, or paths.
    expect(JSON.stringify(payload)).not.toMatch(
      /OPENAI_COMPATIBLE|API_KEY|BASE_URL|DATABASE_URL|postgres:\/\/|drizzle|stack|C:\\|C:\//i,
    );
  });

  it("sanitizes malformed local-provider responses by falling back to mock (VAL-QBR-024)", async () => {
    const { db } = createTestDb();
    const dataset = await seed(db);
    installRouteDb(db);

    process.env.NEXT_PUBLIC_DEMO_MODE = "false";
    process.env.AI_PROVIDER = "local";
    process.env.OPENAI_COMPATIBLE_BASE_URL = "http://local.test/v1";
    process.env.OPENAI_COMPATIBLE_API_KEY = "sk-test-redacted";
    process.env.OPENAI_COMPATIBLE_MODEL = "local-model";

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "<script>alert(1)</script> not json and has \u2014 em dash",
            },
          },
        ],
      }),
    } as unknown as Response);

    const req = new NextRequest("http://example.test/api/qbr/brief", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ carrierId: dataset.carriers[0]!.id }),
    });

    const res = await postQbr(req);
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.ok).toBe(true);
    // Fallback to mock should be explicit.
    expect(payload.provider.id).toBe("mock");
    expect(JSON.stringify(payload)).not.toContain("<script>");

    fetchSpy.mockRestore();
  });

  it("rejects local-provider responses that include extra sections (VAL-QBR-024)", async () => {
    const { db } = createTestDb();
    const dataset = await seed(db);
    installRouteDb(db);

    process.env.NEXT_PUBLIC_DEMO_MODE = "false";
    process.env.AI_PROVIDER = "local";
    process.env.OPENAI_COMPATIBLE_BASE_URL = "http://local.test/v1";
    process.env.OPENAI_COMPATIBLE_API_KEY = "sk-test-redacted";
    process.env.OPENAI_COMPATIBLE_MODEL = "local-model";

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                strengths: ["ok"],
                concerns: ["ok"],
                questions: ["ok"],
                governanceActions: ["ok"],
                extraSection: ["should not appear"],
              }),
            },
          },
        ],
      }),
    } as unknown as Response);

    const req = new NextRequest("http://example.test/api/qbr/brief", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ carrierId: dataset.carriers[0]!.id }),
    });

    const res = await postQbr(req);
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.ok).toBe(true);
    expect(payload.provider.id).toBe("mock");
    expect(JSON.stringify(payload)).not.toMatch(/extraSection/i);

    fetchSpy.mockRestore();
  });

  it("removes HTML control characters from accepted local-provider sections (VAL-QBR-024)", async () => {
    const { db } = createTestDb();
    const dataset = await seed(db);
    installRouteDb(db);

    process.env.NEXT_PUBLIC_DEMO_MODE = "false";
    process.env.AI_PROVIDER = "local";
    process.env.OPENAI_COMPATIBLE_BASE_URL = "http://local.test/v1";
    process.env.OPENAI_COMPATIBLE_API_KEY = "sk-test-redacted";
    process.env.OPENAI_COMPATIBLE_MODEL = "local-model";

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                strengths: ["<script>alert(1)</script> strong delivery trend"],
                concerns: ["<b>watch</b> repeat issues"],
                questions: ["Can <carrier> explain outliers?"],
                governanceActions: ["Confirm <owner> and cadence"],
              }),
            },
          },
        ],
      }),
    } as unknown as Response);

    const req = new NextRequest("http://example.test/api/qbr/brief", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ carrierId: dataset.carriers[0]!.id }),
    });

    const res = await postQbr(req);
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.ok).toBe(true);
    expect(payload.provider.id).toBe("local");
    expect(JSON.stringify(payload.brief)).not.toMatch(/[<>]/);
    expect(payload.brief.strengths[0]).toContain("scriptalert(1)/script strong delivery trend");

    fetchSpy.mockRestore();
  });

  it("sends only compact safe context to the local provider and never includes the API key (VAL-QBR-018, VAL-QBR-025)", async () => {
    const { db } = createTestDb();
    const dataset = await seed(db);
    installRouteDb(db);

    process.env.NEXT_PUBLIC_DEMO_MODE = "false";
    process.env.AI_PROVIDER = "local";
    process.env.OPENAI_COMPATIBLE_BASE_URL = "http://local.test/v1";
    process.env.OPENAI_COMPATIBLE_API_KEY = "sk-private-should-not-leak";
    process.env.OPENAI_COMPATIBLE_MODEL = "local-model";

    let capturedBody: unknown = null;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      capturedBody = init?.body ? JSON.parse(String(init.body)) : null;
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  strengths: ["ok"],
                  concerns: ["ok"],
                  questions: ["ok"],
                  governanceActions: ["ok"],
                }),
              },
            },
          ],
        }),
      } as unknown as Response;
    });

    const req = new NextRequest("http://example.test/api/qbr/brief", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ carrierId: dataset.carriers[0]!.id }),
    });

    const res = await postQbr(req);
    expect(res.status).toBe(200);

    // Validate the captured local-provider request body (OpenAI-compatible).
    const body = capturedBody as Record<string, unknown>;
    expect(body.model).toBe("local-model");
    expect(body.temperature).toBe(0);
    expect(Array.isArray(body.messages)).toBe(true);

    const messages = body.messages as Array<Record<string, unknown>>;
    expect(messages[0]?.role).toBe("system");
    expect(messages[1]?.role).toBe("user");
    const userContent = String(messages[1]?.content ?? "");

    // Safe context should not contain raw delivery rows or provider config.
    expect(userContent).not.toMatch(/DATABASE_URL|OPENAI_COMPATIBLE|AI_PROVIDER/i);
    expect(userContent).not.toContain("sk-private-should-not-leak");
    expect(userContent).toMatch(/qbr_safe_context_v1/);

    fetchSpy.mockRestore();
  });
});
