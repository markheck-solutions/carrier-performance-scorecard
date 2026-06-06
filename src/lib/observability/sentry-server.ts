import "server-only";

import * as Sentry from "@sentry/nextjs";

import { buildErrorInsight, type ErrorInsightInput } from "./error-insights";
import { buildSentryUserContext } from "./sentry-context";
import { createTraceContext, type TraceContext } from "./trace";

type CaptureServerErrorInput = Omit<ErrorInsightInput, "trace"> & {
  request?: Request;
  trace?: TraceContext | null;
};

function severityToSentryLevel(severity: ReturnType<typeof buildErrorInsight>["severity"]) {
  if (severity === "high") return "error";
  if (severity === "medium") return "warning";
  return "info";
}

function anonymousIdFromRequest(request: Request | undefined): string | null {
  const value = request?.headers.get("x-cps-anonymous-id");
  return value && /^[A-Za-z0-9_.:-]{8,128}$/.test(value) ? value : null;
}

export function captureServerError(error: unknown, input: CaptureServerErrorInput) {
  const trace = input.trace ?? (input.request ? createTraceContext(input.request.headers) : null);
  const insight = buildErrorInsight(error, { ...input, trace });

  Sentry.withScope((scope) => {
    scope.setLevel(severityToSentryLevel(insight.severity));
    scope.setFingerprint([insight.fingerprint]);
    scope.setTag("operation", insight.operation);
    scope.setTag("error.category", insight.category);
    if (insight.route) scope.setTag("route", insight.route);
    if (insight.trace) {
      scope.setTag("trace_id", insight.trace.traceId);
      scope.setTag("request_id", insight.trace.requestId);
    }
    scope.setContext("error_insight", insight);
    scope.setUser(buildSentryUserContext({ anonymousId: anonymousIdFromRequest(input.request), segment: "api" }));
    Sentry.captureException(error instanceof Error ? error : new Error(insight.message));
  });

  return insight;
}
