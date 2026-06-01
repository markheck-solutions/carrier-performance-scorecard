import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

type Finding = {
  file: string;
  bytes: number;
};

const DEFAULT_LIMIT_BYTES = 1_000_000;
const rawLimit = Number.parseInt(process.env.LARGE_FILE_LIMIT_BYTES ?? "", 10);
const limitBytes = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : DEFAULT_LIMIT_BYTES;

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

const ignoredFiles = new Set(["next-env.d.ts", "tsconfig.tsbuildinfo"]);

function normalize(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

function shouldIgnore(relativeFilePath: string): boolean {
  const normalized = normalize(relativeFilePath);
  const parts = normalized.split("/");
  if (parts.some((part) => ignoredDirectories.has(part))) return true;
  if (ignoredFiles.has(path.basename(normalized))) return true;
  if (path.basename(normalized).startsWith(".env")) return true;
  return false;
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
    const relativePath = path.relative(root, fullPath);
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kib = bytes / 1024;
  if (kib < 1024) return `${kib.toFixed(1)} KiB`;
  return `${(kib / 1024).toFixed(2)} MiB`;
}

const root = process.cwd();
const findings: Finding[] = [];

for (const relativeFilePath of listCandidateFiles(root)) {
  if (shouldIgnore(relativeFilePath)) continue;

  const absoluteFilePath = path.join(root, relativeFilePath);
  if (!existsSync(absoluteFilePath)) continue;

  const stat = statSync(absoluteFilePath);
  if (!stat.isFile()) continue;

  if (stat.size > limitBytes) {
    findings.push({ file: normalize(relativeFilePath), bytes: stat.size });
  }
}

if (findings.length > 0) {
  console.error(`[large-file-check] Files exceed the ${formatBytes(limitBytes)} limit:`);
  for (const finding of findings) {
    console.error(`- ${finding.file}: ${formatBytes(finding.bytes)}`);
  }
  process.exit(1);
}

console.log(`[large-file-check] OK. No files exceed ${formatBytes(limitBytes)}.`);
