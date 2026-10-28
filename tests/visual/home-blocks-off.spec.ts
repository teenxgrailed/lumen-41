import { type Page, expect, test } from "@playwright/test";

import { signInVisualUser } from "./helpers";

/* Desktop Home with every right-rail tile switched off ("Show on Home" in the
 * gear): the rail is not drawn and the main column takes the full width. The
 * setting is `prefs.homeBlocks`, written through the public settings API. */

test.skip(
  ({ viewport }) => (viewport?.width ?? 0) < 1024,
  "Desktop face only."
);
test.use({ serviceWorkers: "block" });

const NOW = "2026-07-16T14:00:00+02:00";

async function setBlocks(page: Page, homeBlocks: Record<string, unknown>) {
  const cur = await page.request.get("/api/user-settings");
  const prefs = ((await cur.json()) as { prefs?: Record<string, unknown> })
    .prefs;
  const next = { ...(prefs ?? {}) };
  if (Object.keys(homeBlocks).length) next.homeBlocks = homeBlocks;
  else delete next.homeBlocks;
  const res = await page.request.patch("/api/user-settings", {
    data: { prefs: next },
  });
  expect(res.ok()).toBe(true);
}

test.afterEach(async ({ page }) => {
  await setBlocks(page, {});
});

test("Home with every rail tile off has no rail and a full-width column", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.clock.setFixedTime(new Date(NOW));
  await page.addInitScript(() => {
    localStorage.setItem("needt:quick-tip:last-shown-at", "9999999999999");
    localStorage.setItem("needt-visit-count", "0");
  });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await signInVisualUser(page);
  await setBlocks(page, {
    todayBar: false,
    habits: false,
    week: false,
    schedule: false,
    inbox: false,
  });
  await page.goto("/today");
  await page.addStyleTag({
    content:
      'nextjs-portal, .tsqd-parent-container, aside[aria-label="Quick Tip"] { display: none !important; }',
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await expect(page.locator(".hd-body")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(350);

  await expect(page.locator("aside.hd-rail")).toHaveCount(0);
  await expect(page.locator(".hd-body")).toHaveAttribute("data-hd-rail", "off");
  const w = await page.evaluate(() => {
    const body = document.querySelector(".hd-body")!.getBoundingClientRect();
    const col = document.querySelector(".hd-col")!.getBoundingClientRect();
    return { body: body.width, col: col.width };
  });
  expect(w.col).toBeCloseTo(w.body, 0);

  await expect(page).toHaveScreenshot("home-rail-off-1440.png", {
    animations: "disabled",
  });
});
