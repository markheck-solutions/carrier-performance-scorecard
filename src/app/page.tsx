import { Suspense } from "react";

import { ExecutiveDashboardClient } from "@/components/executive/ExecutiveDashboardClient";
import { ExecutiveDashboardLoading } from "@/components/executive/ExecutiveDashboardLoading";
import type { RuntimePosture } from "@/components/executive/ExecutiveDashboard";
import type { ScorecardsSummaryModel, HealthModel } from "@/components/executive/types";
import { getServerDb } from "@/lib/db/server-db";
import { parseScoreFiltersFromUrl } from "@/lib/scoring/filter-parse";
import { isInvalidFilterError } from "@/lib/scoring/invalid-filter";
import { readScorecardsSummary } from "@/lib/scoring/read-models";

export const runtime = "nodejs";

async function readSummary(filtersUrl: URL): Promise<ScorecardsSummaryModel> {
  const { db } = getServerDb();
  const filters = (() => {
    // For direct URLs with invalid filter enums, recover by dropping unsupported filters.
    const sanitized = new URL(filtersUrl.toString());
    for (let attempts = 0; attempts < 4; attempts += 1) {
      try {
        return parseScoreFiltersFromUrl(sanitized);
      } catch (err) {
        if (!isInvalidFilterError(err)) throw err;
        sanitized.searchParams.delete(err.details.field);
      }
    }
    // If something is deeply wrong, fall back to a safe baseline scope.
    return parseScoreFiltersFromUrl(new URL("http://scorecard.local/"));
  })();

  try {
    return await readScorecardsSummary(db, filters);
  } catch (err) {
    if (!isInvalidFilterError(err)) throw err;
    // Period allowlist validation happens inside the read model. If period is unsupported, drop it for SSR recovery.
    const sanitized = { ...filters, period: null };
    return await readScorecardsSummary(db, sanitized);
  }
}

async function readRuntimeStatus(): Promise<HealthModel> {
  return {
    ok: true,
    service: "carrier-performance-scorecard",
    demoMode: process.env.NEXT_PUBLIC_DEMO_MODE === "true",
    time: new Date().toISOString(),
  };
}

async function readRuntimePosture(): Promise<RuntimePosture> {
  try {
    const data = await readRuntimeStatus();
    return { status: "ready", data };
  } catch {
    return {
      status: "error",
      message: "Runtime status is temporarily unavailable. The scorecard is still usable.",
    };
  }
}

export default async function Home(props: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = (await props.searchParams) ?? {};
  const url = new URL("http://scorecard.local/");
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) continue;
    if (typeof value === "string") url.searchParams.set(key, value);
  }

  const summary = readSummary(url);
  const runtime = await readRuntimePosture();

  return (
    <Suspense fallback={<ExecutiveDashboardLoading />}>
      <ExecutiveDashboardClient summary={summary} runtime={runtime} />
    </Suspense>
  );
}
