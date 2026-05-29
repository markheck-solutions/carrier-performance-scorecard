import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { ExecutiveDashboard } from "@/components/executive/ExecutiveDashboard";
import { ExecutiveDashboardLoading } from "@/components/executive/ExecutiveDashboardLoading";
import type { ScorecardsSummaryModel, HealthModel } from "@/components/executive/types";
import type { CarrierScorecard, ScoreComponentResult, ScoreGrade, ScoringComponentId } from "@/lib/scoring/types";

afterEach(() => {
  cleanup();
});

function component(params: {
  id: ScoringComponentId;
  normalizedScore: number;
  contribution: number;
  metric:
    | { kind: "scalar"; value: number; unit: string }
    | { kind: "ratio"; numerator: number; denominator: number; unit: string };
  availability?: "ok" | "insufficient_data";
}): ScoreComponentResult {
  return {
    id: params.id,
    label: params.id.replaceAll("_", " "),
    direction: params.id === "commitment_adherence" || params.id === "completion_trend" ? "higher_is_better" : "lower_is_better",
    weight: 10,
    metric: params.metric,
    sampleCount: 8,
    evidenceCount: 0,
    evidenceIds: [],
    normalization: { floor: 0, cap: 1, best: 1, worst: 0 },
    normalizedScore: params.normalizedScore,
    contribution: params.contribution,
    explanation: "stub",
    dataQuality: { availability: params.availability ?? "ok", notes: [] },
    scope: {
      filters: { carrierId: null, period: null, productType: null, region: null },
      periodWindow: { mode: "all", startDate: "2026-04-01", endDate: "2026-06-30" },
    },
  };
}

function fakeScorecard(params: { id: string; name: string; shortCode: string; grade: ScoreGrade; totalScore: number }): CarrierScorecard {
  const components: ScoreComponentResult[] = [
    component({
      id: "commitment_adherence",
      normalizedScore: 88,
      contribution: 8.8,
      metric: { kind: "ratio", numerator: 14, denominator: 20, unit: "rate" },
    }),
    component({
      id: "delay_severity",
      normalizedScore: 70,
      contribution: 7,
      metric: { kind: "scalar", value: 6, unit: "days" },
    }),
    component({
      id: "repeat_issue_concentration",
      normalizedScore: 66,
      contribution: 6.6,
      metric: { kind: "ratio", numerator: 2, denominator: 10, unit: "rate" },
    }),
    component({
      id: "responsiveness",
      normalizedScore: 78,
      contribution: 7.8,
      metric: { kind: "scalar", value: 12, unit: "hours" },
    }),
    component({
      id: "aging_open_commitments",
      normalizedScore: 82,
      contribution: 8.2,
      metric: { kind: "ratio", numerator: 1, denominator: 8, unit: "rate" },
    }),
    component({
      id: "escalation_volume",
      normalizedScore: 74,
      contribution: 7.4,
      metric: { kind: "scalar", value: 0.4, unit: "escalations_per_record" },
    }),
    component({
      id: "completion_trend",
      normalizedScore: 60,
      contribution: 6,
      metric: { kind: "scalar", value: -0.03, unit: "delta_rate" },
    }),
  ];

  return {
    carrier: { id: params.id, name: params.name, shortCode: params.shortCode, relationshipTier: "core", regionFocus: "na" },
    scope: components[0]!.scope,
    mix: {
      regions: [{ region: "na", count: 8, share: 1 }],
      productTypes: [{ productType: "fiber", count: 6, share: 0.75 }, { productType: "wireless", count: 2, share: 0.25 }],
      topRegion: "na",
      topProductType: "fiber",
    },
    sampleCount: 8,
    confidence: { label: "high", lowVolume: false, threshold: 4, notes: [] },
    components,
    totalScore: params.totalScore,
    grade: params.grade,
    rankTieBreaker: [
      { by: "totalScore", order: "desc" },
      { by: "name", order: "asc" },
      { by: "id", order: "asc" },
    ],
  };
}

