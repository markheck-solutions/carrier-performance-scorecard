import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [
        ["list"],
        ["json", { outputFile: "test-results/playwright-results.json" }],
        ["junit", { outputFile: "test-results/playwright-junit.xml" }],
        ["html", { open: "never", outputFolder: "playwright-report" }],
      ]
    : "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  workers: 1,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
