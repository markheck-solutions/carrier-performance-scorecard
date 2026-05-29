import { describe, expect, it } from "vitest";

import { parseScoreFiltersFromUrl } from "../../../src/lib/scoring/filter-parse";
import { InvalidFilterError } from "../../../src/lib/scoring/invalid-filter";

describe("parseScoreFiltersFromUrl", () => {
  it("treats missing or blank filters as null", () => {
    const url = new URL("http://example.test/api/scorecards/summary?region=&productType=%20%20&period=");
    const parsed = parseScoreFiltersFromUrl(url);
    expect(parsed.region).toBeNull();
    expect(parsed.productType).toBeNull();
    expect(parsed.period).toBeNull();
  });

  it("rejects unsupported region values instead of silently broadening scope", () => {
    const url = new URL("http://example.test/api/scorecards/summary?region=moon");
    expect(() => parseScoreFiltersFromUrl(url)).toThrow(InvalidFilterError);

    try {
      parseScoreFiltersFromUrl(url);
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidFilterError);
      const e = err as InvalidFilterError;
      expect(e.code).toBe("INVALID_FILTER");
      expect(e.details.field).toBe("region");
      expect(e.details.value).toBe("moon");
      expect(e.details.allowed).toContain("na");
    }
  });

  it("rejects unsupported productType values instead of silently broadening scope", () => {
    const url = new URL("http://example.test/api/scorecards/summary?productType=satellite");
    expect(() => parseScoreFiltersFromUrl(url)).toThrow(InvalidFilterError);
  });
});
