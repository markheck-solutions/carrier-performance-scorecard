import { describe, expect, it } from "vitest";

import {
  applyPrivacyToSentryEvent,
  buildSentryBreadcrumb,
  buildSentryUserContext,
  getOrCreateBrowserAnonymousId,
  resolveSentryEnvironment,
  resolveSentryTracesSampleRate,
} from "@/lib/observability/sentry-context";

describe("Sentry contextualization", () => {
  it("redacts sensitive event data before Sentry receives it", () => {
    const rawBearerLog = ["Bearer", "token-value-should-not-leak"].join(" ");
    const event = applyPrivacyToSentryEvent({
      extra: {
        carrierId: "demo-carrier",
        token: "test-token-should-not-leak",
        nested: { databaseUrl: "DATABASE_URL_PLACEHOLDER" },
      },
      request: {
        url: "https://public@example.ingest.sentry.io/123",
        headers: { authorization: "Bearer short" },
      },
      user: {
        id: "anon-safe",
        email: "person@example.com",
      },
      message: "Provider timeout for person@example.com",
      exception: {
        values: [{ type: "Error", value: "Provider timeout for person@example.com" }],
      },
      logentry: {
        message: rawBearerLog,
      },
    });

    expect(event.extra).toMatchObject({
      carrierId: "demo-carrier",
      token: "[redacted]",
      nested: { databaseUrl: "[redacted]" },
    });
    expect(event.request).toMatchObject({
      url: "https://[redacted]/123",
      headers: { authorization: "[redacted]" },
    });
    expect(event.user).toMatchObject({
      id: "anon-safe",
      email: "[redacted]",
    });
    expect(event.message).toBe("Provider timeout for [redacted]");
    expect(event.exception).toMatchObject({
      values: [{ type: "Error", value: "Provider timeout for [redacted]" }],
    });
    expect(event.logentry).toMatchObject({
      message: "[redacted]",
    });
  });

  it("builds pseudonymous user context instead of sending raw identifiers", () => {
    const user = buildSentryUserContext({
      anonymousId: "session-user@example.com",
      sessionId: "request-session-1",
      segment: "api",
    });

    expect(user.id).toMatch(/^anon:[0-9a-f]{8}$/);
    expect(user.id).not.toContain("example.com");
    expect(user.segment).toBe("api");
    expect(user.sessionBucket).toMatch(/^[0-9a-f]{8}$/);
  });

  it("sanitizes breadcrumbs while preserving useful debugging context", () => {
    const breadcrumb = buildSentryBreadcrumb({
      category: "qbr.brief",
      message: "Generated provider response",
      data: {
        carrierShortCode: "ACME",
        apiKey: "test-key-should-not-leak",
      },
    });

    expect(breadcrumb).toMatchObject({
      category: "qbr.brief",
      message: "Generated provider response",
      data: {
        carrierShortCode: "ACME",
        apiKey: "[redacted]",
      },
    });
  });

  it("creates durable browser anonymous IDs for user context", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    };

    const first = getOrCreateBrowserAnonymousId(storage);
    const second = getOrCreateBrowserAnonymousId(storage);

    expect(first).toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_.:-]{8,128}$/);
  });

  it("resolves environment and sampling settings explicitly", () => {
    expect(resolveSentryEnvironment({ sentryEnvironment: null, vercelEnvironment: "preview" })).toBe("preview");
    expect(resolveSentryTracesSampleRate("production")).toBe(0.1);
    expect(resolveSentryTracesSampleRate("test")).toBe(1.0);
  });
});
