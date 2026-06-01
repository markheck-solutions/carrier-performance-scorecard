import { config as loadDotenv } from "dotenv";

loadDotenv({ path: ".env.local" });
loadDotenv();

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { DEMO_DATASET_ID } from "../src/lib/db/demo-values";
import { schema } from "../src/lib/db/schema";
import { buildDemoDataset } from "../src/lib/seed/demo-dataset";
import { SEED_ALLOWLIST_ENV_VAR, seedDemoData } from "../src/lib/seed/seed-demo-data";

function getDatabaseUrlOrThrow() {
  const url = process.env.DATABASE_URL;
  if (!url || url.trim().length === 0) {
    throw new Error("Database connection is not configured.");
  }
  return url;
}

async function main() {
  const databaseUrl = getDatabaseUrlOrThrow();
  const allowlistToken = process.env[SEED_ALLOWLIST_ENV_VAR];

  const sql = postgres(databaseUrl, { max: 1, idle_timeout: 10, connect_timeout: 10 });
  const db = drizzle(sql, { schema });

  try {
    const dataset = buildDemoDataset();
    const result = await seedDemoData(db, dataset, {
      expectedDatasetId: DEMO_DATASET_ID,
      allowlistToken,
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          datasetId: dataset.datasetId,
          seedVersion: dataset.seedVersion,
          fingerprint: result.fingerprint,
        },
        null,
        2,
      ),
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : "Seed failed.";
  console.error(message);
  process.exitCode = 1;
});
