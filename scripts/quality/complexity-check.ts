import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type Finding = {
  file: string;
  line: number;
  name: string;
  complexity: number;
};

const DEFAULT_LIMIT = 35;
const rawLimit = Number.parseInt(process.env.CYCLOMATIC_COMPLEXITY_LIMIT ?? "", 10);
const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : DEFAULT_LIMIT;

const ignoredDirectories = new Set([
  ".factory",
  ".git",
  ".next",
  ".vercel",
  "coverage",
  "node_modules",
  "playwright-report",
  "test-results",
]);

const functionStartPattern =
  /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(|(?:export\s+)?const\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\(/;
const decisionPattern = /\b(?:if|for|while|case|catch)\b|&&|\|\||\?/g;
const baselineLimits = new Map<string, number>([
  ["src/lib/qbr/mock-provider.ts:generateMockQbrBrief", 64],
  ["src/lib/scoring/engine.ts:buildComponent", 39],
]);

function normalize(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

function listFromGit(root: string): string[] {
  const output = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
  });
  return output
    .split("\0")
    .map((file) => file.trim())
    .filter(Boolean)
    .map(normalize);
}

function shouldScan(file: string): boolean {
  const parts = file.split("/");
  if (parts.some((part) => ignoredDirectories.has(part))) return false;
  if (file.startsWith("src/components/")) return false;
  if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) return false;
  return (file.startsWith("src/") || file.startsWith("scripts/")) && [".ts", ".tsx"].includes(path.extname(file));
}

function braceDelta(line: string): number {
  let delta = 0;
  for (const char of line) {
    if (char === "{") delta += 1;
    if (char === "}") delta -= 1;
  }
  return delta;
}

function decisionCount(line: string): number {
  return line.match(decisionPattern)?.length ?? 0;
}

const root = process.cwd();
const findings: Finding[] = [];

for (const file of listFromGit(root)) {
  if (!shouldScan(file)) continue;
  const absoluteFilePath = path.join(root, file);
  if (!existsSync(absoluteFilePath)) continue;

  const lines = readFileSync(absoluteFilePath, "utf8").split(/\r?\n/);
  let active: { name: string; line: number; complexity: number; depth: number } | null = null;

  lines.forEach((line, index) => {
    if (!active) {
      const match = line.match(functionStartPattern);
      if (!match) return;
      active = {
        name: match[1] ?? match[2] ?? "anonymous",
        line: index + 1,
        complexity: 1 + decisionCount(line),
        depth: braceDelta(line),
      };
      if (active.depth <= 0 && line.includes("=>")) active.depth = 1;
      return;
    }

    active.complexity += decisionCount(line);
    active.depth += braceDelta(line);
    if (active.depth <= 0) {
      const baselineLimit = baselineLimits.get(`${file}:${active.name}`);
      const activeLimit = baselineLimit ?? limit;
      if (active.complexity > activeLimit) {
        findings.push({
          file,
          line: active.line,
          name: active.name,
          complexity: active.complexity,
        });
      }
      active = null;
    }
  });
}

if (findings.length > 0) {
  console.error(`[complexity-check] Functions exceed cyclomatic complexity limit ${limit} or their tracked baseline:`);
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.name} complexity ${finding.complexity}`);
  }
  process.exit(1);
}

console.log(`[complexity-check] OK. No untracked function exceeds complexity limit ${limit}.`);
