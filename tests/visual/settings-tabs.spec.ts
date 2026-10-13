import { expect, test } from "@playwright/test";

import { VISUAL_TEST_NOW } from "./fixtures";
import { signInVisualUser } from "./helpers";

/*
 * Design v3: `/settings#section` opens the Settings sheet over Today (the
 * URL moves to /today), one section per hash. Calendars, integrations and AI
 * left Settings for Connections, so they are not tabs here any more.
 */
const SETTINGS_TABS = [
  ["account", "Account"],
  ["plan", "Plan & billing"],
  ["general", "General"],
  ["appearance", "Appearance"],
  ["day", "Your day"],
  ["tasks", "Tasks"],
  ["focus", "Focus"],
  ["alerts", "Notifications"],
  ["keys", "Shortcuts"],
  ["data", "Data & privacy"],
  ["about", "About"],
] as const;

/** The open section's title in the sheet's header (desktop h2, phone bar). */
function settingsSection(page: import("@playwright/test").Page, title: string) {
  return page
    .getByRole("dialog", { name: "Settings" })
    .getByRole("banner")
    .getByText(title, { exact: true });
}

async function settleSettings(page: import("@playwright/test").Page) {
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

async function prepareSettings(page: import("@playwright/test").Page) {
  await page.clock.setFixedTime(new Date(VISUAL_TEST_NOW));
  await page.addInitScript(() => {
    // Keep the delayed command-palette hint out of long screenshot matrices.
    // A far-future value remains valid across Playwright's fixed clock setup.
    localStorage.setItem("needt:quick-tip:last-shown-at", "9999999999999");
    localStorage.setItem("needt-visit-count", "0");
  });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await signInVisualUser(page, { design: "v3" });
  const themeResponse = await page.request.patch("/api/user-settings", {
    data: { theme: "dark" },
  });
  expect(themeResponse.ok()).toBeTruthy();
}

test("Billing stays visually consistent", async ({ page }) => {
  await page.route("**/api/billing", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        plan: "FREE",
        status: "ACTIVE",
        interval: null,
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
  await prepareSettings(page);
  await page.goto("/settings#billing", { waitUntil: "domcontentloaded" });
  // v3: the old #billing anchor opens Plan & billing in the sheet over Today.
  await expect(page).toHaveURL(/\/today$/);
  await expect(settingsSection(page, "Plan & billing")).toBeVisible();
  await expect(page.getByText("Your plan · Free")).toBeVisible();
  await settleSettings(page);
  await expect(page).toHaveScreenshot("settings-billing.png");
});

test("every Settings tab stays visually consistent", async ({ page }) => {
  test.setTimeout(360_000);
  await prepareSettings(page);

  for (const [tab, label] of SETTINGS_TABS) {
    await page.goto(`/settings#${tab}`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/today$/);
    await expect(settingsSection(page, label)).toBeVisible();

    await settleSettings(page);
    await expect(page).toHaveScreenshot(`settings-${tab}.png`);
  }
});

// //todo: v3 Notifications has no browser-push opt-in at all (its "Desktop
// notification" switches are the worker's columns), so there is no switch to
// disable and no "setup is incomplete" line. Bring this back when the v3
// section gets the push subscription the old NotificationSettings had.
test.fixme(
  "unavailable browser push stays honest in Settings",
  async ({ page }) => {
    await prepareSettings(page);
    await page.goto("/settings#notifications", {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveURL(/#notifications$/);
    await expect(
      page.locator("#settings-panel > h2").filter({ hasText: "Alerts" })
    ).toBeVisible();

    const browserNotifications = page
      .getByText("Browser notifications:", { exact: true })
      .locator("..")
      .getByRole("switch");
    await expect(browserNotifications).toBeDisabled();
    await expect(browserNotifications).toHaveAttribute("aria-checked", "false");
    await expect(
      page.getByText(
        "Push delivery setup is incomplete on this Needt server. Browser notifications are unavailable. Email reminders still work."
      )
    ).toBeVisible();

    await settleSettings(page);
    await expect(page).toHaveScreenshot("settings-notifications.png");
  }
);

test("Billing renders the failed-payment recovery path", async ({ page }) => {
  await page.route("**/api/billing", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        plan: "PRO",
        status: "PAYMENT_FAILED",
        interval: "month",
        currentPeriodEnd: "2099-09-01T00:00:00.000Z",
        cancelAtPeriodEnd: false,
        canManageBilling: true,
        usage: {
          calendars: { used: 2, limit: null },
          autoScheduledTasks: { used: 4, limit: null },
          boards: { used: 1, limit: null },
          mailboxes: { used: 1, limit: 3 },
          aiActions: { used: 3, limit: 250 },
        },
      }),
    });
  });
  await signInVisualUser(page, { design: "v3" });
  await page.goto("/settings#billing", { waitUntil: "domcontentloaded" });

  const failedPaymentAlert = page
    .getByRole("alert")
    .filter({ hasText: "Creem could not collect this payment." });
  await expect(failedPaymentAlert).toContainText(
    "Creem could not collect this payment."
  );
  await expect(failedPaymentAlert).toContainText(
    "Update your payment method in Manage billing."
  );
  await expect(
    page.getByRole("button", { name: "Manage billing" })
  ).toBeVisible();
});
