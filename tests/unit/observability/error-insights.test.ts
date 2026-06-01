import { describe, expect, it } from "vitest";

import { buildErrorInsight } from "@/lib/observability/error-insights";
import { createTraceContext } from "@/lib/observability/trace";

describe("error insights", () => {
  it("builds stable contextual insight without leaking sensitive context", () => {
    const trace = createTraceContext(
      { "x-request-id": "req-12345678", traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" },
      new Date("2026-01-01T00:00:00.000Z"),
    );

    const insight = buildErrorInsight(new Error("Provider rejected sk-test-redacts"), {
      operation: "generate-qbr-brief",
      route: "/api/qbr/brief",
      trace,
      context: {
        carrierId: "demo-carrier",
        token: "sk-test-redacts",
      },
      now: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(insight).toMatchObject({
      category: "dependency",
      severity: "medium",
      message: "Provider rejected [redacted]",
      operation: "generate-qbr-brief",
      route: "/api/qbr/brief",
      trace: {
        requestId: "req-12345678",
        traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      },
      context: {
        carrierId: "demo-carrier",
        token: "[redacted]",
      },
      timestamp: "2026-01-01T00:00:00.000Z",
    });
    expect(insight.fingerprint).toMatch(/^[0-9a-f]{16}$/);
  });

  it("classifies invalid input as low severity validation insight", () => {
    const insight = buildErrorInsight(new Error("Invalid request body."), {
      operation: "parse-qbr-request",
      now: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(insight.category).toBe("validation");
    expect(insight.severity).toBe("low");
  });
});
