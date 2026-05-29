import { PRODUCT_TYPE_VALUES, REGION_VALUES, type ProductType, type Region } from "@/lib/db/demo-values";
import type { ScoreFilters } from "@/lib/scoring/types";

export type DashboardState = {
  filters: ScoreFilters;
  selectedCarrierId: string | null;
  evidenceId: string | null;
};

export type DashboardSanitizeIssue =
  | { kind: "invalid_region"; value: string }
  | { kind: "invalid_productType"; value: string }
  | { kind: "invalid_period"; value: string }
  | { kind: "invalid_carrierId"; value: string }
  | { kind: "invalid_evidenceId"; value: string };

function parseNullable(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isAllowed<T extends string>(value: string, allowed: readonly T[]): value is T {
  return (allowed as readonly string[]).includes(value);
}

export function parseDashboardStateFromSearchParams(
  searchParams: URLSearchParams,
  opts?: {
    allowedPeriods?: readonly string[];
    allowedCarrierIds?: readonly string[];
  }
): { state: DashboardState; issues: DashboardSanitizeIssue[] } {
  const issues: DashboardSanitizeIssue[] = [];

  const carrierIdRaw = parseNullable(searchParams.get("carrierId"));
  const regionRaw = parseNullable(searchParams.get("region"));
  const productTypeRaw = parseNullable(searchParams.get("productType"));
  const periodRaw = parseNullable(searchParams.get("period"));
  const selectedCarrierIdRaw = parseNullable(searchParams.get("selectedCarrierId"));
  const evidenceIdRaw = parseNullable(searchParams.get("evidenceId"));

  const carrierId =
    carrierIdRaw && opts?.allowedCarrierIds && !opts.allowedCarrierIds.includes(carrierIdRaw)
      ? (issues.push({ kind: "invalid_carrierId", value: carrierIdRaw }), null)
      : carrierIdRaw;

  const region =
    regionRaw && !isAllowed<Region>(regionRaw, REGION_VALUES)
      ? (issues.push({ kind: "invalid_region", value: regionRaw }), null)
      : (regionRaw as Region | null);

  const productType =
    productTypeRaw && !isAllowed<ProductType>(productTypeRaw, PRODUCT_TYPE_VALUES)
      ? (issues.push({ kind: "invalid_productType", value: productTypeRaw }), null)
      : (productTypeRaw as ProductType | null);

  const period =
    periodRaw && opts?.allowedPeriods && !opts.allowedPeriods.includes(periodRaw)
      ? (issues.push({ kind: "invalid_period", value: periodRaw }), null)
      : periodRaw;

  const selectedCarrierId =
    selectedCarrierIdRaw && /[^a-zA-Z0-9-]/.test(selectedCarrierIdRaw)
      ? (issues.push({ kind: "invalid_carrierId", value: selectedCarrierIdRaw }), null)
      : selectedCarrierIdRaw;

  const evidenceId =
    evidenceIdRaw && /[^a-zA-Z0-9-]/.test(evidenceIdRaw)
      ? (issues.push({ kind: "invalid_evidenceId", value: evidenceIdRaw }), null)
      : evidenceIdRaw;

  return {
    state: {
      filters: {
        carrierId,
        region,
        productType,
        period,
      },
      selectedCarrierId,
      evidenceId,
    },
    issues,
  };
}

export function buildDashboardQueryString(state: DashboardState): string {
  const params = new URLSearchParams();
  const f = state.filters;

  if (f.carrierId) params.set("carrierId", f.carrierId);
  if (f.region) params.set("region", f.region);
  if (f.productType) params.set("productType", f.productType);
  if (f.period) params.set("period", f.period);
  if (state.selectedCarrierId) params.set("selectedCarrierId", state.selectedCarrierId);
  if (state.evidenceId) params.set("evidenceId", state.evidenceId);

  const raw = params.toString();
  return raw.length > 0 ? `?${raw}` : "";
}
