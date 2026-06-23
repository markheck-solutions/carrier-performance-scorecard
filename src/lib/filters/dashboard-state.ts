import { PRODUCT_TYPE_VALUES, REGION_VALUES, type ProductType, type Region } from "@/lib/domain/demo-values";
import { hasCarrierIdFormat } from "@/lib/scoring/carrier-id";
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

type ParseOptions = {
  allowedPeriods?: readonly string[];
  allowedCarrierIds?: readonly string[];
};

type EvidenceScope = {
  evidenceId: string | null;
  evidenceDimension: ScoringComponentId | null;
  evidenceDelayReason: string | null;
};

function reject(issues: DashboardSanitizeIssue[], issue: DashboardSanitizeIssue): null {
  issues.push(issue);
  return null;
}

function parseCarrierFilter(raw: string | null, opts: ParseOptions | undefined, issues: DashboardSanitizeIssue[]) {
  if (!raw) return null;
  if (!hasCarrierIdFormat(raw)) return reject(issues, { kind: "invalid_carrierId", value: raw });
  return opts?.allowedCarrierIds && !opts.allowedCarrierIds.includes(raw)
    ? reject(issues, { kind: "invalid_carrierId", value: raw })
    : raw;
}

function parseSelectedCarrierId(raw: string | null, issues: DashboardSanitizeIssue[]) {
  if (!raw) return null;
  return /[^a-zA-Z0-9-]/.test(raw) ? reject(issues, { kind: "invalid_carrierId", value: raw }) : raw;
}

function parseRegion(raw: string | null, issues: DashboardSanitizeIssue[]): Region | null {
  if (!raw) return null;
  return isAllowed<Region>(raw, REGION_VALUES) ? raw : reject(issues, { kind: "invalid_region", value: raw });
}

function parseProductType(raw: string | null, issues: DashboardSanitizeIssue[]): ProductType | null {
  if (!raw) return null;
  return isAllowed<ProductType>(raw, PRODUCT_TYPE_VALUES)
    ? raw
    : reject(issues, { kind: "invalid_productType", value: raw });
}

function parsePeriod(raw: string | null, opts: ParseOptions | undefined, issues: DashboardSanitizeIssue[]) {
  if (!raw) return null;
  return opts?.allowedPeriods && !opts.allowedPeriods.includes(raw)
    ? reject(issues, { kind: "invalid_period", value: raw })
    : raw;
}

function parseEvidenceId(raw: string | null, issues: DashboardSanitizeIssue[]) {
  if (!raw) return null;
  return /[^a-zA-Z0-9-]/.test(raw) ? reject(issues, { kind: "invalid_evidenceId", value: raw }) : raw;
}

function parseEvidenceDimension(raw: string | null, issues: DashboardSanitizeIssue[]): ScoringComponentId | null {
  if (!raw) return null;
  const allowed = Object.keys(SCORE_MANIFEST.components) as ScoringComponentId[];
  return /^[a-z_]+$/.test(raw) && allowed.includes(raw as ScoringComponentId)
    ? (raw as ScoringComponentId)
    : reject(issues, { kind: "invalid_evidenceDimension", value: raw });
}

function parseEvidenceDelayReason(raw: string | null, issues: DashboardSanitizeIssue[]) {
  if (!raw) return null;
  return /^[a-z_]+$/.test(raw) ? raw : reject(issues, { kind: "invalid_evidenceDelayReason", value: raw });
}

function normalizeEvidenceScope(scope: EvidenceScope, issues: DashboardSanitizeIssue[]): EvidenceScope {
  const keys = [
    scope.evidenceId ? "evidenceId" : null,
    scope.evidenceDimension ? "evidenceDimension" : null,
    scope.evidenceDelayReason ? "evidenceDelayReason" : null,
  ].filter((value): value is string => Boolean(value));

  // Evidence scope is mutually exclusive: deep links must not specify multiple proof drivers.
  // If a link contains multiple evidence scope params, deterministically choose one and drop the others.
  if (keys.length <= 1) return scope;

  issues.push({ kind: "conflicting_evidenceScope", value: keys.join("+") });
  if (scope.evidenceId) return { evidenceId: scope.evidenceId, evidenceDimension: null, evidenceDelayReason: null };
  return { ...scope, evidenceDelayReason: null };
}

export function parseDashboardStateFromSearchParams(
  searchParams: URLSearchParams,
  opts?: ParseOptions,
): { state: DashboardState; issues: DashboardSanitizeIssue[] } {
  const issues: DashboardSanitizeIssue[] = [];
  const evidenceScope = normalizeEvidenceScope(
    {
      evidenceId: parseEvidenceId(parseNullable(searchParams.get("evidenceId")), issues),
      evidenceDimension: parseEvidenceDimension(parseNullable(searchParams.get("evidenceDimension")), issues),
      evidenceDelayReason: parseEvidenceDelayReason(parseNullable(searchParams.get("evidenceDelayReason")), issues),
    },
    issues,
  );

  return {
    state: {
      filters: {
        carrierId: parseCarrierFilter(parseNullable(searchParams.get("carrierId")), opts, issues),
        region: parseRegion(parseNullable(searchParams.get("region")), issues),
        productType: parseProductType(parseNullable(searchParams.get("productType")), issues),
        period: parsePeriod(parseNullable(searchParams.get("period")), opts, issues),
      },
      selectedCarrierId: parseSelectedCarrierId(parseNullable(searchParams.get("selectedCarrierId")), issues),
      ...evidenceScope,
    },
    issues,
  };
}

export function buildDashboardQueryString(state: DashboardState): string {
  const params = new URLSearchParams();
  const entries = [
    ["carrierId", state.filters.carrierId],
    ["region", state.filters.region],
    ["productType", state.filters.productType],
    ["period", state.filters.period],
    ["selectedCarrierId", state.selectedCarrierId],
    ["evidenceId", state.evidenceId],
    ["evidenceDimension", state.evidenceDimension],
    ["evidenceDelayReason", state.evidenceDelayReason],
  ] as const;

  for (const [key, value] of entries) {
    if (value) params.set(key, value);
  }

  const raw = params.toString();
  return raw.length > 0 ? `?${raw}` : "";
}
