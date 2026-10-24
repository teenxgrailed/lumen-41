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
  // A button left focused by the navigation (Account's "Sign out of all
  // devices" on the phone) would draw its focus ring into the shot.
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
  });
  await page.mouse.move(0, 0);
  await page.waitForTimeout(350);
}

/** The session's 30-day expiry, counted from the fixed test clock. */
const VISUAL_SESSION_EXPIRES = new Date(
  new Date(VISUAL_TEST_NOW).getTime() + 30 * 24 * 60 * 60 * 1000
).toISOString();

async function prepareSettings(page: import("@playwright/test").Page) {
  await page.clock.setFixedTime(new Date(VISUAL_TEST_NOW));
  await page.addInitScript(() => {
    // Keep the delayed command-palette hint out of long screenshot matrices.
    // A far-future value remains valid across Playwright's fixed clock setup.
    localStorage.setItem("needt:quick-tip:last-shown-at", "9999999999999");
    localStorage.setItem("needt-visit-count", "0");
  });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  // The Settings sheet opens over Today. CI has no hosted AI key, so Today's
  // "AI is temporarily unavailable" banner would show in some tab screenshots
  // and not others depending on when the read resolves. These shots are about
  // Settings, so AI is always available here.
  await page.route("**/api/ai-settings", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ hostedAvailable: true, hasApiKey: false }),
    });
  });
  // Account's "signed in until …" comes from the session's expiry, which the
  // server counts from its own clock; read it from the fixed test clock.
  await page.route("**/api/auth/session", async (route) => {
    const response = await route.fetch();
    const body = (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body || typeof body !== "object" || !("expires" in body)) {
      await route.fulfill({ response });
      return;
    }
    await route.fulfill({
      response,
      json: { ...body, expires: VISUAL_SESSION_EXPIRES },
    });
  });
  await signInVisualUser(page);
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

/*
 * Browser push in Settings → Notifications (desktop and phone): the "This
 * device" row says what the browser allows and offers only the button that
 * can work. The permission and the subscription are the browser's, so they are
 * set up here: `Notification.permission` is pinned, and for "granted" the
 * service worker registration hands back a stored subscription.
 */
type PushSetup = {
  permission: NotificationPermission;
  configured: boolean;
  subscribed?: boolean;
};

async function preparePush(
  page: import("@playwright/test").Page,
  setup: PushSetup
) {
  await page.addInitScript((s: PushSetup) => {
    Object.defineProperty(Notification, "permission", {
      configurable: true,
      get: () => s.permission,
    });
    if (!s.subscribed) return;
    const endpoint = "https://push.example.test/visual-device";
    const subscription = {
      endpoint,
      toJSON: () => ({ endpoint, keys: { p256dh: "p256dh", auth: "auth" } }),
      unsubscribe: async () => true,
    };
    const registration = {
      active: {},
      pushManager: {
        getSubscription: async () => subscription,
        subscribe: async () => subscription,
      },
    };
    Object.defineProperty(navigator.serviceWorker, "getRegistration", {
      configurable: true,
      value: async () => registration,
    });
  }, setup);
  await page.route("**/api/push-subscriptions", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: "{}",
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configured: setup.configured,
        publicKey: setup.configured ? "BFakeVisualVapidPublicKey" : null,
      }),
    });
  });
}

async function openNotifications(page: import("@playwright/test").Page) {
  await page.goto("/settings#alerts", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/today$/);
  await expect(settingsSection(page, "Notifications")).toBeVisible();
  return page.getByRole("dialog", { name: "Settings" });
}

test("browser push, permission not asked yet, offers to enable", async ({
  page,
}) => {
  await preparePush(page, { permission: "default", configured: true });
  await prepareSettings(page);
  const sheet = await openNotifications(page);
  await expect(sheet.getByText("Notifications on this device")).toBeVisible();
  await expect(
    sheet.getByRole("button", { name: "Enable notifications" })
  ).toBeEnabled();
  await settleSettings(page);
  await expect(page).toHaveScreenshot("settings-push-default.png");
});

test("browser push, permission granted, can test and turn off", async ({
  page,
}) => {
  await preparePush(page, {
    permission: "granted",
    configured: true,
    subscribed: true,
  });
  await prepareSettings(page);
  const sheet = await openNotifications(page);
  await expect(sheet.getByText("Notifications are on")).toBeVisible();
  await expect(
    sheet.getByRole("button", { name: "Send test notification" })
  ).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Turn off" })).toBeVisible();
  await settleSettings(page);
  await expect(page).toHaveScreenshot("settings-push-granted.png");
});

test("browser push, permission denied, says where to allow it", async ({
  page,
}) => {
  await preparePush(page, { permission: "denied", configured: true });
  await prepareSettings(page);
  const sheet = await openNotifications(page);
  await expect(sheet.getByText("Blocked in the browser")).toBeVisible();
  await expect(
    sheet.getByText(/Allow them in the site settings/)
  ).toBeVisible();
  await expect(
    sheet.getByRole("button", { name: "Enable notifications" })
  ).toHaveCount(0);
  await settleSettings(page);
  await expect(page).toHaveScreenshot("settings-push-denied.png");
});

test("unavailable browser push stays honest in Settings", async ({ page }) => {
  await preparePush(page, { permission: "default", configured: false });
  await prepareSettings(page);
  const sheet = await openNotifications(page);
  await expect(sheet.getByText("Not available on this server")).toBeVisible();
  await expect(
    sheet.getByText("Push delivery is not set up here yet.")
  ).toBeVisible();
  await expect(
    sheet.getByRole("button", { name: "Enable notifications" })
  ).toHaveCount(0);
});

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
  await signInVisualUser(page);
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
