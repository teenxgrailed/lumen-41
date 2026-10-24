import { type Page, expect, test } from "@playwright/test";

import { VISUAL_TEST_NOW } from "./fixtures";
import { signInVisualUser } from "./helpers";

/*
 * What's new: the changelog feed in its sheet, in light and dark. On the
 * desktop it opens from the account menu (the avatar carries the dot while
 * something is unopened); on the phone from Settings → About, in a sheet over
 * Settings. The feed is a fixture, so the shots do not move with every
 * changelog fragment a pull request adds.
 */
const FEED = {
  groups: [
    {
      date: "2026-07-15",
      entries: [
        {
          id: "pages-export-1",
          text: "Pages can be exported as Markdown and PDF from the page menu.",
        },
        {
          id: "board-share-1",
          text: "A board can be shared by link; people with the link see it read-only.",
        },
        {
          id: "phone-dock-1",
          text: "Phone: the dock stands 30 px above the display edge in an installed app.",
        },
      ],
    },
    {
      date: "2026-07-02",
      entries: [
        {
          id: "habits-free-1",
          text: "Free keeps up to three habits; Pro has no limit.",
        },
        {
          id: "focus-end-1",
          text: "Focus can end early from the timer, and the rest of the block goes back to the day.",
        },
      ],
    },
  ],
  unseen: ["pages-export-1", "board-share-1", "phone-dock-1"],
  marker: {
    date: "2026-07-15",
    ids: ["pages-export-1", "board-share-1", "phone-dock-1"],
  },
};

async function prepare(page: Page, theme: "dark" | "light") {
  await page.clock.setFixedTime(new Date(VISUAL_TEST_NOW));
  await page.addInitScript(() => {
    localStorage.setItem("needt:quick-tip:last-shown-at", "9999999999999");
    localStorage.setItem("needt-visit-count", "0");
  });
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await page.route("**/api/ai-settings", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ hostedAvailable: true, hasApiKey: false }),
    });
  });
  await signInVisualUser(page);
  // After signInVisualUser, so it wins over the helper's empty feed.
  await page.route("**/api/whats-new", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(FEED),
    });
  });
  const res = await page.request.patch("/api/user-settings", {
    data: { theme },
  });
  expect(res.ok()).toBeTruthy();
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
  await page.waitForTimeout(350);
}

for (const theme of ["dark", "light"] as const) {
  test(`What's new from the account menu, ${theme}`, async ({ page }) => {
    test.skip(
      (page.viewportSize()?.width ?? 0) < 1024,
      "The account menu is the desktop sidebar's."
    );
    await prepare(page, theme);
    await page.goto("/today", { waitUntil: "domcontentloaded" });

    const profile = page.locator("[data-sb-profile]");
    await expect(profile.locator("[data-sb-news-dot]")).toBeVisible();
    await profile.click();
    const menu = page.getByRole("menu", { name: "Account" });
    await expect(menu.getByRole("menuitem", { name: "Help" })).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: "Keyboard shortcuts" })
    ).toBeVisible();
    await menu.getByRole("menuitem", { name: "What's new" }).click();

    const sheet = page.getByRole("dialog", { name: "What's new in Needt" });
    await expect(sheet.getByText("15 Jul 2026")).toBeVisible();
    await expect(sheet.locator("[data-wn-new]")).toHaveCount(3);
    // Opening it records the newest day as seen: the avatar's dot goes.
    await expect(profile.locator("[data-sb-news-dot]")).toHaveCount(0);
    await settle(page);
    await expect(sheet).toHaveScreenshot(`whats-new-desktop-${theme}.png`);
  });

  test(`What's new from phone Settings, ${theme}`, async ({ page }) => {
    test.skip(
      (page.viewportSize()?.width ?? 0) >= 768,
      "The phone opens it from its Settings sheet."
    );
    await prepare(page, theme);
    await page.goto("/settings#about", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/today$/);

    const open = page.locator("[data-ps-news-open]");
    await expect(open).toBeVisible();
    await expect(
      page.getByRole("dialog", { name: "Settings" }).getByText("Help", {
        exact: true,
      })
    ).toBeVisible();
    await open.click();

    const sheet = page.getByRole("dialog", { name: "What's new" });
    await expect(sheet.locator("[data-ps-news]")).toBeVisible();
    await expect(sheet.locator("[data-wn-new]")).toHaveCount(3);
    await settle(page);
    await expect(page).toHaveScreenshot(`whats-new-phone-${theme}.png`);
  });
}
