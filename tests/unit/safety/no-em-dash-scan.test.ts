// @vitest-environment node
import { describe, expect, it } from "vitest";

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const EM_DASH_RE = /[\u2014\u2015\u2013]/; // em dash, horizontal bar, en dash

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

function shouldScan(filePath: string) {
  const base = path.basename(filePath);
  if (base.startsWith(".")) {
    // Allow scanning dotfiles that are meant for review.
    return base === ".env.example";
  }
  const ext = path.extname(filePath).toLowerCase();
  return [".ts", ".tsx", ".js", ".mjs", ".json", ".md", ".css", ".txt", ".yml", ".yaml"].includes(ext);
}

describe("no em dash prose scan (VAL-CROSS-012)", () => {
  it("finds no em dash characters in repository review surfaces", () => {
    const root = process.cwd();
    const all: string[] = [];
    walk(root, all);

    const findings: Array<{ file: string; sample: string }> = [];
    for (const file of all) {
      if (!shouldScan(file)) continue;
      // Skip local env values and other non-review artifacts.
      const rel = path.relative(root, file).replaceAll("\\", "/");
      if (rel.startsWith("test-results/")) continue;
      if (rel.startsWith(".next/")) continue;
      if (rel.startsWith("node_modules/")) continue;
      if (rel.startsWith(".git/")) continue;
      if (rel.startsWith(".env") && rel !== ".env.example") continue;

      const text = readFileSync(file, "utf8");
      const match = text.match(EM_DASH_RE);
      if (!match) continue;

      const idx = match.index ?? 0;
      const start = Math.max(0, idx - 30);
      const end = Math.min(text.length, idx + 30);
      findings.push({ file: rel, sample: text.slice(start, end) });
      if (findings.length >= 10) break;
    }

    expect(findings).toEqual([]);
  });
});
