import { NextRequest, NextResponse } from "next/server";

import { getServerDb } from "@/lib/db/server-db";
import { parseScoreFiltersFromUrl } from "@/lib/scoring/filter-parse";
import { isInvalidFilterError } from "@/lib/scoring/invalid-filter";
import { readEvidence } from "@/lib/scoring/read-models";
import { captureServerError } from "@/lib/observability/sentry-server";

export const runtime = "nodejs";

class InvalidEvidenceIdsError extends Error {
  readonly code = "INVALID_EVIDENCE_IDS" as const;
  readonly status = 400 as const;
  constructor() {
    super("Malformed evidenceIds parameter.");
    this.name = "InvalidEvidenceIdsError";
  }
}

function isInvalidEvidenceIdsError(error: unknown): error is InvalidEvidenceIdsError {
  return error instanceof InvalidEvidenceIdsError;
}

function isUuid(value: string) {
  // Strict RFC4122 UUID with version and variant bits, case-insensitive.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseEvidenceIds(url: URL) {
  const raw = url.searchParams.get("evidenceIds");
  if (!raw) return null;
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (ids.length === 0) return null;
  // De-duplicate while preserving the first-seen order (stable).
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const id of ids) {
    if (!isUuid(id)) throw new InvalidEvidenceIdsError();
    if (seen.has(id)) continue;
    seen.add(id);
    deduped.push(id);
  }
  return deduped.length > 0 ? deduped : null;
}

function parseCap(url: URL) {
  const raw = url.searchParams.get("cap");
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const cap = Math.floor(n);
  return cap > 0 ? cap : null;
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const filters = parseScoreFiltersFromUrl(url);
    const dimension = url.searchParams.get("dimension");
    const delayReason = url.searchParams.get("delayReason");
    const evidenceIds = parseEvidenceIds(url);
    const cap = parseCap(url);
    const { db } = getServerDb();

    const model = await readEvidence(db, { ...filters, dimension, delayReason, evidenceIds, cap });
    return NextResponse.json(model);
  } catch (error: unknown) {
    if (isInvalidFilterError(error)) {
      return NextResponse.json(
        { ok: false, error: { code: error.code, message: error.message, details: error.details } },
        { status: error.status },
      );
    }
    if (isInvalidEvidenceIdsError(error)) {
      return NextResponse.json(
        { ok: false, error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    captureServerError(error, { operation: "read-evidence", route: "/api/evidence", request });
    return NextResponse.json({ ok: false, error: { message: "Unable to load evidence right now." } }, { status: 500 });
  }
}

export function POST() {
  return NextResponse.json({ ok: false, error: { message: "Method not allowed." } }, { status: 405 });
}

export function PUT() {
  return NextResponse.json({ ok: false, error: { message: "Method not allowed." } }, { status: 405 });
}

export function PATCH() {
  return NextResponse.json({ ok: false, error: { message: "Method not allowed." } }, { status: 405 });
}

export function DELETE() {
  return NextResponse.json({ ok: false, error: { message: "Method not allowed." } }, { status: 405 });
}
