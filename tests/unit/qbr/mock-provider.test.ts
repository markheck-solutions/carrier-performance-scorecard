// @vitest-environment node
import { describe, expect, it } from "vitest";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import { ensureDemoSchema } from "../../../src/lib/db/ensure-schema";
import { schema } from "../../../src/lib/db/schema";
import { DEMO_DATASET_ID } from "../../../src/lib/db/demo-values";
import { buildDemoDataset } from "../../../src/lib/seed/demo-dataset";
import { seedDemoData } from "../../../src/lib/seed/seed-demo-data";
import { assertQbrSafeContextWhitelisted, buildQbrSafeContextV1 } from "../../../src/lib/qbr/context";
import { generateMockQbrBrief } from "../../../src/lib/qbr/mock-provider";

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

function flattenBrief(brief: ReturnType<typeof generateMockQbrBrief>["brief"]) {
  return [...brief.strengths, ...brief.concerns, ...brief.questions, ...brief.governanceActions].join("\n");
}

describe("mock QBR provider", () => {
  it("builds a whitelisted safe context shape (VAL-QBR-023)", async () => {
    const { db } = createTestDb();
    const dataset = await seed(db);

    const carrierId = dataset.carriers[0]!.id;
    const context = await buildQbrSafeContextV1(db, { carrierId, filters: { carrierId: null, region: null, productType: null, period: null } });
    expect(() => assertQbrSafeContextWhitelisted(context)).not.toThrow();
  });

  it("returns required sections with carrier-specific bullets and no em dashes (VAL-QBR-001, VAL-QBR-009)", async () => {
    const { db } = createTestDb();
    const dataset = await seed(db);

    const carrier = dataset.carriers[0]!;
    const context = await buildQbrSafeContextV1(db, { carrierId: carrier.id, filters: { carrierId: null, region: null, productType: null, period: null } });
    const out = generateMockQbrBrief(context);

    expect(out.brief.strengths.length).toBeGreaterThan(0);
    expect(out.brief.concerns.length).toBeGreaterThan(0);
    expect(out.brief.questions.length).toBeGreaterThan(0);
    expect(out.brief.governanceActions.length).toBeGreaterThan(0);

    const combined = flattenBrief(out.brief);
    expect(combined.includes(carrier.name)).toBe(true);
    expect(combined.includes("\u2014")).toBe(false);
  });

  it("is deterministic for identical context and variant (VAL-QBR-010)", async () => {
    const { db } = createTestDb();
    const dataset = await seed(db);

    const carrierId = dataset.carriers[1]!.id;
    const context = await buildQbrSafeContextV1(db, { carrierId, filters: { carrierId: null, region: "na", productType: null, period: null } });

    const first = generateMockQbrBrief(context, { variant: 0 });
    const second = generateMockQbrBrief(context, { variant: 0 });
    expect(second).toEqual(first);
  });

  it("varies output when top delay reason changes (VAL-QBR-006, VAL-QBR-011)", async () => {
    const { db } = createTestDb();
    const dataset = await seed(db);

    const carrierId = dataset.carriers[2]!.id;
    const baseline = await buildQbrSafeContextV1(db, { carrierId, filters: { carrierId: null, region: null, productType: null, period: null } });
    const alt = {
      ...baseline,
      delays: {
        topDelayReasons: [
          { delayReason: "permit", count: 9 },
          { delayReason: "fiber_splice", count: 2 },
        ],
      },
    };

    const first = generateMockQbrBrief(baseline, { variant: 0 });
    const second = generateMockQbrBrief(alt, { variant: 0 });
    expect(flattenBrief(second.brief)).not.toEqual(flattenBrief(first.brief));
    expect(flattenBrief(second.brief)).toContain("permit");
  });

  it("produces an honest limited-data brief when filters yield zero records (VAL-QBR-007)", async () => {
    const { db } = createTestDb();
    const dataset = await seed(db);

    const carrierId = dataset.carriers[0]!.id;
    const context = await buildQbrSafeContextV1(db, { carrierId, filters: { carrierId: null, region: "latam", productType: null, period: null } });
    const out = generateMockQbrBrief(context);

    expect(out.dataNotice).toBeTruthy();
    expect(out.dataNotice?.message).toMatch(/no delivery records/i);
    expect(flattenBrief(out.brief)).toMatch(/zero delivery records|no scored strengths/i);
  });
});
