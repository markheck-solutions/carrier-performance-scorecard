import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { schema } from "./schema";

function getDatabaseUrlOrThrow() {
  const url = process.env.DATABASE_URL;
  if (!url || url.trim().length === 0) {
    throw new Error("Database connection is not configured.");
  }
  return url;
}

export function createServerDb(databaseUrl: string) {
  const sql = postgres(databaseUrl, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 20,
    prepare: true,
  });

  const db = drizzle(sql, { schema });
  return { db, sql };
}

declare global {
  var __carrierPerfScorecardDb: ReturnType<typeof createServerDb> | undefined;
}

export function getServerDb() {
  if (globalThis.__carrierPerfScorecardDb) return globalThis.__carrierPerfScorecardDb;
  const created = createServerDb(getDatabaseUrlOrThrow());
  globalThis.__carrierPerfScorecardDb = created;
  return created;
}
