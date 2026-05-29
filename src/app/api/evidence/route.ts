import { NextRequest, NextResponse } from "next/server";

import { getServerDb } from "@/lib/db/server-db";
import { parseScoreFiltersFromUrl } from "@/lib/scoring/filter-parse";
import { readEvidence } from "@/lib/scoring/read-models";

export const runtime = "nodejs";

function parseEvidenceIds(url: URL) {
  const raw = url.searchParams.get("evidenceIds");
  if (!raw) return null;
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return ids.length > 0 ? ids : null;
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const filters = parseScoreFiltersFromUrl(url);
    const dimension = url.searchParams.get("dimension");
    const evidenceIds = parseEvidenceIds(url);
    const { db } = getServerDb();

    const model = await readEvidence(db, { ...filters, dimension, evidenceIds });
    return NextResponse.json(model);
  } catch {
    return NextResponse.json(
      { ok: false, error: { message: "Unable to load evidence right now." } },
      { status: 500 }
    );
  }
}

export function POST() {
  return NextResponse.json(
    { ok: false, error: { message: "Method not allowed." } },
    { status: 405 }
  );
}

export function PUT() {
  return NextResponse.json(
    { ok: false, error: { message: "Method not allowed." } },
    { status: 405 }
  );
}

export function PATCH() {
  return NextResponse.json(
    { ok: false, error: { message: "Method not allowed." } },
    { status: 405 }
  );
}

export function DELETE() {
  return NextResponse.json(
    { ok: false, error: { message: "Method not allowed." } },
    { status: 405 }
  );
}
