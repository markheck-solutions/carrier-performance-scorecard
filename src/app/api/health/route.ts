import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "carrier-performance-scorecard",
    demoMode: process.env.NEXT_PUBLIC_DEMO_MODE === "true",
    time: new Date().toISOString(),
  });
}
