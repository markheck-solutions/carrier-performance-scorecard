import { PRODUCT_TYPE_VALUES, REGION_VALUES, type ProductType, type Region } from "@/lib/db/demo-values";
import { SCORE_MANIFEST } from "@/lib/scoring/manifest";
import type { ScoreFilters, ScoringComponentId } from "@/lib/scoring/types";

export type DashboardState = {
  filters: ScoreFilters;
  selectedCarrierId: string | null;
  evidenceId: string | null;
  evidenceDimension: ScoringComponentId | null;
  evidenceDelayReason: string | null;
};

export type DashboardSanitizeIssue =
  | { kind: "invalid_region"; value: string }
  | { kind: "invalid_productType"; value: string }
  | { kind: "invalid_period"; value: string }
  | { kind: "invalid_carrierId"; value: string }
  | { kind: "invalid_evidenceId"; value: string }
  | { kind: "invalid_evidenceDimension"; value: string }
  | { kind: "invalid_evidenceDelayReason"; value: string }
  | { kind: "conflicting_evidenceScope"; value: string };

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
  },
): { state: DashboardState; issues: DashboardSanitizeIssue[] } {
  const issues: DashboardSanitizeIssue[] = [];

  const carrierIdRaw = parseNullable(searchParams.get("carrierId"));
  const regionRaw = parseNullable(searchParams.get("region"));
  const productTypeRaw = parseNullable(searchParams.get("productType"));
  const periodRaw = parseNullable(searchParams.get("period"));
  const selectedCarrierIdRaw = parseNullable(searchParams.get("selectedCarrierId"));
  const evidenceIdRaw = parseNullable(searchParams.get("evidenceId"));
  const evidenceDimensionRaw = parseNullable(searchParams.get("evidenceDimension"));
  const evidenceDelayReasonRaw = parseNullable(searchParams.get("evidenceDelayReason"));

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

  const allowedEvidenceDimensions = Object.keys(SCORE_MANIFEST.components) as ScoringComponentId[];
  const evidenceDimension =
    evidenceDimensionRaw &&
    (!/^[a-z_]+$/.test(evidenceDimensionRaw) ||
      !allowedEvidenceDimensions.includes(evidenceDimensionRaw as ScoringComponentId))
      ? (issues.push({ kind: "invalid_evidenceDimension", value: evidenceDimensionRaw }), null)
      : (evidenceDimensionRaw as ScoringComponentId | null);

  const evidenceDelayReason =
    evidenceDelayReasonRaw && !/^[a-z_]+$/.test(evidenceDelayReasonRaw)
      ? (issues.push({ kind: "invalid_evidenceDelayReason", value: evidenceDelayReasonRaw }), null)
      : evidenceDelayReasonRaw;

  // Evidence scope is mutually exclusive: deep links must not specify multiple proof drivers.
  // If a link contains multiple evidence scope params, deterministically choose one and drop the others.
  const evidenceScopes = [
    evidenceId ? "evidenceId" : null,
    evidenceDimension ? "evidenceDimension" : null,
    evidenceDelayReason ? "evidenceDelayReason" : null,
  ].filter((v): v is string => Boolean(v));

  const normalizedEvidenceId = evidenceId;
  let normalizedEvidenceDimension = evidenceDimension;
  let normalizedEvidenceDelayReason = evidenceDelayReason;

  if (evidenceScopes.length > 1) {
    issues.push({ kind: "conflicting_evidenceScope", value: evidenceScopes.join("+") });
    // Priority: a concrete evidence id wins over dimension, which wins over delay-reason scope.
    if (normalizedEvidenceId) {
      normalizedEvidenceDimension = null;
      normalizedEvidenceDelayReason = null;
    } else if (normalizedEvidenceDimension) {
      normalizedEvidenceDelayReason = null;
    }
  }

  return {
    state: {
      filters: {
        carrierId,
        region,
        productType,
        period,
      },
      selectedCarrierId,
      evidenceId: normalizedEvidenceId,
      evidenceDimension: normalizedEvidenceDimension,
      evidenceDelayReason: normalizedEvidenceDelayReason,
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
  if (state.evidenceDimension) params.set("evidenceDimension", state.evidenceDimension);
  if (state.evidenceDelayReason) params.set("evidenceDelayReason", state.evidenceDelayReason);

  const raw = params.toString();
  return raw.length > 0 ? `?${raw}` : "";
}
