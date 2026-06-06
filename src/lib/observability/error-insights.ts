import { createHash } from "node:crypto";

import type { TraceContext } from "./trace";
import { summarizeTrace } from "./trace";

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

const REDACTED = "[redacted]";
const SENSITIVE_KEY_PATTERN = /authorization|cookie|token|secret|password|passphrase|api[-_]?key|database[-_]?url|dsn/i;
const SENSITIVE_VALUE_PATTERNS = [
  /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?):\/\/[^\s"'`]+/gi,
  /\bBearer\s+[A-Za-z0-9._-]{12,}\b/gi,
  /\bsk-[A-Za-z0-9_-]{12,}\b/gi,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\bhttps?:\/\/[^/\s"'`]+@[^/\s"'`]+/gi,
];

function redactString(value: string): string {
  return SENSITIVE_VALUE_PATTERNS.reduce((current, pattern) => current.replace(pattern, REDACTED), value).slice(0, 240);
}

function redactUnknown(value: unknown, key = "", depth = 0): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) return REDACTED;
  if (typeof value === "string") return redactString(value);
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value))
    return depth >= 3 ? "[max-depth]" : value.slice(0, 10).map((item) => redactUnknown(item, "", depth + 1));
  if (value && typeof value === "object") {
    if (depth >= 3) return "[max-depth]";
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        redactUnknown(entryValue, entryKey, depth + 1),
      ]),
    );
  }
  return value === undefined ? undefined : "[unserializable]";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return redactString(error.message);
  return redactString(String(error));
}

function classifyError(error: unknown, message: string): ErrorInsight["category"] {
  const name = error instanceof Error ? error.name.toLowerCase() : "";
  const text = message.toLowerCase();
  if (name.includes("invalid") || text.includes("invalid") || text.includes("malformed")) return "validation";
  if (text.includes("not configured") || text.includes("configuration")) return "configuration";
  if (text.includes("timeout") || name.includes("timeout")) return "timeout";
  if (text.includes("database") || text.includes("connection") || text.includes("provider")) return "dependency";
  return "unknown";
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
    context: redactUnknown(input.context ?? {}) as Record<string, unknown>,
    timestamp: (input.now ?? new Date()).toISOString(),
  };
}
