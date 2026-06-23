export const REDACTED = "[redacted]";

const BASE_SENSITIVE_KEY_PATTERN =
  /authorization|cookie|token|secret|password|passphrase|api[-_]?key|database[-_]?url|dsn/i;
const CONTACT_SENSITIVE_KEY_PATTERN =
  /authorization|cookie|token|secret|password|passphrase|api[-_]?key|database[-_]?url|dsn|email|phone|address/i;
const BASE_SENSITIVE_VALUE_PATTERNS = [
  /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?):\/\/[^\s"'`]+/gi,
  /\bBearer\s+[A-Za-z0-9._-]{12,}\b/gi,
  /\bsk-[A-Za-z0-9_-]{12,}\b/gi,
];
const CONTACT_SENSITIVE_VALUE_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\bhttps?:\/\/[^/\s"'`]+@[^/\s"'`]+/gi,
];

export type RedactionOptions = {
  includeContact?: boolean;
  maxArrayItems?: number;
  maxDepth?: number;
  maxStringLength?: number;
  sanitizeKeys?: boolean;
};

const defaultOptions = {
  includeContact: false,
  maxArrayItems: 20,
  maxDepth: 4,
  maxStringLength: Number.POSITIVE_INFINITY,
  sanitizeKeys: false,
} satisfies Required<RedactionOptions>;

function resolveOptions(options?: RedactionOptions): Required<RedactionOptions> {
  return { ...defaultOptions, ...(options ?? {}) };
}

function sensitiveKeyPattern(options: Required<RedactionOptions>) {
  return options.includeContact ? CONTACT_SENSITIVE_KEY_PATTERN : BASE_SENSITIVE_KEY_PATTERN;
}

function sensitiveValuePatterns(options: Required<RedactionOptions>) {
  return options.includeContact
    ? [...BASE_SENSITIVE_VALUE_PATTERNS, ...CONTACT_SENSITIVE_VALUE_PATTERNS]
    : BASE_SENSITIVE_VALUE_PATTERNS;
}

export function safeObjectKey(key: string): string {
  return /^[A-Za-z0-9_.:-]{1,80}$/.test(key) ? key : "unsafe_key";
}

export function redactString(value: string, options?: RedactionOptions): string {
  const resolved = resolveOptions(options);
  const redacted = sensitiveValuePatterns(resolved).reduce(
    (current, pattern) => current.replace(pattern, REDACTED),
    value,
  );
  return redacted.slice(0, resolved.maxStringLength);
}

function redactPrimitive(value: unknown, options: Required<RedactionOptions>): { done: true; value: unknown } | null {
  if (typeof value === "string") return { done: true, value: redactString(value, options) };
  if (value === null || typeof value === "number" || typeof value === "boolean") return { done: true, value };
  if (value instanceof Date) return { done: true, value: value.toISOString() };
  if (value === undefined) return { done: true, value: undefined };
  if (typeof value === "bigint") return { done: true, value: value.toString() };
  if (typeof value === "function" || typeof value === "symbol") return { done: true, value: "[unserializable]" };
  return null;
}

function redactArray(value: unknown[], key: string, depth: number, options: Required<RedactionOptions>): unknown[] {
  return value.slice(0, options.maxArrayItems).map((item) => redactUnknown(item, key, depth + 1, options));
}

function redactObject(value: Record<string, unknown>, depth: number, options: Required<RedactionOptions>) {
  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [
      options.sanitizeKeys ? safeObjectKey(entryKey) : entryKey,
      redactUnknown(entryValue, entryKey, depth + 1, options),
    ]),
  );
}

export function redactUnknown(value: unknown, key = "", depth = 0, options?: RedactionOptions): unknown {
  const resolved = resolveOptions(options);
  if (sensitiveKeyPattern(resolved).test(key)) return REDACTED;

  const primitive = redactPrimitive(value, resolved);
  if (primitive) return primitive.value;
  if (depth >= resolved.maxDepth) return "[max-depth]";
  if (Array.isArray(value)) return redactArray(value, "", depth, resolved);
  if (value && typeof value === "object") return redactObject(value as Record<string, unknown>, depth, resolved);
  return "[unknown]";
}
