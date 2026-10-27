import { type Page, expect, test } from "@playwright/test";

import { VISUAL_TEST_NOW } from "./fixtures";
import { signInVisualUser } from "./helpers";

/*
 * List-style pages fill the window. Tasks and Docs used to stop at a 1240 px
 * column, which left a wide empty strip on the right of a 2000 px window. At
 * 1440 and 2000 px the content now ends one gutter (--v3-gutter on top of the
 * shell's 20 px) before the right edge, and the shots pin it.
 */
test.skip(
  ({ viewport }) => (viewport?.width ?? 0) < 1024,
  "Desktop widths only; the window is resized per case."
);
test.use({ serviceWorkers: "block" });

const WIDTHS = [1440, 2000] as const;

async function prepare(page: Page, width: number) {
  await page.setViewportSize({ width, height: 1000 });
  await page.clock.setFixedTime(new Date(VISUAL_TEST_NOW));
  await page.addInitScript(() => {
    localStorage.setItem("needt:quick-tip:last-shown-at", "9999999999999");
    localStorage.setItem("needt-visit-count", "0");
  });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await signInVisualUser(page);
  await page.route("**/api/starter-game", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            hiddenUntil: null,
            neverShow: true,
            hidden: true,
            openTasks: 0,
            eligible: false,
            canPlay: true,
          }),
        })
      : route.continue()
  );
  const res = await page.request.patch("/api/user-settings", {
    data: { theme: "light" },
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

/** The content's right edge sits within one gutter of the window, not 1240 px in. */
async function expectFillsWidth(page: Page, selector: string, width: number) {
  const box = await page.locator(selector).first().boundingBox();
  expect(box).toBeTruthy();
  const right = (box?.x ?? 0) + (box?.width ?? 0);
  expect(right).toBeGreaterThan(width - 60);
  expect(right).toBeLessThanOrEqual(width);
}

/**
 * The last row column ends where the header tabs end. The list's own scrollbar
 * (if it takes layout space) is allowed for; everything else must be within 8 px.
 */
async function expectRowsAlignWithHeader(page: Page) {
  const gap = await page.evaluate(() => {
    const tabs = document.querySelector(".wk-tabs");
    const scroll = document.querySelector<HTMLElement>(".wk-scroll");
    const cells = Array.from(
      document.querySelectorAll(".wk-screen .tk-cell-proj")
    );
    if (!tabs || !scroll || !cells.length) return null;
    const cell = cells.find((c) => c.querySelector(".tk-ellip")) ?? cells[0];
    const range = document.createRange();
    range.selectNodeContents(cell);
    const content = range.getBoundingClientRect();
    const right = content.width
      ? content.right
      : cell.getBoundingClientRect().right;
    const bar = scroll.offsetWidth - scroll.clientWidth;
    return tabs.getBoundingClientRect().right - bar - right;
  });
  expect(gap).not.toBeNull();
  expect(Math.abs(gap ?? 999)).toBeLessThanOrEqual(8);
}

for (const width of WIDTHS) {
  test(`Tasks fills the window at ${width} px`, async ({ page }) => {
    await prepare(page, width);
    await page.goto("/tasks", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".wk-screen")).toBeVisible({ timeout: 20_000 });
    await expectFillsWidth(page, ".wk-screen", width);
    await expectRowsAlignWithHeader(page);
    await settle(page);
    await expect(page).toHaveScreenshot(`list-width-tasks-${width}.png`);
  });

  test(`Docs fills the window at ${width} px`, async ({ page }) => {
    await prepare(page, width);
    await page.goto("/pages", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-v3-screen="docs"]')).toBeVisible({
      timeout: 20_000,
    });
    await expectFillsWidth(page, '[data-v3-screen="docs"]', width);
    await settle(page);
    await expect(page).toHaveScreenshot(`list-width-docs-${width}.png`);
  });
}
