import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type Finding = {
  file: string;
  line: number;
  sample: string;
};

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

const loopStartPattern = /\bfor\s*\(|\bforEach\s*\(|\.\s*map\s*\(\s*async|\.\s*flatMap\s*\(\s*async/;
const dataAccessPattern =
  /\bawait\s+(?:db\.|getServerDb\(|readScorecardsSummary\(|readCarrierDetail\(|readEvidence\(|buildQbrSafeContextV1\()/;
const baselinePatterns = [
  {
    file: "src/lib/qbr/context.ts",
    sampleIncludes: "await readEvidence(db,",
  },
];

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
  return file.startsWith("src/") && [".ts", ".tsx"].includes(path.extname(file));
}

function braceDelta(line: string): number {
  let delta = 0;
  for (const char of line) {
    if (char === "{") delta += 1;
    if (char === "}") delta -= 1;
  }
  return delta;
}

const root = process.cwd();
const findings: Finding[] = [];

for (const file of listFromGit(root)) {
  if (!shouldScan(file)) continue;
  const absoluteFilePath = path.join(root, file);
  if (!existsSync(absoluteFilePath)) continue;

  const lines = readFileSync(absoluteFilePath, "utf8").split(/\r?\n/);
  let loopDepth: number | null = null;

  lines.forEach((line, index) => {
    const normalizedLine = line.trim();
    if (loopDepth === null && loopStartPattern.test(normalizedLine)) {
      loopDepth = Math.max(1, braceDelta(normalizedLine));
    } else if (loopDepth !== null) {
      loopDepth += braceDelta(normalizedLine);
    }

    if (loopDepth !== null && dataAccessPattern.test(normalizedLine)) {
      const isBaseline = baselinePatterns.some(
        (baseline) => baseline.file === file && normalizedLine.includes(baseline.sampleIncludes),
      );
      if (!isBaseline) {
        findings.push({ file, line: index + 1, sample: normalizedLine.slice(0, 160) });
      }
    }

    if (loopDepth !== null && loopDepth <= 0) {
      loopDepth = null;
    }
  });
}

if (findings.length > 0) {
  console.error("[query-pattern-check] Potential N+1 data access patterns found:");
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.sample}`);
  }
  process.exit(1);
}

console.log("[query-pattern-check] OK. No untracked per-item awaited data access patterns found.");
