import { describe, expect, it } from "vitest";

import { buildDashboardQueryString, parseDashboardStateFromSearchParams } from "@/lib/filters/dashboard-state";

describe("dashboard state URL parsing", () => {
  it("treats missing or blank values as null", () => {
    const params = new URLSearchParams("carrierId=&region=%20%20&productType=&period=");
    const { state, issues } = parseDashboardStateFromSearchParams(params);

    expect(issues).toEqual([]);
    expect(state.filters).toEqual({ carrierId: null, region: null, productType: null, period: null });
    expect(state.selectedCarrierId).toBeNull();
    expect(state.evidenceId).toBeNull();
    expect(state.evidenceDimension).toBeNull();
    expect(state.evidenceDelayReason).toBeNull();
  });

  it("sanitizes invalid enums and returns issues instead of throwing", () => {
    const params = new URLSearchParams("region=moon&productType=satellite");
    const { state, issues } = parseDashboardStateFromSearchParams(params);

    expect(state.filters.region).toBeNull();
    expect(state.filters.productType).toBeNull();
    expect(issues).toEqual(
      expect.arrayContaining([
        { kind: "invalid_region", value: "moon" },
        { kind: "invalid_productType", value: "satellite" },
      ]),
    );
  });

  it("sanitizes unknown carrier ids when allowlists are provided", () => {
    const params = new URLSearchParams("carrierId=unknown&selectedCarrierId=also-unknown");
    const { state, issues } = parseDashboardStateFromSearchParams(params, {
      allowedCarrierIds: ["c1", "c2"],
    });

    expect(state.filters.carrierId).toBeNull();
    // Selection is allowed to reference unknown carrier ids so the UI can show a not-found state safely.
    expect(state.selectedCarrierId).toBe("also-unknown");
    expect(issues).toEqual(expect.arrayContaining([{ kind: "invalid_carrierId", value: "unknown" }]));
  });

  it("sanitizes unsupported period values when an allowlist is provided", () => {
    const params = new URLSearchParams("period=2099-01");
    const { state, issues } = parseDashboardStateFromSearchParams(params, {
      allowedPeriods: ["2026-01", "2026-02"],
    });

    expect(state.filters.period).toBeNull();
    expect(issues).toEqual(expect.arrayContaining([{ kind: "invalid_period", value: "2099-01" }]));
  });

  it("sanitizes malformed evidenceId values", () => {
    const params = new URLSearchParams("evidenceId=abc%20123");
    const { state, issues } = parseDashboardStateFromSearchParams(params);

    expect(state.evidenceId).toBeNull();
    expect(issues).toEqual(expect.arrayContaining([{ kind: "invalid_evidenceId", value: "abc 123" }]));
  });

  it("sanitizes conflicting evidence scope params deterministically", () => {
    const params = new URLSearchParams(
      "evidenceId=11111111-1111-1111-1111-111111111111&evidenceDimension=delay_severity&evidenceDelayReason=permit",
    );
    const { state, issues } = parseDashboardStateFromSearchParams(params);

    // EvidenceId wins over dimension/delayReason.
    expect(state.evidenceId).toBe("11111111-1111-1111-1111-111111111111");
    expect(state.evidenceDimension).toBeNull();
    expect(state.evidenceDelayReason).toBeNull();
    expect(issues).toEqual(
      expect.arrayContaining([
        { kind: "conflicting_evidenceScope", value: "evidenceId+evidenceDimension+evidenceDelayReason" },
      ]),
    );
  });

  it("round-trips query building for non-null values", () => {
    const query = buildDashboardQueryString({
      filters: { carrierId: "c1", region: "na", productType: "fiber", period: "2026-06" },
      selectedCarrierId: "c1",
      evidenceId: "e-1",
      evidenceDimension: null,
      evidenceDelayReason: null,
    });

    expect(query).toBe("?carrierId=c1&region=na&productType=fiber&period=2026-06&selectedCarrierId=c1&evidenceId=e-1");

    const { state, issues } = parseDashboardStateFromSearchParams(new URLSearchParams(query.slice(1)));
    expect(issues).toEqual([]);
    expect(state.filters.region).toBe("na");
    expect(state.filters.productType).toBe("fiber");
    expect(state.filters.period).toBe("2026-06");
    expect(state.filters.carrierId).toBe("c1");
    expect(state.selectedCarrierId).toBe("c1");
    expect(state.evidenceId).toBe("e-1");
    expect(state.evidenceDimension).toBeNull();
    expect(state.evidenceDelayReason).toBeNull();
  });
});
