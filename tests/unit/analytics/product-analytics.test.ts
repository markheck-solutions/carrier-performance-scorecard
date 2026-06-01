import { describe, expect, it } from "vitest";

import { buildProductAnalyticsEvent } from "@/lib/analytics/product-analytics";
import { createTraceContext } from "@/lib/observability/trace";

describe("product analytics event builder", () => {
  it("buckets identifiers and keeps only privacy-safe properties", () => {
    const trace = createTraceContext(
      { "x-request-id": "req-12345678", traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" },
      new Date("2026-01-01T00:00:00.000Z"),
    );

    const event = buildProductAnalyticsEvent({
      event: "filter_changed",
      anonymousId: "reviewer-1",
      sessionId: "session-1",
      trace,
      properties: {
        region: "Northeast",
        carrierCount: 6,
        email: "reviewer@example.com",
        unsafe_nested: { ignored: true },
      },
      now: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(event.event).toBe("filter_changed");
    expect(event.anonymousBucket).toMatch(/^[0-9a-f]{12}$/);
    expect(event.sessionBucket).toMatch(/^[0-9a-f]{12}$/);
    expect(event.properties).toEqual({
      region: "Northeast",
      carrierCount: 6,
      email: "[redacted]",
    });
    expect(event.trace?.requestId).toBe("req-12345678");
    expect(event.timestamp).toBe("2026-01-01T00:00:00.000Z");
  });
});
