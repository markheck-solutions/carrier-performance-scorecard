import { sql } from "drizzle-orm";

import { ensureDemoSchema, type DemoDb } from "../db/ensure-schema";
import { carriers, deliveryRecords, evidenceItems, periods, seedMeta } from "../db/schema";
import { assertDemoSafe } from "../safety/demo-data-safety";
import type { DemoDataset } from "./demo-dataset";
import { computeDatasetFingerprint } from "./fingerprint";

type SeedOptions = {
  allowlistToken?: string;
  expectedDatasetId: string;
};

export const SEED_ALLOWLIST_ENV_VAR = "DEMO_SEED_ALLOWLIST";

function rowsFromExecuteResult(result: unknown): unknown[] {
  const anyResult = result as { rows?: unknown[] };
  if (Array.isArray(anyResult?.rows)) return anyResult.rows;
  if (Array.isArray(result)) return result;
  return [];
}

async function seedMetaTableExists(db: DemoDb) {
  const res = await db.execute(
    sql`select exists (
      select 1
      from information_schema.tables
      where table_schema = 'public' and table_name = 'seed_meta'
    ) as exists;`
  );
  const rows = rowsFromExecuteResult(res) as Array<{ exists?: boolean }>;
  return rows[0]?.exists === true;
}

async function readSeedMeta(db: DemoDb, datasetId: string) {
  const res = await db.execute(
    sql`select dataset_id, seed_version, fingerprint, seeded_at
        from seed_meta
        where dataset_id = ${datasetId}
        limit 1;`
  );
  const rows = rowsFromExecuteResult(res) as Array<{
    dataset_id: string;
    seed_version: string;
    fingerprint: string;
    seeded_at: string;
  }>;
  return rows[0] ?? null;
}

export async function assertSeedTargetAllowed(db: DemoDb, opts: SeedOptions) {
  const exists = await seedMetaTableExists(db);
  if (exists) {
    const meta = await readSeedMeta(db, opts.expectedDatasetId);
    if (meta) return { allowed: true as const, reason: "seed_meta marker present" };
  }

  if (opts.allowlistToken && opts.allowlistToken === opts.expectedDatasetId) {
    return { allowed: true as const, reason: "allowlist token matched" };
  }

  throw new Error(
    `Refusing to seed this database. Demo seed requires an explicit allowlist token on first run via ${SEED_ALLOWLIST_ENV_VAR}.`
  );
}

export async function seedDemoData(db: DemoDb, dataset: DemoDataset, opts: SeedOptions) {
  if (dataset.datasetId !== opts.expectedDatasetId) {
    throw new Error("Seed dataset mismatch.");
  }

  // Safety scan before touching the database.
  assertDemoSafe(dataset);

  await assertSeedTargetAllowed(db, opts);
  await ensureDemoSchema(db);

  const { digest } = computeDatasetFingerprint(dataset);

  const run = async (tx: DemoDb) => {
    await tx
      .insert(carriers)
      .values(dataset.carriers)
      .onConflictDoUpdate({
        target: carriers.seedKey,
        set: {
          name: sql`excluded.name`,
          shortCode: sql`excluded.short_code`,
          relationshipTier: sql`excluded.relationship_tier`,
          regionFocus: sql`excluded.region_focus`,
        },
      });

    await tx
      .insert(periods)
      .values(dataset.periods)
      .onConflictDoUpdate({
        target: periods.seedKey,
        set: {
          label: sql`excluded.label`,
          startDate: sql`excluded.start_date`,
          endDate: sql`excluded.end_date`,
        },
      });

    await tx
      .insert(deliveryRecords)
      .values(
        dataset.deliveryRecords.map((r) => ({
          ...r,
          openedAt: new Date(r.openedAt),
          closedAt: r.closedAt ? new Date(r.closedAt) : null,
        }))
      )
      .onConflictDoUpdate({
        target: deliveryRecords.seedKey,
        set: {
          carrierId: sql`excluded.carrier_id`,
          periodId: sql`excluded.period_id`,
          region: sql`excluded.region`,
          productType: sql`excluded.product_type`,
          stage: sql`excluded.stage`,
          delayReason: sql`excluded.delay_reason`,
          committedDate: sql`excluded.committed_date`,
          forecastDate: sql`excluded.forecast_date`,
          completedDate: sql`excluded.completed_date`,
          openedAt: sql`excluded.opened_at`,
          closedAt: sql`excluded.closed_at`,
          delayDays: sql`excluded.delay_days`,
          responsivenessHours: sql`excluded.responsiveness_hours`,
          escalationCount: sql`excluded.escalation_count`,
          issueSignature: sql`excluded.issue_signature`,
          isRepeat: sql`excluded.is_repeat`,
          customerImpact: sql`excluded.customer_impact`,
        },
      });

    await tx
      .insert(evidenceItems)
      .values(dataset.evidenceItems)
      .onConflictDoUpdate({
        target: evidenceItems.seedKey,
        set: {
          carrierId: sql`excluded.carrier_id`,
          periodId: sql`excluded.period_id`,
          deliveryRecordId: sql`excluded.delivery_record_id`,
          dimension: sql`excluded.dimension`,
          summary: sql`excluded.summary`,
        },
      });

    await tx
      .insert(seedMeta)
      .values({
        datasetId: dataset.datasetId,
        seedVersion: dataset.seedVersion,
        fingerprint: digest,
      })
      .onConflictDoUpdate({
        target: seedMeta.datasetId,
        set: {
          seedVersion: sql`excluded.seed_version`,
          fingerprint: sql`excluded.fingerprint`,
          seededAt: sql`now()`,
        },
      });
  };

  const maybeTx = db as unknown as { transaction?: (fn: (tx: DemoDb) => Promise<void>) => Promise<void> };
  if (maybeTx.transaction) {
    await maybeTx.transaction(async (tx) => {
      await run(tx);
    });
  } else {
    await run(db);
  }

  return { fingerprint: digest };
}
