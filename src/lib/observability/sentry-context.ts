export type SentryUserContextInput = {
  anonymousId?: string | null;
  sessionId?: string | null;
  segment?: string | null;
};

export type SentryBreadcrumbInput = {
  category: string;
  message: string;
  level?: "fatal" | "error" | "warning" | "log" | "info" | "debug";
  type?: "default" | "debug" | "error" | "info" | "navigation" | "http" | "query" | "ui" | "user";
  data?: Record<string, unknown>;
};

type SentryEventLike = {
  extra?: unknown;
  contexts?: unknown;
  tags?: unknown;
  user?: unknown;
  request?: unknown;
  breadcrumbs?: unknown;
};

const REDACTED = "[redacted]";
const MAX_DEPTH = 4;
const MAX_ARRAY_ITEMS = 20;
const MAX_STRING_LENGTH = 240;
const ANONYMOUS_STORAGE_NAME = "cps-sentry-anonymous-id";
const SENSITIVE_KEY_PATTERN =
  /authorization|cookie|token|secret|password|passphrase|api[-_]?key|database[-_]?url|dsn|email|phone|address/i;
const SENSITIVE_VALUE_PATTERNS = [
  /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?):\/\/[^\s"'`]+/gi,
  /\bBearer\s+[A-Za-z0-9._-]{12,}\b/gi,
  /\bsk-[A-Za-z0-9_-]{12,}\b/gi,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\bhttps?:\/\/[^/\s"'`]+@[^/\s"'`]+/gi,
];

function sanitizeString(value: string): string {
  return SENSITIVE_VALUE_PATTERNS.reduce((current, pattern) => current.replace(pattern, REDACTED), value).slice(
    0,
    MAX_STRING_LENGTH,
  );
}

function sanitizeKey(key: string): string {
  return /^[A-Za-z0-9_.:-]{1,80}$/.test(key) ? key : "unsafe_key";
}

function sanitizeUnknown(value: unknown, key = "", depth = 0): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) return REDACTED;
  if (typeof value === "string") return sanitizeString(value);
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) return "[max-depth]";
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeUnknown(item, "", depth + 1));
  }
  if (value && typeof value === "object") {
    if (depth >= MAX_DEPTH) return "[max-depth]";
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        sanitizeKey(entryKey),
        sanitizeUnknown(entryValue, entryKey, depth + 1),
      ]),
    );
  }
  return value === undefined ? undefined : "[unserializable]";
}

function stableBucket(value: string | null | undefined): string {
  const source = value && value.trim().length > 0 ? value.trim() : "anonymous";
  let hash = 0x811c9dc5;
  for (const char of source) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function safeSegment(value: string | null | undefined): string {
  if (!value) return "public-demo";
  return /^[A-Za-z0-9_.:-]{1,40}$/.test(value) ? value : "public-demo";
}

export function sanitizeForSentry(value: unknown): unknown {
  return sanitizeUnknown(value);
}

export function applyPrivacyToSentryEvent<T extends SentryEventLike>(event: T): T {
  return {
    ...event,
    extra: sanitizeUnknown(event.extra ?? {}) as Record<string, unknown>,
    contexts: sanitizeUnknown(event.contexts ?? {}) as Record<string, unknown>,
    tags: sanitizeUnknown(event.tags ?? {}) as Record<string, unknown>,
    user: sanitizeUnknown(event.user ?? {}) as Record<string, unknown>,
    request: sanitizeUnknown(event.request ?? {}) as Record<string, unknown>,
    breadcrumbs: Array.isArray(event.breadcrumbs)
      ? (sanitizeUnknown(event.breadcrumbs) as Array<Record<string, unknown>>)
      : event.breadcrumbs,
  };
}

export function buildSentryUserContext(input: SentryUserContextInput = {}) {
  const anonymousBucket = stableBucket(input.anonymousId);
  const sessionBucket = stableBucket(input.sessionId);

  return {
    id: `anon:${anonymousBucket}`,
    segment: safeSegment(input.segment),
    anonymousBucket,
    sessionBucket,
  };
}

export function buildSentryBreadcrumb(input: SentryBreadcrumbInput) {
  return {
    category: sanitizeString(input.category).slice(0, 80),
    message: sanitizeString(input.message).slice(0, 160),
    level: input.level ?? "info",
    type: input.type ?? "default",
    data: sanitizeUnknown(input.data ?? {}) as Record<string, unknown>,
  };
}

export function getOrCreateBrowserAnonymousId(storage: Pick<Storage, "getItem" | "setItem"> | null = null): string {
  const store = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  let existing: string | null = null;
  try {
    existing = store?.getItem(ANONYMOUS_STORAGE_NAME) ?? null;
  } catch {
    existing = null;
  }
  if (existing && /^[A-Za-z0-9_.:-]{8,128}$/.test(existing)) return existing;

  const generated =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  try {
    store?.setItem(ANONYMOUS_STORAGE_NAME, generated);
  } catch {
    // Storage can be disabled by browser privacy settings. The generated value still scopes this page load.
  }

  return generated;
}

export function resolveSentryEnvironment(input: {
  sentryEnvironment?: string | null;
  vercelEnvironment?: string | null;
  nodeEnvironment?: string | null;
}): string {
  return input.sentryEnvironment ?? input.vercelEnvironment ?? input.nodeEnvironment ?? "development";
}

export function resolveSentryTracesSampleRate(nodeEnvironment: string | undefined): number {
  return nodeEnvironment === "production" ? 0.1 : 1.0;
}
