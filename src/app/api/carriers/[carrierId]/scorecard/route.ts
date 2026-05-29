import { NextRequest, NextResponse } from "next/server";

import { getServerDb } from "@/lib/db/server-db";
import { parseScoreFiltersFromUrl } from "@/lib/scoring/filter-parse";
import { isInvalidFilterError } from "@/lib/scoring/invalid-filter";
import { readCarrierDetail } from "@/lib/scoring/read-models";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ carrierId: string }> }
) {
  try {
    const { carrierId } = await context.params;
    const url = new URL(request.url);
    const filters = parseScoreFiltersFromUrl(url);
    const { db } = getServerDb();

    const model = await readCarrierDetail(db, carrierId, filters);
    return NextResponse.json(model);
  } catch (error: unknown) {
    if (isInvalidFilterError(error)) {
      return NextResponse.json(
        { ok: false, error: { code: error.code, message: error.message, details: error.details } },
        { status: error.status }
      );
    }
    return NextResponse.json(
      { ok: false, error: { message: "Unable to compute carrier scorecard right now." } },
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
