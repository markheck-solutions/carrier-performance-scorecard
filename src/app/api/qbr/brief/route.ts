import { NextRequest, NextResponse } from "next/server";

import { getServerDb } from "@/lib/db/server-db";
import { isInvalidFilterError } from "@/lib/scoring/invalid-filter";
import type { Region, ProductType } from "@/lib/db/demo-values";
import { REGION_VALUES, PRODUCT_TYPE_VALUES } from "@/lib/db/demo-values";
import type { ScoreFilters } from "@/lib/scoring/types";
import { buildQbrSafeContextV1, isQbrInvalidCarrierError } from "@/lib/qbr/context";
import { generateQbrBrief } from "@/lib/qbr/generate";
import type { QbrBriefResponse } from "@/lib/qbr/public";
import { isLocalProviderNotConfiguredError } from "@/lib/qbr/local-provider";

export const runtime = "nodejs";

class QbrInvalidRequestError extends Error {
  readonly code = "INVALID_REQUEST" as const;
  readonly status = 400 as const;
  constructor(message: string) {
    super(message);
    this.name = "QbrInvalidRequestError";
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new QbrInvalidRequestError("Invalid request body.");
  const trimmed = value.trim();
  if (trimmed.length > 120) throw new QbrInvalidRequestError("Invalid request body.");
  return trimmed.length > 0 ? trimmed : null;
}

function parseOptionalEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  const v = parseNullableString(value);
  if (!v) return null;
  if ((allowed as readonly string[]).includes(v)) return v as T;
  // Let read models provide the canonical INVALID_FILTER response shape.
  return v as T;
}

function parseVariant(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new QbrInvalidRequestError("Invalid request body.");
  const n = Math.floor(value);
  if (n < 0 || n > 9) throw new QbrInvalidRequestError("Invalid request body.");
  return n;
}

function parseBody(value: unknown): { carrierId: string; filters: ScoreFilters; variant: number | null } {
  if (!isPlainObject(value)) throw new QbrInvalidRequestError("Invalid request body.");

  const allowed = new Set(["carrierId", "region", "productType", "period", "variant"]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new QbrInvalidRequestError("Invalid request body.");
  }

  const carrierId = parseNullableString(value.carrierId);
  if (!carrierId) throw new QbrInvalidRequestError("Carrier id is required.");
  if (carrierId.length > 80) throw new QbrInvalidRequestError("Invalid request body.");

  const region = parseOptionalEnum<Region>(value.region, REGION_VALUES);
  const productType = parseOptionalEnum<ProductType>(value.productType, PRODUCT_TYPE_VALUES);
  const period = parseNullableString(value.period);
  if (period && period.length > 20) throw new QbrInvalidRequestError("Invalid request body.");
  const variant = parseVariant(value.variant);

  return {
    carrierId,
    filters: {
      carrierId: null,
      region,
      productType,
      period,
    },
    variant,
  };
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = (await request.json()) as unknown;
    } catch {
      throw new QbrInvalidRequestError("Malformed JSON.");
    }

    const parsed = parseBody(body);

    const { db } = getServerDb();
    const context = await buildQbrSafeContextV1(db, { carrierId: parsed.carrierId, filters: parsed.filters });
    const generated = await generateQbrBrief(context, { variant: parsed.variant });

    const response: QbrBriefResponse = {
      ok: true,
      provider: { id: generated.provider.id },
      carrier: { id: context.carrier.id, name: context.carrier.name, shortCode: context.carrier.shortCode },
      scope: { filters: context.scope.filters, periodWindow: context.scope.periodWindow },
      brief: generated.brief,
      dataNotice: generated.dataNotice,
    };

    return NextResponse.json(response);
  } catch (error: unknown) {
    if (error instanceof QbrInvalidRequestError) {
      return NextResponse.json(
        { ok: false, error: { code: error.code, message: error.message } } satisfies QbrBriefResponse,
        { status: error.status }
      );
    }
    if (isQbrInvalidCarrierError(error)) {
      return NextResponse.json(
        { ok: false, error: { code: error.code, message: error.message } } satisfies QbrBriefResponse,
        { status: error.status }
      );
    }
    if (isInvalidFilterError(error)) {
      return NextResponse.json(
        { ok: false, error: { code: error.code, message: error.message } } satisfies QbrBriefResponse,
        { status: error.status }
      );
    }
    if (isLocalProviderNotConfiguredError(error)) {
      return NextResponse.json(
        { ok: false, error: { code: error.code, message: "Local AI provider is not configured." } } satisfies QbrBriefResponse,
        { status: error.status }
      );
    }

    return NextResponse.json(
      { ok: false, error: { code: "SERVER_ERROR", message: "Unable to generate QBR brief right now." } } satisfies QbrBriefResponse,
      { status: 500 }
    );
  }
}

export function GET() {
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
