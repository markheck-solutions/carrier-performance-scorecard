import { spawnSync } from "node:child_process";
import path from "node:path";
import { performance } from "node:perf_hooks";

const DEFAULT_BUDGET_MS = 240_000;
const rawBudget = Number.parseInt(process.env.BUILD_PERFORMANCE_BUDGET_MS ?? "", 10);
const budgetMs = Number.isFinite(rawBudget) && rawBudget > 0 ? rawBudget : DEFAULT_BUDGET_MS;

const nextCli = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const start = performance.now();
const result = spawnSync(process.execPath, [nextCli, "build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: "1",
  },
});
const elapsedMs = Math.round(performance.now() - start);

if (result.error) {
  console.error(`[build-performance-check] Failed to start build: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`[build-performance-check] Build failed after ${elapsedMs} ms.`);
  process.exit(result.status ?? 1);
}

if (elapsedMs > budgetMs) {
  console.error(`[build-performance-check] Build took ${elapsedMs} ms, above budget ${budgetMs} ms.`);
  process.exit(1);
}

console.log(`[build-performance-check] OK. Build completed in ${elapsedMs} ms within budget ${budgetMs} ms.`);
