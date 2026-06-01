import { describe, expect, it } from "vitest";

import { createTraceContext, isSafeRequestId, parseTraceparent, traceResponseHeaders } from "@/lib/observability/trace";

describe("trace context", () => {
  it("accepts safe request IDs and W3C traceparent values", () => {
    const trace = createTraceContext(
      {
        "x-request-id": "req-12345678",
        traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      },
      new Date("2026-01-01T00:00:00.000Z"),
    );

    expect(trace).toEqual({
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      requestId: "req-12345678",
      parentTraceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      sampled: true,
      startedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(traceResponseHeaders(trace)).toEqual({
      "x-request-id": "req-12345678",
      "x-trace-id": "4bf92f3577b34da6a3ce929d0e0e4736",
    });
  });

  it("rejects unsafe IDs and falls back to generated values", () => {
    const trace = createTraceContext({ "x-request-id": "bad id with spaces" });

    expect(isSafeRequestId("bad id with spaces")).toBe(false);
    expect(trace.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(trace.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(parseTraceparent("bad")).toBeNull();
  });
});
