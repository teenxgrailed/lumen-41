import { type Page, expect, test } from "@playwright/test";

import { VISUAL_TEST_NOW } from "./fixtures";
import { signInVisualUser } from "./helpers";

/*
 * Connections' first-visit setup: an account with nothing connected opens on
 * step 1, "Connect your day", over the screen's own sky. Accounts and mail are
 * fixtures (none), so the shot does not depend on the CI database.
 */
async function prepare(page: Page, theme: "dark" | "light") {
  await page.clock.setFixedTime(new Date(VISUAL_TEST_NOW));
  await page.addInitScript(() => {
    localStorage.setItem("needt:quick-tip:last-shown-at", "9999999999999");
    localStorage.setItem("needt-visit-count", "0");
    localStorage.removeItem("needt.cnSetup");
    sessionStorage.removeItem("needt.cnSetupRun");
  });
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  const json = (body: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
  await page.route("**/api/ai-settings", (r) =>
    r.fulfill(json({ hostedAvailable: true, hasApiKey: false }))
  );
  await page.route("**/api/accounts", (r) =>
    r.request().method() === "GET" ? r.fulfill(json([])) : r.continue()
  );
  await page.route("**/api/mail/accounts", (r) =>
    r.request().method() === "GET"
      ? r.fulfill(json({ accounts: [] }))
      : r.continue()
  );
  await page.route("**/api/integrations/catalog", async (r) => {
    const response = await r.fetch();
    const body = (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    // Nothing connected: the catalogue as served, its connections emptied.
    await r.fulfill({ response, json: { ...(body ?? {}), connections: [] } });
  });
  await signInVisualUser(page);
  const themeResponse = await page.request.patch("/api/user-settings", {
    data: { theme },
  });
  expect(themeResponse.ok()).toBeTruthy();
}

async function settle(page: Page) {
  await page.addStyleTag({
    content:
      'nextjs-portal, .tsqd-parent-container, aside[aria-label="Quick Tip"] { display: none !important; }',
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
  });
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
}

for (const theme of ["light", "dark"] as const) {
  test(`Connections setup, step 1, ${theme}`, async ({ page }) => {
    await prepare(page, theme);
    await page.goto("/connections");
    await expect(page.locator("[data-cs-setup='1']")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Connect your day")).toBeVisible();
    await expect(page.locator("[data-cs-tile]").first()).toBeVisible();
    await settle(page);
    await expect(page).toHaveScreenshot(`connections-setup-1-${theme}.png`);
  });
}

test("Connections setup, step 2", async ({ page }) => {
  await prepare(page, "light");
  await page.goto("/connections");
  await expect(page.locator("[data-cs-continue]")).toBeVisible({
    timeout: 20_000,
  });
  // The default picks depend on which providers this server has set up.
  if (await page.locator("[data-cs-continue]").isDisabled())
    await page.locator("[data-cs-tile]").first().click();
  await page.locator("[data-cs-continue]").click();
  await expect(page.locator("[data-cs-setup='2']")).toBeVisible();
  await settle(page);
  await expect(page).toHaveScreenshot("connections-setup-2.png");
});
