import { execFileSync } from "node:child_process";
import path from "node:path";

type Finding = {
  file: string;
  reason: string;
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

const kebabCasePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const pascalCasePattern = /^[A-Z][A-Za-z0-9]*$/;
const nextSpecialFiles = new Set(["error", "layout", "loading", "not-found", "page", "route"]);

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

function shouldCheck(file: string): boolean {
  const parts = file.split("/");
  if (parts.some((part) => ignoredDirectories.has(part))) return false;
  if (path.basename(file).startsWith(".env")) return false;
  return (
    file.startsWith("src/") || file.startsWith("tests/") || file.startsWith("scripts/") || file.startsWith("docs/")
  );
}

function stemFor(file: string): string {
  const parsed = path.posix.parse(file);
  const ext = parsed.ext;
  const name = parsed.name;
  if (name.endsWith(".test")) return name.slice(0, -".test".length);
  if (name.endsWith(".spec")) return name.slice(0, -".spec".length);
  return ext ? name : path.posix.basename(file);
}

function isAllowedStem(file: string, stem: string): boolean {
  if (stem === "README" || stem === "openapi") return true;
  if (file.startsWith("src/app/") && nextSpecialFiles.has(stem)) return true;
  if (file.startsWith("src/components/")) return kebabCasePattern.test(stem) || pascalCasePattern.test(stem);
  return kebabCasePattern.test(stem);
}

function isAllowedDirectorySegment(segment: string): boolean {
  if (segment.startsWith("[") && segment.endsWith("]")) return true;
  if (segment.startsWith(".")) return true;
  return kebabCasePattern.test(segment);
}

const root = process.cwd();
const findings: Finding[] = [];

for (const file of listFromGit(root)) {
  if (!shouldCheck(file)) continue;
  const parts = file.split("/");
  for (const part of parts.slice(0, -1)) {
    if (!isAllowedDirectorySegment(part)) {
      findings.push({ file, reason: `Directory segment "${part}" should be kebab-case or a Next.js route segment.` });
      break;
    }
  }

  const ext = path.posix.extname(file).toLowerCase();
  if (![".ts", ".tsx", ".js", ".mjs", ".md", ".yaml", ".yml"].includes(ext)) continue;

  const stem = stemFor(file);
  if (!isAllowedStem(file, stem)) {
    findings.push({ file, reason: `File stem "${stem}" should follow the repo naming convention.` });
  }
}

if (findings.length > 0) {
  console.error("[naming-check] Naming convention findings:");
  for (const finding of findings.slice(0, 25)) {
    console.error(`- ${finding.file}: ${finding.reason}`);
  }
  if (findings.length > 25) console.error(`- ${findings.length - 25} more finding(s) hidden`);
  process.exit(1);
}

console.log("[naming-check] OK. File and directory names follow the repo conventions.");
