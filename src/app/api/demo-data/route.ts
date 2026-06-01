import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";

import { DEMO_DATASET_ID } from "@/lib/db/demo-values";
import { getServerDb } from "@/lib/db/server-db";
import { schema } from "@/lib/db/schema";
import { readDemoModeFlag } from "@/lib/env/server-env";

export const runtime = "nodejs";

function readCount(result: unknown): number {
  // drizzle execute() shape differs by driver:
  // - postgres-js returns an array of row objects
  // - some test drivers return { rows: [...] }
  const rows: Array<Record<string, unknown>> = Array.isArray(result)
    ? (result as Array<Record<string, unknown>>)
    : ((result as { rows?: Array<Record<string, unknown>> } | null)?.rows ?? []);

  const raw = rows[0]?.c;
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export async function GET() {
  try {
    const { db } = getServerDb();

    const metaRows = await db
      .select()
      .from(schema.seedMeta)
      .where(eq(schema.seedMeta.datasetId, DEMO_DATASET_ID))
      .limit(1);

    const meta = metaRows[0] ?? null;

    const [carriers, periods, deliveryRecords, evidenceItems] = await Promise.all([
      db.execute(sql`select count(*)::int as c from carriers`),
      db.execute(sql`select count(*)::int as c from periods`),
      db.execute(sql`select count(*)::int as c from delivery_records`),
      db.execute(sql`select count(*)::int as c from evidence_items`),
    ]);

    return NextResponse.json({
      ok: true as const,
      demoMode: readDemoModeFlag(),
      dataset: meta
        ? {
            id: meta.datasetId,
            seedVersion: meta.seedVersion,
            fingerprint: meta.fingerprint,
            seededAt: meta.seededAt,
          }
        : null,
      counts: {
        carriers: readCount(carriers),
        periods: readCount(periods),
        deliveryRecords: readCount(deliveryRecords),
        evidenceItems: readCount(evidenceItems),
      },
      message: meta ? null : "Seed metadata is not available yet.",
    });
  } catch {
    return NextResponse.json(
      { ok: false as const, error: { message: "Unable to read demo dataset metadata right now." } },
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
