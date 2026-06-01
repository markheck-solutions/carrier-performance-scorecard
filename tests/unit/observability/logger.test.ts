// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { buildSafeLogEvent, redactLogValue, writeServerLog } from "@/lib/observability/logger";

describe("server logger redaction", () => {
  it("redacts sensitive keys and known secret shaped values", () => {
    const redacted = redactLogValue({
      authorization: "Bearer should-not-leak",
      nested: {
        databaseUrl: "database connection should-not-leak",
        message: "provider key sk-test-should-not-leak was rejected",
      },
      safe: "carrier demo mode",
    });

    expect(redacted).toEqual({
      authorization: "[redacted]",
      nested: {
        databaseUrl: "[redacted]",
        message: "provider key [redacted] was rejected",
      },
      safe: "carrier demo mode",
    });
  });

  it("builds structured events without leaking sensitive context", () => {
    const event = buildSafeLogEvent("warn", "qbr provider rejected Bearer should-not-leak", {
      token: "sk-test-should-not-leak",
      carrierId: "demo-carrier",
    });

    expect(event.level).toBe("warn");
    expect(event.event).toBe("qbr provider rejected [redacted]");
    expect(event.context).toEqual({
      token: "[redacted]",
      carrierId: "demo-carrier",
    });
    expect(event.timestamp).toEqual(expect.any(String));
  });

  it("writes JSON lines through the selected console level", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    writeServerLog("warn", "demo warning", { apiKey: "sk-test-should-not-leak" });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const line = warnSpy.mock.calls[0]?.[0];
    expect(typeof line).toBe("string");
    expect(line).not.toContain("sk-test");
    expect(JSON.parse(line as string)).toMatchObject({
      level: "warn",
      event: "demo warning",
      context: { apiKey: "[redacted]" },
    });

    warnSpy.mockRestore();
  });
});
