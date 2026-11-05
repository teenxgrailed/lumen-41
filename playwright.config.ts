import { defineConfig, devices } from "@playwright/test";

import { configureE2eEnvironment } from "./tests/e2e/environment";
import { declinedConsentStorageState } from "./tests/helpers/consent";

configureE2eEnvironment();

const testBaseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";
const useProductionServer = process.env.NEEDT_E2E_PRODUCTION_SERVER === "1";
const productionServerCommand = `${JSON.stringify(
  process.execPath
)} ./node_modules/next/dist/bin/next start`;

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./tests",
  testIgnore: ["**/visual/**"],
  globalSetup: "./tests/e2e/global-setup.ts",
  /* Keep the shared local database and web-server fixture deterministic. */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* E2E reset/seed owns one PostgreSQL and Redis fixture per suite. */
  workers: 1,
  /* The suite runs against `next dev`, so the first hit on a route pays for its
   * compile. That regularly costs more than Playwright's 30s default. */
  timeout: 90_000,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: "html",
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: testBaseUrl,

    /* A saved cookie choice keeps the banner out of every screenshot. */
    storageState: declinedConsentStorageState(testBaseUrl),

    /* E2E route stubs must see requests before the production PWA worker. */
    serviceWorkers: "block",

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",
    navigationTimeout: 60_000,
    // Set viewport to a large size
    viewport: { width: 1920, height: 1080 },
    // Launch the browser maximized
    launchOptions: {
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    },
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1920, height: 1080 },
        launchOptions: {
          args: ["--no-sandbox", "--disable-dev-shm-usage"],
        },
      },
    },

    // {
    //   name: "firefox",
    //   use: { ...devices["Desktop Firefox"] },
    // },

    // {
    //   name: "webkit",
    //   use: { ...devices["Desktop Safari"] },
    // },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: useProductionServer
      ? productionServerCommand
      : "WATCHPACK_POLLING=true next dev",
    url: testBaseUrl,
    // E2E resets its own database and Redis state before every run. Reusing a
    // previous dev server can retain a different environment or exit midway
    // through the suite while Playwright still considers it ready.
    reuseExistingServer: false,
    timeout: useProductionServer ? 60_000 : 120_000,
    env: {
      ...process.env,
      RATE_LIMIT_HASH_SECRET:
        process.env.RATE_LIMIT_HASH_SECRET || "needt-e2e-rate-limit-secret",
    },
  },
});
