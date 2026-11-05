import { type Page, expect, test } from "@playwright/test";

import { VISUAL_TEST_NOW } from "./fixtures";
import { signInVisualUser } from "./helpers";

/*
 * Connections: Apps & services with a synced calendar and a mailbox that lost
 * access, the AI tools tab with two apps that signed in through Needt's OAuth,
 * and the Free promo. Accounts, apps and the plan are fixtures, so the shots
 * do not move with the CI database or the clock.
 */
const at = (minutesBefore: number) =>
  new Date(
    new Date(VISUAL_TEST_NOW).getTime() - minutesBefore * 60_000
  ).toISOString();

const ACCOUNTS = [
  {
    id: "a1",
    provider: "GOOGLE",
    email: "maks@example.com",
    calendars: [{ id: "c1", name: "Personal" }],
    needsReconnect: false,
    syncFailing: false,
    lastSync: at(12),
  },
];
const MAIL = {
  accounts: [
    {
      id: "m1",
      provider: "OUTLOOK",
      address: "maks@outlook.com",
      status: "ERROR",
      lastSyncAt: at(60 * 30),
    },
  ],
};
const APPS = {
  apps: [
    {
      id: "g1",
      clientName: "Claude",
      scopes: ["needt.read", "needt.write"],
      connectedAt: at(60 * 24 * 29),
      lastUsedAt: at(40),
    },
    {
      id: "g2",
      clientName: "Cursor",
      scopes: ["needt.read"],
      connectedAt: at(60 * 24 * 15),
      lastUsedAt: at(60 * 24),
    },
  ],
};
const billing = (plan: "PRO" | "FREE") => ({
  configured: true,
  plan,
  isTrial: false,
  trialEndsAt: null,
  status: "ACTIVE",
  interval: plan === "PRO" ? "month" : null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  canManageBilling: false,
  lifetimeAvailable: false,
  trialEligible: false,
});

async function prepare(page: Page, plan: "PRO" | "FREE") {
  await page.clock.setFixedTime(new Date(VISUAL_TEST_NOW));
  await page.addInitScript(() => {
    localStorage.setItem("needt:quick-tip:last-shown-at", "9999999999999");
    localStorage.setItem("needt-visit-count", "0");
  });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  const json = (body: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
  await page.route("**/api/ai-settings", (r) =>
    r.fulfill(json({ hostedAvailable: true, hasApiKey: false }))
  );
  await page.route("**/api/accounts", (r) =>
    r.request().method() === "GET" ? r.fulfill(json(ACCOUNTS)) : r.continue()
  );
  await page.route("**/api/mail/accounts", (r) =>
    r.request().method() === "GET" ? r.fulfill(json(MAIL)) : r.continue()
  );
  await page.route("**/api/billing", (r) => r.fulfill(json(billing(plan))));
  await page.route("**/api/oauth/connected-apps", (r) => r.fulfill(json(APPS)));
  await page.route("**/api/personal-tokens", (r) =>
    r.fulfill(json({ tokens: [] }))
  );
  await signInVisualUser(page);
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
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
  });
  await page.mouse.move(0, 0);
  await page.waitForTimeout(350);
}

async function openTab(page: Page, name: RegExp) {
  await page.getByRole("tab", { name }).first().click();
}

test("Connections: apps and services", async ({ page }) => {
  await prepare(page, "PRO");
  await page.goto("/connections");
  await openTab(page, /Apps & services/);
  await expect(page.getByText("maks@example.com").first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("maks@outlook.com").first()).toBeVisible();
  await settle(page);
  await expect(page).toHaveScreenshot("connections-apps.png");
});

test("Connections: AI tools with connected apps", async ({ page }) => {
  await prepare(page, "PRO");
  await page.goto("/connections");
  await openTab(page, /AI tools/);
  await expect(page.getByText("Connected apps").first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("Cursor").first()).toBeVisible();
  await settle(page);
  await expect(page).toHaveScreenshot("connections-ai.png");
});

test("Connections: AI tools on Free", async ({ page }) => {
  await prepare(page, "FREE");
  await page.goto("/connections");
  await openTab(page, /AI tools/);
  await expect(
    page.getByText("Bring Needt into your AI tools").first()
  ).toBeVisible({ timeout: 20_000 });
  await settle(page);
  await expect(page).toHaveScreenshot("connections-ai-free.png");
});
