/* Screenshots for the redesign port only: reuses an already running local dev
   server (TEST_BASE_URL) instead of starting one. */
import { defineConfig } from "@playwright/test";

import base from "./playwright.config";

export default defineConfig({
  ...base,
  testMatch: ["redesign-shots.spec.ts"],
  reporter: "line",
  retries: 0,
  webServer: undefined,
});
