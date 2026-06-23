import { createHash } from "node:crypto";

import type { TraceContext } from "./trace";
import { summarizeTrace } from "./trace";
import { redactString, redactUnknown } from "./redaction";

export type ErrorSeverity = "low" | "medium" | "high";

export type ErrorInsight = {
  fingerprint: string;
  category: "validation" | "configuration" | "dependency" | "timeout" | "unknown";
  severity: ErrorSeverity;
  message: string;
  operation: string;
  route: string | null;
  trace: ReturnType<typeof summarizeTrace> | null;
  context: Record<string, unknown>;
  timestamp: string;
};

export type ErrorInsightInput = {
  operation: string;
  route?: string | null;
  severity?: ErrorSeverity;
  trace?: TraceContext | null;
  context?: Record<string, unknown>;
  now?: Date;
};

const errorRedaction = { includeContact: true, maxArrayItems: 10, maxDepth: 3, maxStringLength: 240 };

function errorMessage(error: unknown): string {
  if (error instanceof Error) return redactString(error.message, errorRedaction);
  return redactString(String(error), errorRedaction);
}

const errorClassificationRules: Array<{ category: ErrorInsight["category"]; pattern: RegExp }> = [
  { category: "validation", pattern: /\b(invalid|malformed)\b/ },
  { category: "configuration", pattern: /\b(configuration|not configured)\b/ },
  { category: "timeout", pattern: /\btimeout\b/ },
  { category: "dependency", pattern: /\b(database|connection|provider)\b/ },
];

function classifyError(error: unknown, message: string): ErrorInsight["category"] {
  const name = error instanceof Error ? error.name.toLowerCase() : "";
  const text = `${name} ${message.toLowerCase()}`;
  return errorClassificationRules.find((rule) => rule.pattern.test(text))?.category ?? "unknown";
}

function fingerprintFor(category: string, operation: string, message: string): string {
  return createHash("sha256").update(`${category}:${operation}:${message}`).digest("hex").slice(0, 16);
}

export function buildErrorInsight(error: unknown, input: ErrorInsightInput): ErrorInsight {
  const message = errorMessage(error);
  const category = classifyError(error, message);

  return {
    fingerprint: fingerprintFor(category, input.operation, message),
    category,
    severity: input.severity ?? (category === "validation" ? "low" : "medium"),
    message,
    operation: input.operation,
    route: input.route ?? null,
    trace: input.trace ? summarizeTrace(input.trace) : null,
    context: redactUnknown(input.context ?? {}, "", 0, errorRedaction) as Record<string, unknown>,
    timestamp: (input.now ?? new Date()).toISOString(),
  };
}