function fakeSummary(): ScorecardsSummaryModel {
  const carriers: CarrierScorecard[] = [
    fakeScorecard({ id: "c1", name: "Northstar Fiber", shortCode: "NSF", grade: "B", totalScore: 84 }),
    fakeScorecard({ id: "c2", name: "Harbor Wireless", shortCode: "HBW", grade: "D", totalScore: 62 }),
  ];

  return {
    ok: true,
    manifest: {},
    scope: carriers[0]!.scope,
    counts: { carriers: 2, periods: 3, deliveryRecords: 48, evidenceItems: 18 },
    aggregates: {
      delayReasons: [
        { delayReason: "permit", count: 11 },
        { delayReason: "construction", count: 7 },
        { delayReason: "none", count: 30 },
      ],
      regions: [{ region: "na", count: 30 }],
      productTypes: [{ productType: "fiber", count: 33 }],
      periods: [{ period: "2026-06", completed: 14, onTime: 10, delayed: 4 }],
    },
    carriers,
  };
}

function fakeHealth(): HealthModel {
  return { ok: true, service: "carrier-performance-scorecard", demoMode: true, time: "2026-05-29T12:34:56.000Z" };
}

describe("Executive dashboard", () => {
  it("shows a polished loading state that preserves the dashboard structure (VAL-EXEC-010)", async () => {
    render(<ExecutiveDashboardLoading />);

    expect(screen.getByRole("heading", { name: /carrier performance intelligence scorecard/i })).toBeVisible();
    expect(screen.getByText(/demo disclosure/i)).toBeVisible();

    // KPI grid skeletons should be visible while data is pending.
    expect(screen.getByLabelText(/loading kpis/i)).toBeVisible();
  });

  it("renders a safe, retryable error state with no internal leakage (VAL-EXEC-011)", async () => {
    const { default: ErrorPage } = await import("@/app/error");
    render(
      <ErrorPage error={new Error("SQL: select * from carriers where ...")} unstable_retry={() => {}} />
    );

    expect(screen.getByRole("heading", { name: /something went wrong/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /try again/i })).toBeVisible();

    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/select \*/i);
    expect(body).not.toMatch(/drizzle/i);
    expect(body).not.toMatch(/DATABASE_URL/i);
    expect(body).not.toMatch(/C:\\|C:\//i);
  });

  it("degrades safely if a non-critical panel fails while the summary loads (VAL-EXEC-017)", async () => {
    render(
      <ExecutiveDashboard
        summary={fakeSummary()}
        runtime={{
          status: "error",
          message: "Runtime status is temporarily unavailable. The scorecard is still usable.",
        }}
      />
    );

    // Summary-driven surfaces should still render.
    expect(screen.getByRole("region", { name: /leadership kpis/i })).toBeVisible();
    expect(screen.getByText(/governance attention list/i)).toBeVisible();

    // Only the runtime posture panel should show a contained error.
    const runtimePanel = screen.getByText(/runtime posture/i).closest("section");
    expect(runtimePanel).toBeTruthy();
    expect(within(runtimePanel as HTMLElement).getByText(/unable to load runtime status/i)).toBeVisible();
  });

  it("keeps hero copy honest about demo posture and avoids production overclaims (VAL-EXEC-018)", async () => {
    render(<ExecutiveDashboard summary={fakeSummary()} runtime={{ status: "ready", data: fakeHealth() }} />);

    expect(screen.getByRole("region", { name: /leadership kpis/i })).toBeVisible();

    const pageText = document.body.textContent ?? "";
    expect(pageText).toMatch(/fictional/i);
    expect(pageText).toMatch(/mock ai/i);

    // Avoid unqualified production / live claims in the first screen copy.
    expect(pageText).not.toMatch(/real-time|production data|live carrier|live ai/i);
  });
});
