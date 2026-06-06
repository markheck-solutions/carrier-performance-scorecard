import * as Sentry from "@sentry/nextjs";

import {
  applyPrivacyToSentryEvent,
  resolveSentryEnvironment,
  resolveSentryTracesSampleRate,
} from "@/lib/observability/sentry-context";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: resolveSentryEnvironment({
    sentryEnvironment: process.env.SENTRY_ENVIRONMENT,
    vercelEnvironment: process.env.VERCEL_ENV,
    nodeEnvironment: process.env.NODE_ENV,
  }),
  release: process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA,
  sendDefaultPii: false,
  tracesSampleRate: resolveSentryTracesSampleRate(process.env.NODE_ENV),
  beforeSend: applyPrivacyToSentryEvent,
});

Sentry.setTag("runtime", "edge");
