import "server-only";

import type { QbrBriefSections } from "./public";

const EM_DASH_RE = /[\u2014\u2015\u2013]/g;
const SECTION_KEYS = ["strengths", "concerns", "questions", "governanceActions"] as const;

function normalizeWhitespace(text: string) {
  return text.replaceAll(/\s+/g, " ").trim();
}

function removeHtmlControlChars(text: string) {
  return text.replaceAll("<", "").replaceAll(">", "");
}

function redactSecretLooking(text: string) {
  // Prevent accidental leakage of key-like strings in public demo output.
  // This is intentionally conservative and does not attempt to validate real keys.
  return text
    .replaceAll(/\bsk-[A-Za-z0-9_-]{10,}\b/g, "[redacted]")
    .replaceAll(/\bBearer\s+[A-Za-z0-9._-]{10,}\b/gi, "Bearer [redacted]");
}

function sanitizeText(text: string) {
  const stripped = removeHtmlControlChars(text).replaceAll(EM_DASH_RE, "-");
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

function hasOnlyAllowedSectionKeys(obj: Record<string, unknown>) {
  return Object.keys(obj).every((key) => (SECTION_KEYS as readonly string[]).includes(key));
}

function readSections(obj: Record<string, unknown>): QbrBriefSections | null {
  const sections = {
    strengths: asStringArray(obj.strengths),
    concerns: asStringArray(obj.concerns),
    questions: asStringArray(obj.questions),
    governanceActions: asStringArray(obj.governanceActions),
  };
  return Object.values(sections).every((items) => items && items.length > 0) ? (sections as QbrBriefSections) : null;
}

export function coerceBriefSections(value: unknown): QbrBriefSections | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  // Fail closed if provider returns unexpected top-level keys. This prevents extra sections
  // from surfacing without an explicit allowlist change.
  return hasOnlyAllowedSectionKeys(obj) ? readSections(obj) : null;
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
