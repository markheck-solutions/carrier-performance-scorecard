import { redactString, redactUnknown } from "./redaction";

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
  message?: unknown;
  extra?: unknown;
  contexts?: unknown;
  tags?: unknown;
  user?: unknown;
  request?: unknown;
  exception?: unknown;
  logentry?: unknown;
  breadcrumbs?: unknown;
};

const MAX_STRING_LENGTH = 240;
const ANONYMOUS_STORAGE_NAME = "cps-sentry-anonymous-id";
const sentryRedaction = { includeContact: true, maxArrayItems: 20, maxDepth: 4, maxStringLength: MAX_STRING_LENGTH };

function sanitizeString(value: string): string {
  return redactString(value, sentryRedaction);
}

function sanitizeUnknown(value: unknown, key = "", depth = 0): unknown {
  return redactUnknown(value, key, depth, { ...sentryRedaction, sanitizeKeys: true });
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
    message: typeof event.message === "string" ? sanitizeString(event.message) : event.message,
    extra: sanitizeUnknown(event.extra ?? {}) as Record<string, unknown>,
    contexts: sanitizeUnknown(event.contexts ?? {}) as Record<string, unknown>,
    tags: sanitizeUnknown(event.tags ?? {}) as Record<string, unknown>,
    user: sanitizeUnknown(event.user ?? {}) as Record<string, unknown>,
    request: sanitizeUnknown(event.request ?? {}) as Record<string, unknown>,
    exception: sanitizeUnknown(event.exception ?? {}) as Record<string, unknown>,
    logentry: sanitizeUnknown(event.logentry ?? {}) as Record<string, unknown>,
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
