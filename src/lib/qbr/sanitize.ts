import "server-only";

import type { QbrBriefSections } from "./public";

const EM_DASH_RE = /[\u2014\u2015\u2013]/g;
const HTML_TAG_RE = /<\/?[^>]+>/g;

function normalizeWhitespace(text: string) {
  return text.replaceAll(/\s+/g, " ").trim();
}

function stripMarkup(text: string) {
  // Keep it simple and safe: remove any HTML tags.
  return text.replaceAll(HTML_TAG_RE, "");
}

function redactSecretLooking(text: string) {
  // Prevent accidental leakage of key-like strings in public demo output.
  // This is intentionally conservative and does not attempt to validate real keys.
  return text
    .replaceAll(/\bsk-[A-Za-z0-9_-]{10,}\b/g, "[redacted]")
    .replaceAll(/\bBearer\s+[A-Za-z0-9._-]{10,}\b/gi, "Bearer [redacted]");
}

function sanitizeText(text: string) {
  const stripped = stripMarkup(text).replaceAll(EM_DASH_RE, "-");
  return normalizeWhitespace(redactSecretLooking(stripped));
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const s = sanitizeText(item);
    if (s.length === 0) continue;
    out.push(s.length > 240 ? `${s.slice(0, 237)}...` : s);
  }
  return out;
}

export function coerceBriefSections(value: unknown): QbrBriefSections | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  // Fail closed if provider returns unexpected top-level keys. This prevents extra sections
  // from surfacing without an explicit allowlist change.
  const allowedKeys = ["strengths", "concerns", "questions", "governanceActions"];
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.includes(key)) return null;
  }
  const strengths = asStringArray(obj.strengths);
  const concerns = asStringArray(obj.concerns);
  const questions = asStringArray(obj.questions);
  const governanceActions = asStringArray(obj.governanceActions);
  if (!strengths || !concerns || !questions || !governanceActions) return null;
  if (strengths.length === 0 || concerns.length === 0 || questions.length === 0 || governanceActions.length === 0) return null;
  return { strengths, concerns, questions, governanceActions };
}

export function extractJsonFromText(raw: string): unknown | null {
  const cleaned = sanitizeText(raw);
  // Try direct parse first.
  try {
    return JSON.parse(cleaned) as unknown;
  } catch {
    // Continue.
  }

  // Then try to extract the first JSON object block.
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first < 0 || last < 0 || last <= first) return null;
  const slice = cleaned.slice(first, last + 1);
  try {
    return JSON.parse(slice) as unknown;
  } catch {
    return null;
  }
}
