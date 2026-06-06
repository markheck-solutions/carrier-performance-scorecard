import * as Sentry from "@sentry/nextjs";

import {
  applyPrivacyToSentryEvent,
  buildSentryBreadcrumb,
  resolveSentryEnvironment,
  resolveSentryTracesSampleRate,
} from "@/lib/observability/sentry-context";
import { initializeBrowserSentryContext } from "@/lib/observability/sentry-client";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: resolveSentryEnvironment({
    sentryEnvironment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    vercelEnvironment: process.env.NEXT_PUBLIC_VERCEL_ENV,
    nodeEnvironment: process.env.NODE_ENV,
  }),
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  sendDefaultPii: false,
  tracesSampleRate: resolveSentryTracesSampleRate(process.env.NODE_ENV),
  beforeSend: applyPrivacyToSentryEvent,
});

if (dsn) {
  initializeBrowserSentryContext();
}

export function onRouterTransitionStart(url: string, navigationType: "push" | "replace" | "traverse") {
  Sentry.addBreadcrumb(
    buildSentryBreadcrumb({
      category: "navigation",
      message: "Route transition started",
      type: "navigation",
      data: { url, navigationType },
    }),
  );
  Sentry.captureRouterTransitionStart(url, navigationType);
}
