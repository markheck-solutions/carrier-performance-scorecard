import { Suspense } from "react";

import { ExecutiveDashboardClient } from "@/components/executive/ExecutiveDashboardClient";
import { ExecutiveDashboardLoading } from "@/components/executive/ExecutiveDashboardLoading";
import type { RuntimePosture } from "@/components/executive/ExecutiveDashboard";
import type { ScorecardsSummaryModel, HealthModel } from "@/components/executive/types";
import { getServerDb } from "@/lib/db/server-db";
import { readScorecardsSummary } from "@/lib/scoring/read-models";

export const runtime = "nodejs";

async function readSummary(): Promise<ScorecardsSummaryModel> {
  const { db } = getServerDb();
  return await readScorecardsSummary(db, {});
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

export default async function Home() {
  const summary = readSummary();
  const runtime = await readRuntimePosture();

  return (
    <Suspense fallback={<ExecutiveDashboardLoading />}>
      <ExecutiveDashboardClient summary={summary} runtime={runtime} />
    </Suspense>
  );
}
