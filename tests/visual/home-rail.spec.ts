import { type Page, expect, test } from "@playwright/test";

import { signInVisualUser } from "./helpers";

/* Desktop Home on a wide window: the content runs from the sidebar to the
 * right edge with one gutter each side, the main column stretches, and ONE
 * 360 px rail (Today, Habits, This week, Schedule, Inbox) holds every tile at
 * the same width with aligned edges, its top level with the focus card. */

test.skip(
  ({ viewport }) => (viewport?.width ?? 0) < 1024,
  "Desktop face only."
);
test.use({ serviceWorkers: "block" });

const NOW = "2026-07-16T14:00:00+02:00";

async function openHome(page: Page, width: number) {
  await page.setViewportSize({ width, height: 1000 });
  await page.clock.setFixedTime(new Date(NOW));
  await page.addInitScript(() => {
    localStorage.setItem("needt:quick-tip:last-shown-at", "9999999999999");
    localStorage.setItem("needt-visit-count", "0");
  });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await signInVisualUser(page);
  await page.goto("/today");
  await page.addStyleTag({
    content:
      'nextjs-portal, .tsqd-parent-container, aside[aria-label="Quick Tip"] { display: none !important; }',
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await expect(page.locator("aside.hd-rail")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(350);
}

for (const width of [1440, 2000]) {
  test(`Home keeps one rail of equal tiles at ${width}px`, async ({ page }) => {
    await openHome(page, width);

    const boxes = await page.evaluate(() => {
      const rail = document.querySelector("aside.hd-rail") as HTMLElement;
      const r = rail.getBoundingClientRect();
      const tiles = [...rail.querySelectorAll(":scope > *, :scope > * > *")]
        .filter((el) => getComputedStyle(el).display !== "contents")
        .filter(
          (el) =>
            el.matches(
              "[data-ha-today], [data-ha-habits], .ha-week, .ha-sched, .hd-inbox, .nd-card"
            ) || el.parentElement === rail
        )
        .map((el) => {
          const b = el.getBoundingClientRect();
          return { left: b.left, width: b.width, right: b.right };
        });
      const card = document.querySelector(".hd-cards")!.getBoundingClientRect();
      return {
        rail: { left: r.left, width: r.width, right: r.right, top: r.top },
        tiles,
        cardTop: card.top,
        cardLeft: card.left,
        winWidth: window.innerWidth,
      };
    });

    expect(boxes.rail.width).toBeCloseTo(360, 0);
    expect(boxes.tiles.length).toBeGreaterThanOrEqual(3);
    for (const t of boxes.tiles) {
      expect(t.width).toBeCloseTo(boxes.rail.width, 0);
      expect(t.left).toBeCloseTo(boxes.rail.left, 0);
      expect(t.right).toBeCloseTo(boxes.rail.right, 0);
    }
    // top-aligned with the focus card; flush with the right gutter
    expect(boxes.rail.top).toBeCloseTo(boxes.cardTop, 0);
    // the 44 px gutter (plus the thin scrollbar), not the old wide margin
    expect(boxes.winWidth - boxes.rail.right).toBeGreaterThanOrEqual(36);
    expect(boxes.winWidth - boxes.rail.right).toBeLessThanOrEqual(64);

    await expect(page).toHaveScreenshot(`home-rail-${width}.png`, {
      animations: "disabled",
    });
  });
}
