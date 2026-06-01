import "server-only";

export type ServerLogLevel = "info" | "warn" | "error";
export type ServerLogContext = Record<string, unknown>;

const REDACTED = "[redacted]";
const MAX_DEPTH = 4;
const MAX_ARRAY_ITEMS = 20;
const SENSITIVE_KEY_PATTERN = /authorization|cookie|token|secret|password|passphrase|api[-_]?key|database[-_]?url|dsn/i;

const SENSITIVE_VALUE_PATTERNS = [
  /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?):\/\/[^\s"'`]+/gi,
  /\bBearer\s+[A-Za-z0-9._-]{12,}\b/gi,
  /\bsk-[A-Za-z0-9_-]{12,}\b/gi,
];

function redactString(value: string): string {
  return SENSITIVE_VALUE_PATTERNS.reduce((current, pattern) => current.replace(pattern, REDACTED), value);
}

function redactUnknown(value: unknown, key: string, depth: number): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) return REDACTED;

  if (typeof value === "string") return redactString(value);
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (value === undefined) return undefined;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return "[unserializable]";
  if (depth >= MAX_DEPTH) return "[max-depth]";

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => redactUnknown(item, "", depth + 1));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        redactUnknown(entryValue, entryKey, depth + 1),
      ]),
    );
  }

  return "[unknown]";
}

export function redactLogValue(value: unknown, key = ""): unknown {
  return redactUnknown(value, key, 0);
}

export function buildSafeLogEvent(level: ServerLogLevel, event: string, context: ServerLogContext = {}) {
  return {
    level,
    event: redactString(event).slice(0, 160),
    context: redactLogValue(context) as ServerLogContext,
    timestamp: new Date().toISOString(),
  };
}

export function writeServerLog(level: ServerLogLevel, event: string, context: ServerLogContext = {}): void {
  const line = JSON.stringify(buildSafeLogEvent(level, event, context));
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.info(line);
}
