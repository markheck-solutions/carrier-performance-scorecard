// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildDemoDataset } from "../../../src/lib/seed/demo-dataset";
import { assertDemoSafe, scanTextForDemoSafety } from "../../../src/lib/safety/demo-data-safety";

describe("demo-data safety scanner", () => {
  it("accepts the seeded demo dataset (positive control)", () => {
    const dataset = buildDemoDataset();
    expect(() => assertDemoSafe(dataset)).not.toThrow();
  });

  it("flags every forbidden class via negative controls", () => {
    const negatives = [
      { kind: "email", text: "ops@example.com" },
      { kind: "phone", text: "+1 (415) 555-1212" },
      { kind: "street_address", text: "1200 Main St" },
      { kind: "circuit_id", text: "CKT-123456" },
      { kind: "order_id", text: "ORD-482910" },
      { kind: "route_id", text: "RTE-AB12C" },
      { kind: "pricing_or_contract", text: "Rate card is $2500 USD per month" },
      { kind: "provider_url", text: "https://api.example.invalid/v1/chat" },
      { kind: "env_var_name", text: "DATABASE_URL" },
      { kind: "real_world_carrier_name", text: "Verizon" },
      { kind: "private_gateway_marker", text: "PRIVATE_GATEWAY_MARKER_REDACTED" },
    ] as const;

    for (const n of negatives) {
      const findings = scanTextForDemoSafety(n.text);
      expect(
        findings.some((f) => f.kind === n.kind),
        `Expected finding kind ${n.kind} for "${n.text}"`,
      ).toBe(true);
    }
  });
});
