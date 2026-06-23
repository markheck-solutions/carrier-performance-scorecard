import type { ProductType, Region } from "../domain/demo-values";
import { PRODUCT_TYPE_VALUES, REGION_VALUES } from "../domain/demo-values";
import { hasCarrierIdFormat } from "./carrier-id";
import { InvalidFilterError } from "./invalid-filter";
import type { ScoreFilters } from "./types";

function parseNullable(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function parseCarrierId(value: string | null): string | null {
  const v = parseNullable(value);
  if (!v) return null;
  if (hasCarrierIdFormat(v)) return v;
  throw new InvalidFilterError({
    field: "carrierId",
    value: v,
  });
}

export function parseRequiredCarrierId(value: string): string {
  const carrierId = parseCarrierId(value);
  if (carrierId) return carrierId;
  throw new InvalidFilterError({
    field: "carrierId",
    value,
  });
}

function parseAllowedEnum<T extends string>(params: {
  value: string | null;
  allowed: readonly T[];
  field: "region" | "productType";
}): T | null {
  const v = parseNullable(params.value);
  if (!v) return null;
  if ((params.allowed as readonly string[]).includes(v)) return v as T;
  throw new InvalidFilterError({
    field: params.field,
    value: v,
    allowed: [...params.allowed],
  });
}

export function parseScoreFiltersFromUrl(url: URL): ScoreFilters {
  return {
    carrierId: parseCarrierId(url.searchParams.get("carrierId")),
    region: parseAllowedEnum<Region>({
      value: url.searchParams.get("region"),
      allowed: REGION_VALUES,
      field: "region",
    }),
    productType: parseAllowedEnum<ProductType>({
      value: url.searchParams.get("productType"),
      allowed: PRODUCT_TYPE_VALUES,
      field: "productType",
    }),
    period: parseNullable(url.searchParams.get("period")),
  };
}
