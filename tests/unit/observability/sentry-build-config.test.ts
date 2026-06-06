// @vitest-environment node
import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import path from "node:path";

describe("Sentry build configuration", () => {
  it("keeps source map upload and client map cleanup wired into Next config", () => {
    const source = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");

    expect(source).toContain("withSentryConfig");
    expect(source).toContain("SENTRY_AUTH_TOKEN");
    expect(source).toContain("widenClientFileUpload: true");
    expect(source).toContain("deleteSourcemapsAfterUpload: true");
    expect(source).toContain("autoInstrumentAppDirectory: true");
  });
});
