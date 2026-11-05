import { defineConfig } from "@playwright/test";

import { configureE2eEnvironment } from "./tests/e2e/environment";
import { declinedConsentStorageState } from "./tests/helpers/consent";

configureE2eEnvironment();

const baseURL = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const useProductionServer = process.env.NEEDT_VISUAL_PRODUCTION_SERVER === "1";
const productionServerCommand = `${JSON.stringify(
  process.execPath
)} ./node_modules/next/dist/bin/next start`;
const snapshotPlatformSuffix =
  process.platform === "darwin" ? "" : "-{platform}";

export default defineConfig({
  testDir: "./tests/visual",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 120_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.005,
    },
  },
  globalSetup: "./tests/visual/global-setup.ts",
  globalTeardown: "./tests/visual/global-teardown.ts",
  snapshotPathTemplate: `{testDir}/{testFilePath}-snapshots/{arg}-{projectName}${snapshotPlatformSuffix}{ext}`,
  use: {
    baseURL,
    // A saved cookie choice keeps the banner out of every screenshot.
    storageState: declinedConsentStorageState(baseURL),
    colorScheme: "dark",
    locale: "en-US",
    timezoneId: "Europe/Zurich",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "desktop",
      use: { viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "tablet",
      use: { viewport: { width: 768, height: 1024 } },
    },
    {
      name: "mobile",
      use: { viewport: { width: 375, height: 812 } },
    },
  ],
  webServer: {
    // CI exercises the already-built production server. Long screenshot
    // matrices repeatedly compile most app routes and can exhaust the dev
    // server even with a single Playwright worker.
    command: useProductionServer ? productionServerCommand : "npm run dev",
    url: baseURL,
    reuseExistingServer: false,
    timeout: useProductionServer ? 60_000 : 120_000,
    env: {
      ...process.env,
      NEXTAUTH_URL: baseURL,
      NEXTAUTH_SECRET:
        process.env.NEXTAUTH_SECRET || "needt-visual-regression-secret",
    },
  },
});
