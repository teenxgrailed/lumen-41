import { type Page, expect, test } from "@playwright/test";

import { VISUAL_TEST_NOW } from "./fixtures";
import { signInVisualUser } from "./helpers";

/*
 * Settings -> Desktop (the Mac app's group): the five sections in light and
 * dark as the Mac app shows them, the island read-only on Free, and the
 * one-row "These settings live in the Mac app" in a browser tab. The Mac app is
 * simulated with `window.__needtNative` (what the Swift shell sets).
 */
const SECTIONS = [
  ["app", "App"],
  ["island", "Island"],
  ["mfocus", "Focus"],
  ["widgets", "Widgets"],
  ["siri", "Siri & Shortcuts"],
] as const;

function title(page: Page, name: string) {
  return page
    .getByRole("dialog", { name: "Settings" })
    .getByRole("banner")
    .getByText(name, { exact: true });
}

async function settle(page: Page) {
  await page.addStyleTag({
    content:
      'nextjs-portal, .tsqd-parent-container, aside[aria-label="Quick Tip"] { display: none !important; }',
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await expect(page.locator(".animate-pulse, .glass-skeleton")).toHaveCount(0, {
    timeout: 15_000,
  });
  await page.waitForTimeout(350);
}

async function prepare(
  page: Page,
  opts: { theme: "dark" | "light"; mac: boolean; plan?: "FREE" | "PRO" }
) {
  await page.clock.setFixedTime(new Date(VISUAL_TEST_NOW));
  await page.addInitScript((mac) => {
    localStorage.setItem("needt:quick-tip:last-shown-at", "9999999999999");
    localStorage.setItem("needt-visit-count", "0");
    if (mac)
      (window as unknown as { __needtNative: object }).__needtNative = {};
  }, opts.mac);
  await page.emulateMedia({ colorScheme: opts.theme, reducedMotion: "reduce" });
  await page.route("**/api/ai-settings", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ hostedAvailable: true, hasApiKey: false }),
    });
  });
  if (opts.plan) {
    await page.route("**/api/billing", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          configured: true,
          plan: opts.plan,
          status: "ACTIVE",
          interval: opts.plan === "PRO" ? "year" : null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          canManageBilling: false,
          usage: {
            calendars: { used: 0, limit: 1 },
            autoScheduledTasks: { used: 0, limit: 15 },
            boards: { used: 1, limit: 1 },
            mailboxes: { used: 1, limit: 0 },
            aiActions: { used: 0, limit: 0 },
          },
        }),
      });
    });
  }
  await signInVisualUser(page);
  const res = await page.request.patch("/api/user-settings", {
    data: { theme: opts.theme },
  });
  expect(res.ok()).toBeTruthy();
}

for (const theme of ["dark", "light"] as const) {
  test(`Settings Desktop sections, Mac app, ${theme}`, async ({ page }) => {
    test.setTimeout(240_000);
    await prepare(page, { theme, mac: true, plan: "PRO" });
    for (const [id, name] of SECTIONS) {
      await page.goto(`/settings#${id}`, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/today$/);
      await expect(title(page, name)).toBeVisible();
      await settle(page);
      await expect(page).toHaveScreenshot(
        `settings-desktop-${id}-${theme}.png`
      );
    }
  });
}

test("Settings Desktop island is read-only on Free", async ({ page }) => {
  await prepare(page, { theme: "dark", mac: true, plan: "FREE" });
  await page.goto("/settings#island", { waitUntil: "domcontentloaded" });
  await expect(title(page, "Island")).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Show the island" })
  ).toBeDisabled();
  await expect(page.getByRole("switch", { name: "Today tab" })).toBeDisabled();
  await settle(page);
  await expect(page).toHaveScreenshot("settings-desktop-island-free-dark.png");
});

test("Settings Desktop outside the Mac app is one row", async ({ page }) => {
  await prepare(page, { theme: "light", mac: false, plan: "PRO" });
  await page.goto("/settings#island", { waitUntil: "domcontentloaded" });
  await expect(title(page, "Island")).toBeVisible();
  await expect(
    page.getByText("These settings live in the Mac app")
  ).toBeVisible();
  await expect(page.getByRole("switch")).toHaveCount(0);
  await settle(page);
  await expect(page).toHaveScreenshot("settings-desktop-web-light.png");
});
