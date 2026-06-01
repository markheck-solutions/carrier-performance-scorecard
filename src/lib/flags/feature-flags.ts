export type FeatureFlagName =
  | "demoMode"
  | "mockQbrProvider"
  | "localQbrProvider"
  | "metricsEndpoint"
  | "productAnalytics";

export type FeatureFlagSource = Record<string, string | boolean | number | null | undefined>;

export type FeatureFlagSnapshot = Record<FeatureFlagName, boolean>;

export type FeatureFlagLifecycle = {
  owner: string;
  introduced: string;
  reviewBy: string;
  cleanupWhen: string;
};

const DEFAULT_FLAGS: FeatureFlagSnapshot = {
  demoMode: true,
  mockQbrProvider: true,
  localQbrProvider: false,
  metricsEndpoint: true,
  productAnalytics: true,
};

export const FEATURE_FLAG_LIFECYCLE: Record<FeatureFlagName, FeatureFlagLifecycle> = {
  demoMode: {
    owner: "portfolio-maintainer",
    introduced: "2026-05-31",
    reviewBy: "2026-12-31",
    cleanupWhen: "Public demo mode is no longer needed for reviewer-safe operation.",
  },
  mockQbrProvider: {
    owner: "portfolio-maintainer",
    introduced: "2026-05-31",
    reviewBy: "2026-12-31",
    cleanupWhen: "A production-approved backend-only QBR provider is configured and validated.",
  },
  localQbrProvider: {
    owner: "portfolio-maintainer",
    introduced: "2026-05-31",
    reviewBy: "2026-12-31",
    cleanupWhen: "Local provider experimentation is retired or replaced by an approved provider.",
  },
  metricsEndpoint: {
    owner: "portfolio-maintainer",
    introduced: "2026-05-31",
    reviewBy: "2026-12-31",
    cleanupWhen: "Metrics export moves to a managed observability provider.",
  },
  productAnalytics: {
    owner: "portfolio-maintainer",
    introduced: "2026-05-31",
    reviewBy: "2026-12-31",
    cleanupWhen: "Product analytics are disabled or wired to an approved provider.",
  },
};

function readString(source: FeatureFlagSource, key: string): string {
  return String(source[key] ?? "").trim();
}

function readBoolean(source: FeatureFlagSource, key: string, fallback: boolean): boolean {
  const value = source[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

export function resolveFeatureFlags(source: FeatureFlagSource = process.env): FeatureFlagSnapshot {
  const demoMode = readBoolean(source, "NEXT_PUBLIC_DEMO_MODE", DEFAULT_FLAGS.demoMode);
  const provider = readString(source, "AI_PROVIDER").toLowerCase();
  const localProviderRequested = provider === "local";

  return {
    demoMode,
    mockQbrProvider: demoMode || provider !== "local",
    localQbrProvider: !demoMode && localProviderRequested,
    metricsEndpoint: readBoolean(source, "ENABLE_METRICS_ENDPOINT", DEFAULT_FLAGS.metricsEndpoint),
    productAnalytics: readBoolean(source, "NEXT_PUBLIC_PRODUCT_ANALYTICS", DEFAULT_FLAGS.productAnalytics),
  };
}

export function isFeatureEnabled(name: FeatureFlagName, source: FeatureFlagSource = process.env): boolean {
  return resolveFeatureFlags(source)[name];
}

export function listFeatureFlags(source: FeatureFlagSource = process.env) {
  const flags = resolveFeatureFlags(source);
  return (Object.keys(flags) as FeatureFlagName[]).map((name) => ({
    name,
    enabled: flags[name],
  }));
}
