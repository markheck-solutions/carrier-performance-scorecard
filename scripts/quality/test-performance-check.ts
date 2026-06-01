import { spawnSync } from "node:child_process";
import path from "node:path";
import { performance } from "node:perf_hooks";

const DEFAULT_BUDGET_MS = 180_000;
const rawBudget = Number.parseInt(process.env.TEST_PERFORMANCE_BUDGET_MS ?? "", 10);
const budgetMs = Number.isFinite(rawBudget) && rawBudget > 0 ? rawBudget : DEFAULT_BUDGET_MS;

const vitestCli = path.join(process.cwd(), "node_modules", "vitest", "vitest.mjs");
const start = performance.now();
const result = spawnSync(process.execPath, [vitestCli, "--run"], {
  stdio: "inherit",
  env: {
    ...process.env,
    CI: process.env.CI ?? "true",
  },
});
const elapsedMs = Math.round(performance.now() - start);

if (result.error) {
  console.error(`[test-performance-check] Failed to start test run: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`[test-performance-check] Tests failed after ${elapsedMs} ms.`);
  process.exit(result.status ?? 1);
}

if (elapsedMs > budgetMs) {
  console.error(`[test-performance-check] Tests took ${elapsedMs} ms, above budget ${budgetMs} ms.`);
  process.exit(1);
}

console.log(`[test-performance-check] OK. Tests completed in ${elapsedMs} ms within budget ${budgetMs} ms.`);
