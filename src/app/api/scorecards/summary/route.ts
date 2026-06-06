import { NextRequest, NextResponse } from "next/server";

import { getServerDb } from "@/lib/db/server-db";
import { parseScoreFiltersFromUrl } from "@/lib/scoring/filter-parse";
import { isInvalidFilterError } from "@/lib/scoring/invalid-filter";
import { readScorecardsSummary } from "@/lib/scoring/read-models";
import { captureServerError } from "@/lib/observability/sentry-server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const filters = parseScoreFiltersFromUrl(new URL(request.url));
    const { db } = getServerDb();
    const model = await readScorecardsSummary(db, filters);
    return NextResponse.json(model);
  } catch (error: unknown) {
    if (isInvalidFilterError(error)) {
      return NextResponse.json(
        { ok: false, error: { code: error.code, message: error.message, details: error.details } },
        { status: error.status },
      );
    }
    captureServerError(error, { operation: "read-scorecards-summary", route: "/api/scorecards/summary", request });
    return NextResponse.json(
      { ok: false, error: { message: "Unable to compute scorecards right now." } },
      { status: 500 },
    );
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
