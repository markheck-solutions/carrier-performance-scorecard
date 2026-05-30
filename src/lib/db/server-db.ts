import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { readDatabaseUrlOrThrow } from "@/lib/env/server-env";

import { schema } from "./schema";

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
  const created = createServerDb(readDatabaseUrlOrThrow());
  globalThis.__carrierPerfScorecardDb = created;
  return created;
}
