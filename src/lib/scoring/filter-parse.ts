import type { ProductType, Region } from "../db/demo-values";
import { PRODUCT_TYPE_VALUES, REGION_VALUES } from "../db/demo-values";
import type { ScoreFilters } from "./types";

function parseNullable(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function parseEnum<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  const v = parseNullable(value);
  if (!v) return null;
  return (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

export function parseScoreFiltersFromUrl(url: URL): ScoreFilters {
  return {
    carrierId: parseNullable(url.searchParams.get("carrierId")),
    region: parseEnum<Region>(url.searchParams.get("region"), REGION_VALUES),
    productType: parseEnum<ProductType>(url.searchParams.get("productType"), PRODUCT_TYPE_VALUES),
    period: parseNullable(url.searchParams.get("period")),
  };
}
