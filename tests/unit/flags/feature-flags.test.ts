import { describe, expect, it } from "vitest";

import { isFeatureEnabled, listFeatureFlags, resolveFeatureFlags } from "@/lib/flags/feature-flags";

describe("feature flag evaluator", () => {
  it("keeps demo mode and mock QBR enabled by default", () => {
    const flags = resolveFeatureFlags({});

    expect(flags).toMatchObject({
      demoMode: true,
      mockQbrProvider: true,
      localQbrProvider: false,
      metricsEndpoint: true,
      productAnalytics: true,
    });
  });

  it("enables the local provider only outside demo mode when requested", () => {
    const flags = resolveFeatureFlags({
      NEXT_PUBLIC_DEMO_MODE: "false",
      AI_PROVIDER: "local",
    });

    expect(flags.mockQbrProvider).toBe(false);
    expect(flags.localQbrProvider).toBe(true);
  });

  it("lists stable flag states and supports direct checks", () => {
    const source = {
      NEXT_PUBLIC_DEMO_MODE: "false",
      AI_PROVIDER: "mock",
      ENABLE_METRICS_ENDPOINT: "off",
    };

    expect(isFeatureEnabled("metricsEndpoint", source)).toBe(false);
    expect(listFeatureFlags(source)).toContainEqual({ name: "metricsEndpoint", enabled: false });
  });
});
