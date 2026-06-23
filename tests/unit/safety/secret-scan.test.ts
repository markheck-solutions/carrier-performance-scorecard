// @vitest-environment node
import { describe, expect, it } from "vitest";

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

type Finding = { file: string; kind: string; sample: string };

const RULES: Array<{ kind: string; regex: RegExp }> = [
  { kind: "private_key_block", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { kind: "github_token", regex: /\bghp_[A-Za-z0-9]{30,}\b/ },
  { kind: "aws_access_key", regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { kind: "database_url", regex: /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?):\/\/[^\s"'`]+/i },
  { kind: "openai_key_like", regex: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { kind: "bearer_token", regex: /\bBearer\s+[A-Za-z0-9._-]{20,}\b/ },
];

function isBinary(content: string) {
  return content.includes("\u0000");
}

function readTrackedText(abs: string) {
  try {
    return readFileSync(abs, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function allowlisted(kind: string, sample: string, file: string, contextLine: string) {
  const s = sample.toLowerCase();
  if (kind === "openai_key_like") {
    // Unit tests intentionally include clearly fake key strings to prove redaction and non-leakage.
    if (s.includes("redacted") || s.includes("should-not-leak") || s.includes("test")) return true;
  }
  if (kind === "database_url") {
    // Allow obvious non-secret placeholders used in tests or config examples.
    if (s.includes("example.invalid") || s.includes("example.test") || s === "configured") return true;
    if (s === "postgres://|sk-|password|secret") return true;
  }
  if (file === "package-lock.json") {
    // Lockfile integrity metadata can contain random-looking base64 that trips token heuristics.
    // Only allowlist matches that are on known non-secret fields.
    const line = contextLine.toLowerCase();
    const isIntegrityOrResolved = line.includes('"integrity"') || line.includes('"resolved"');
    if (isIntegrityOrResolved && kind !== "private_key_block") return true;
  }

  // Never allow key blocks (or token formats) outside very narrow lockfile metadata allowlists.
  if (["private_key_block", "github_token", "aws_access_key"].includes(kind)) return false;

  // Default: no allowlist.
  void file;
  void contextLine;
  return false;
}

describe("secret scan (VAL-SAFE-011)", () => {
  it("does not commit env files or secret-looking values", () => {
    const repoRoot = process.cwd();
    const tracked = execSync("git ls-files", { encoding: "utf8" })
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    // Env files must not be committed (placeholders only are allowed in .env.example).
    const committedEnv = tracked.filter((f) => f.startsWith(".env") && f !== ".env.example");
    expect(committedEnv).toEqual([]);

    const findings: Finding[] = [];
    for (const rel of tracked) {
      const abs = path.join(repoRoot, rel);
      const content = readTrackedText(abs);
      if (content === null) continue;
      if (isBinary(content)) continue;

      for (const rule of RULES) {
        const match = content.match(rule.regex);
        if (!match) continue;
        const sample = match[0].slice(0, 120);
        const idx = match.index ?? -1;
        const start = idx >= 0 ? Math.max(0, content.lastIndexOf("\n", idx) + 1) : 0;
        const end = idx >= 0 ? content.indexOf("\n", idx) : -1;
        const contextLine = idx >= 0 ? content.slice(start, end === -1 ? content.length : end) : "";
        if (allowlisted(rule.kind, sample, rel, contextLine)) continue;
        findings.push({ file: rel, kind: rule.kind, sample });
        if (findings.length >= 10) break;
      }
      if (findings.length >= 10) break;
    }

    expect(findings).toEqual([]);
  });
});
