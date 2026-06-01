import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

type Finding = {
  name: string;
  detail: string;
};

const DEFAULT_CHUNK_LIMIT_BYTES = 500_000;
const DEFAULT_TOTAL_LIMIT_BYTES = 2_000_000;
const rawChunkLimit = Number.parseInt(process.env.BUNDLE_CHUNK_LIMIT_BYTES ?? "", 10);
const rawTotalLimit = Number.parseInt(process.env.BUNDLE_TOTAL_LIMIT_BYTES ?? "", 10);
const chunkLimitBytes = Number.isFinite(rawChunkLimit) && rawChunkLimit > 0 ? rawChunkLimit : DEFAULT_CHUNK_LIMIT_BYTES;
const totalLimitBytes = Number.isFinite(rawTotalLimit) && rawTotalLimit > 0 ? rawTotalLimit : DEFAULT_TOTAL_LIMIT_BYTES;

const heavyRuntimeDependencies = new Set([
  "@mui/material",
  "antd",
  "chart.js",
  "d3",
  "date-fns",
  "lodash",
  "moment",
  "recharts",
]);

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kib = bytes / 1024;
  if (kib < 1024) return `${kib.toFixed(1)} KiB`;
  return `${(kib / 1024).toFixed(2)} MiB`;
}

function walkFiles(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walkFiles(fullPath, out);
      continue;
    }
    out.push(fullPath);
  }
}

const root = process.cwd();
const findings: Finding[] = [];
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
};

const runtimeDependencies = Object.keys(packageJson.dependencies ?? {});
for (const dependency of runtimeDependencies) {
  if (heavyRuntimeDependencies.has(dependency)) {
    findings.push({
      name: "heavy_dependency",
      detail: `${dependency} is on the heavy dependency watchlist. Add a specific budget exception before using it.`,
    });
  }
}

if (runtimeDependencies.length > 12) {
  findings.push({
    name: "runtime_dependency_count",
    detail: `${runtimeDependencies.length} runtime dependencies exceeds the budget of 12 direct dependencies.`,
  });
}

const staticDir = path.join(root, ".next", "static");
const files: string[] = [];
walkFiles(staticDir, files);
const jsFiles = files.filter((file) => file.endsWith(".js"));
const totalJsBytes = jsFiles.reduce((sum, file) => sum + statSync(file).size, 0);

for (const file of jsFiles) {
  const bytes = statSync(file).size;
  if (bytes > chunkLimitBytes) {
    findings.push({
      name: "chunk_budget",
      detail: `${path.relative(root, file).replaceAll("\\", "/")} is ${formatBytes(bytes)}, above ${formatBytes(
        chunkLimitBytes,
      )}.`,
    });
  }
}

if (jsFiles.length > 0 && totalJsBytes > totalLimitBytes) {
  findings.push({
    name: "total_bundle_budget",
    detail: `Static JS total is ${formatBytes(totalJsBytes)}, above ${formatBytes(totalLimitBytes)}.`,
  });
}

if (findings.length > 0) {
  console.error("[bundle-size-check] Bundle or dependency budget findings:");
  for (const finding of findings) {
    console.error(`- ${finding.name}: ${finding.detail}`);
  }
  process.exit(1);
}

const artifactMessage =
  jsFiles.length > 0
    ? `Static JS total ${formatBytes(totalJsBytes)} across ${jsFiles.length} file(s).`
    : "No .next/static JavaScript artifacts found, dependency budget only.";

console.log(`[bundle-size-check] OK. ${artifactMessage}`);
