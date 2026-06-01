import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";

import { getServerDb } from "@/lib/db/server-db";
import { schema } from "@/lib/db/schema";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { db } = getServerDb();

    const [carriers, periods] = await Promise.all([
      db.select().from(schema.carriers).orderBy(asc(schema.carriers.name)),
      db.select().from(schema.periods).orderBy(asc(schema.periods.startDate)),
    ]);

    return NextResponse.json({
      ok: true as const,
      carriers: carriers.map((c) => ({
        id: c.id,
        name: c.name,
        shortCode: c.shortCode,
        relationshipTier: c.relationshipTier,
        regionFocus: c.regionFocus,
      })),
      periods: periods.map((p) => ({
        seedKey: p.seedKey,
        label: p.label,
        startDate: p.startDate,
        endDate: p.endDate,
      })),
    });
  } catch {
    return NextResponse.json(
      { ok: false as const, error: { message: "Unable to load filter options right now." } },
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
