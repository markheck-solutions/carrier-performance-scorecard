import { beforeEach, describe, expect, it, vi } from "vitest";

const sentryMocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  setContext: vi.fn(),
  setFingerprint: vi.fn(),
  setLevel: vi.fn(),
  setTag: vi.fn(),
  setUser: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: sentryMocks.captureException,
  withScope: (callback: (scope: unknown) => void) =>
    callback({
      setContext: sentryMocks.setContext,
      setFingerprint: sentryMocks.setFingerprint,
      setLevel: sentryMocks.setLevel,
      setTag: sentryMocks.setTag,
      setUser: sentryMocks.setUser,
    }),
}));

import { captureServerError } from "@/lib/observability/sentry-server";

describe("Sentry server capture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("captures server errors with route, trace, fingerprint, and pseudonymous user context", () => {
    const request = new Request("https://example.test/api/qbr/brief", {
      headers: {
        "x-cps-anonymous-id": "browser-session-1234",
        "x-request-id": "req-12345678",
        traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      },
    });

    const insight = captureServerError(new Error("Provider timeout for person@example.com"), {
      operation: "generate-qbr-brief",
      route: "/api/qbr/brief",
      request,
      context: { token: "test-token-should-not-leak" },
      now: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(insight).toMatchObject({
      category: "timeout",
      route: "/api/qbr/brief",
      operation: "generate-qbr-brief",
      message: "Provider timeout for [redacted]",
      trace: {
        requestId: "req-12345678",
        traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      },
      context: { token: "[redacted]" },
    });
    expect(sentryMocks.setFingerprint).toHaveBeenCalledWith([insight.fingerprint]);
    expect(sentryMocks.setTag).toHaveBeenCalledWith("operation", "generate-qbr-brief");
    expect(sentryMocks.setTag).toHaveBeenCalledWith("route", "/api/qbr/brief");
    expect(sentryMocks.setUser).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(/^anon:[0-9a-f]{8}$/),
        segment: "api",
      }),
    );
    expect(sentryMocks.captureException).toHaveBeenCalledWith(expect.any(Error));
  });
});
