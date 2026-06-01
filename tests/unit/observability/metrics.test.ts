import { beforeEach, describe, expect, it } from "vitest";

import { incrementMetric, observeMetric, resetMetricsForTests, snapshotMetrics } from "@/lib/observability/metrics";

describe("metrics registry", () => {
  beforeEach(() => {
    resetMetricsForTests();
  });

  it("records counters and histograms as aggregate values", () => {
    incrementMetric("http requests total", { route: "/api/metrics", status: 200 });
    incrementMetric("http requests total", { route: "/api/metrics", status: 200 }, 2);
    observeMetric("request_duration_ms", 12, { route: "/api/metrics" });
    observeMetric("request_duration_ms", 20, { route: "/api/metrics" });

    const snapshot = snapshotMetrics(new Date("2026-01-01T00:00:00.000Z"));

    expect(snapshot.generatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(snapshot.counters).toEqual([
      {
        type: "counter",
        name: "http_requests_total",
        labels: { route: "/api/metrics", status: "200" },
        value: 3,
      },
    ]);
    expect(snapshot.histograms).toEqual([
      {
        type: "histogram",
        name: "request_duration_ms",
        labels: { route: "/api/metrics" },
        count: 2,
        sum: 32,
        min: 12,
        max: 20,
      },
    ]);
  });

  it("redacts sensitive metric labels", () => {
    incrementMetric("provider_error_total", {
      apiKey: "sk-test-redacts",
      dsn: "configured",
      route: "/api/qbr/brief",
    });

    expect(snapshotMetrics().counters[0]?.labels).toEqual({
      apiKey: "[redacted]",
      dsn: "[redacted]",
      route: "/api/qbr/brief",
    });
  });
});
