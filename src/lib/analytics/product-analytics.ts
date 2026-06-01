import { createHash } from "node:crypto";

import type { TraceContext } from "@/lib/observability/trace";
import { summarizeTrace } from "@/lib/observability/trace";

export type ProductAnalyticsEventName =
  | "dashboard_viewed"
  | "filter_changed"
  | "scorecard_opened"
  | "qbr_brief_requested";

export type ProductAnalyticsInput = {
  event: ProductAnalyticsEventName;
  anonymousId?: string | null;
  sessionId?: string | null;
  properties?: Record<string, unknown>;
  trace?: TraceContext | null;
  now?: Date;
};

export type ProductAnalyticsEvent = {
  event: ProductAnalyticsEventName;
  anonymousBucket: string;
  sessionBucket: string;
  properties: Record<string, string | number | boolean | null>;
  trace: ReturnType<typeof summarizeTrace> | null;
  timestamp: string;
};

const SENSITIVE_KEY_PATTERN = /email|phone|name|address|authorization|cookie|token|secret|password|api[-_]?key|dsn/i;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const SAFE_PROPERTY_PATTERN = /^[A-Za-z0-9_.:-]{1,80}$/;

function bucket(value: string | null | undefined): string {
  const source = value && value.trim().length > 0 ? value.trim() : "anonymous";
  return createHash("sha256").update(source).digest("hex").slice(0, 12);
}

function sanitizeProperties(
  properties: Record<string, unknown> = {},
): Record<string, string | number | boolean | null> {
  const safe: Record<string, string | number | boolean | null> = {};

  for (const [key, value] of Object.entries(properties)) {
    if (!SAFE_PROPERTY_PATTERN.test(key)) continue;
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      safe[key] = "[redacted]";
      continue;
    }
    if (typeof value === "string") {
      safe[key] = EMAIL_PATTERN.test(value) ? "[redacted]" : value.slice(0, 120);
      continue;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      safe[key] = value;
      continue;
    }
    if (typeof value === "boolean" || value === null) {
      safe[key] = value;
    }
  }

  return safe;
}

export function buildProductAnalyticsEvent(input: ProductAnalyticsInput): ProductAnalyticsEvent {
  return {
    event: input.event,
    anonymousBucket: bucket(input.anonymousId),
    sessionBucket: bucket(input.sessionId),
    properties: sanitizeProperties(input.properties),
    trace: input.trace ? summarizeTrace(input.trace) : null,
    timestamp: (input.now ?? new Date()).toISOString(),
  };
}
