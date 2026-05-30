import { NextResponse } from "next/server";

import { isDatabaseConfigured, readDemoModeFlag } from "@/lib/env/server-env";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "carrier-performance-scorecard",
    demoMode: readDemoModeFlag(),
    time: new Date().toISOString(),
    dependencies: {
      databaseConfigured: isDatabaseConfigured(),
    },
  });
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
