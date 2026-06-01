import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    clearMocks: true,
    retry: process.env.CI ? 1 : 0,
    reporters: process.env.CI ? ["default", "junit"] : ["default"],
    outputFile: process.env.CI ? { junit: "./test-results/vitest-junit.xml" } : undefined,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "./coverage",
      all: true,
      include: ["src/**/*.{ts,tsx}", "scripts/**/*.ts"],
      exclude: [
        "src/app/layout.tsx",
        "src/app/loading.tsx",
        "src/app/error.tsx",
        "src/**/*.d.ts",
        "scripts/db-seed.ts",
        "scripts/quality/**/*.ts",
      ],
      thresholds: {
        lines: 25,
        functions: 25,
        branches: 20,
        statements: 25,
      },
    },
  },
});
