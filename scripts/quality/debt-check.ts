import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

type Finding = {
  file: string;
  line: number;
  tag: string;
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

const ignoredFiles = new Set(["package-lock.json", "scripts/quality/debt-check.ts", "tsconfig.tsbuildinfo"]);
const scannedExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".mts",
  ".scss",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

const debtMarkerPattern = /\b(TODO|FIXME)\b/gi;
const referencePattern = /(#\d+|https?:\/\/|[A-Z][A-Z0-9]+-\d+|issue[:\s-]*\d+|ticket[:\s-]*[A-Z0-9-]+)/i;
const secretPatterns = [
  /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?):\/\/[^\s"'`]+/gi,
  /\bBearer\s+[A-Za-z0-9._-]{12,}\b/gi,
  /\bsk-[A-Za-z0-9_-]{12,}\b/gi,
];

function normalize(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

function shouldIgnore(relativeFilePath: string): boolean {
  const normalized = normalize(relativeFilePath);
  const parts = normalized.split("/");
  if (parts.some((part) => ignoredDirectories.has(part))) return true;
  if (ignoredFiles.has(normalized)) return true;
  if (path.basename(normalized).startsWith(".env")) return true;
  return false;
}

function shouldScan(relativeFilePath: string): boolean {
  if (shouldIgnore(relativeFilePath)) return false;
  return scannedExtensions.has(path.extname(relativeFilePath).toLowerCase());
}

function listFromGit(root: string): string[] {
  const output = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
  });
  return output
    .split("\0")
    .map((file) => file.trim())
    .filter(Boolean);
}

function walk(root: string, current: string, out: string[]): void {
  for (const entry of readdirSync(current)) {
    const fullPath = path.join(current, entry);
    const relativePath = normalize(path.relative(root, fullPath));
    if (shouldIgnore(relativePath)) continue;

    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walk(root, fullPath, out);
      continue;
    }
    out.push(relativePath);
  }
}

function listCandidateFiles(root: string): string[] {
  try {
    return listFromGit(root);
  } catch {
    const files: string[] = [];
    walk(root, root, files);
    return files;
  }
}

function redactSample(value: string): string {
  let redacted = value.trim();
  for (const pattern of secretPatterns) {
    redacted = redacted.replace(pattern, "[redacted]");
  }
  return redacted.length > 180 ? `${redacted.slice(0, 177)}...` : redacted;
}

const root = process.cwd();
const findings: Finding[] = [];

for (const relativeFilePath of listCandidateFiles(root)) {
  const normalized = normalize(relativeFilePath);
  if (!shouldScan(normalized)) continue;

  const absoluteFilePath = path.join(root, normalized);
  if (!existsSync(absoluteFilePath)) continue;
  const stat = statSync(absoluteFilePath);
  if (!stat.isFile()) continue;

  const lines = readFileSync(absoluteFilePath, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    debtMarkerPattern.lastIndex = 0;
    const match = debtMarkerPattern.exec(line);
    if (!match) return;
    if (referencePattern.test(line)) return;
    findings.push({
      file: normalized,
      line: index + 1,
      tag: match[1].toUpperCase(),
      sample: redactSample(line),
    });
  });
}

if (findings.length > 0) {
  console.error("[debt-check] TODO/FIXME markers need an issue, ticket, or URL reference:");
  for (const finding of findings.slice(0, 25)) {
    console.error(`- ${finding.file}:${finding.line} ${finding.tag}: ${finding.sample}`);
  }
  if (findings.length > 25) {
    console.error(`- ${findings.length - 25} more finding(s) hidden`);
  }
  process.exit(1);
}

console.log("[debt-check] OK. No untracked TODO/FIXME markers found.");
