// @vitest-environment node
import { describe, expect, it } from "vitest";

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

function walk(dir: string, out: string[]) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (["node_modules", ".next", ".git", "test-results", "playwright-report"].includes(entry)) continue;
      walk(full, out);
      continue;
    }
    out.push(full);
  }
}

function isClientModule(source: string) {
  // Keep simple: the directive should appear near the top.
  const head = source.slice(0, 400);
  return /["']use client["']/.test(head);
}

describe("server-only boundaries (VAL-SAFE-012)", () => {
  it("prevents client modules from importing server-only modules or private env access", () => {
    const root = process.cwd();
    const srcRoot = path.join(root, "src");
    const files: string[] = [];
    walk(srcRoot, files);

    const violations: Array<{ file: string; matched: string }> = [];

    const forbidden = [
      "@/lib/db/server-db",
      "@/lib/env/server-env",
      "@/lib/qbr/local-provider",
      "@/lib/seed/",
      "drizzle-orm",
      "postgres",
      'import "server-only"',
      "process.env.DATABASE_URL",
      "process.env.OPENAI_COMPATIBLE",
      "process.env.AI_PROVIDER",
    ];

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (ext !== ".ts" && ext !== ".tsx") continue;
      const rel = path.relative(root, file).replaceAll("\\", "/");
      const source = readFileSync(file, "utf8");
      if (!isClientModule(source)) continue;

      for (const needle of forbidden) {
        if (!source.includes(needle)) continue;
        violations.push({ file: rel, matched: needle });
      }
    }

    expect(violations).toEqual([]);
  });
});
