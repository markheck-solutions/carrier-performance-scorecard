"use client";

import * as Sentry from "@sentry/nextjs";

import {
  buildSentryBreadcrumb,
  buildSentryUserContext,
  getOrCreateBrowserAnonymousId,
  type SentryBreadcrumbInput,
} from "./sentry-context";

export function initializeBrowserSentryContext() {
  const anonymousId = getOrCreateBrowserAnonymousId();
  Sentry.setUser(buildSentryUserContext({ anonymousId, segment: "browser" }));
  Sentry.addBreadcrumb(
    buildSentryBreadcrumb({
      category: "app.lifecycle",
      message: "Browser Sentry context initialized",
      type: "info",
      data: { hasAnonymousId: Boolean(anonymousId) },
    }),
  );
  return anonymousId;
}

export function sentryRequestHeaders(): HeadersInit {
  return {
    "x-cps-anonymous-id": getOrCreateBrowserAnonymousId(),
  };
}

export function addSentryBreadcrumb(input: SentryBreadcrumbInput) {
  Sentry.addBreadcrumb(buildSentryBreadcrumb(input));
}

export function captureClientError(
  error: unknown,
  input: {
    operation: string;
    route?: string;
    context?: Record<string, unknown>;
  },
) {
  Sentry.withScope((scope) => {
    scope.setTag("operation", input.operation);
    if (input.route) scope.setTag("route", input.route);
    scope.setContext("client_context", input.context ?? {});
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
  });
}
