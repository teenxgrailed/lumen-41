import { defineConfig, devices } from "@playwright/test";

import { configureE2eEnvironment } from "./tests/e2e/environment";

/*
 * Performance baseline. CI only (.github/workflows/perf.yml): it runs against
 * the production build, and absolute numbers on a shared runner mean little,
 * so compare a run only with another run of the same workflow.
 */
configureE2eEnvironment();

const baseURL = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const productionServerCommand = `${JSON.stringify(
  process.execPath
)} ./node_modules/next/dist/bin/next start`;

export default defineConfig({
  testDir: "./tests/perf",
  testMatch: "**/*.perf.spec.ts",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 240_000,
  outputDir: "perf/test-results",
  use: {
    baseURL,
    colorScheme: "dark",
    locale: "en-US",
    timezoneId: "Europe/Zurich",
    serviceWorkers: "block",
    navigationTimeout: 60_000,
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        launchOptions: { args: ["--no-sandbox", "--disable-dev-shm-usage"] },
      },
    },
    {
      name: "iphone13-chromium",
      use: {
        // iPhone 13 geometry, touch and user agent, on Chromium.
        ...devices["iPhone 13"],
        defaultBrowserType: "chromium",
        launchOptions: { args: ["--no-sandbox", "--disable-dev-shm-usage"] },
      },
    },
    {
      name: "iphone13-webkit",
      use: { ...devices["iPhone 13"], defaultBrowserType: "webkit" },
    },
  ],
  webServer: {
    command: productionServerCommand,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      ...process.env,
      NEXTAUTH_URL: baseURL,
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || "needt-perf-only-secret",
      RATE_LIMIT_HASH_SECRET:
        process.env.RATE_LIMIT_HASH_SECRET || "needt-perf-rate-limit-secret",
    },
  },
});
