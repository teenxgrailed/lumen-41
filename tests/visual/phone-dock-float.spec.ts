import { expect, test } from "@playwright/test";

import { signInVisualUser } from "./helpers";

/*
 * The floating bottom bar (`prefs.barStyle = "float"`) on a 390-px phone: a
 * capsule of round raised buttons, the place you are in a dark pill with its
 * name (owner ref, 2026-11-22). One shot of the bar's strip per active slot,
 * light and dark. The default bar is shot with every phone screen already;
 * this spec only covers the second look.
 */
test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "mobile", "390-px phone shots run once");
});

const STATES = [
  { tag: "home", route: "/today", label: "Home" },
  { tag: "docs", route: "/docs", label: "Docs" },
  { tag: "more", route: "/habits", label: "More" },
] as const;

for (const theme of ["light", "dark"] as const) {
  for (const state of STATES) {
    test(`floating bar, ${state.tag}, ${theme}`, async ({ page }) => {
      await signInVisualUser(page);
      const set = await page.request.patch("/api/user-settings", {
        data: { theme, prefs: { barStyle: "float" } },
      });
      expect(set.ok()).toBeTruthy();
      // reduced motion drops the slot transitions, so the frame is the resting state
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(state.route);
      const bar = page.locator(".nfb-pill");
      await expect(bar).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(".nfb-label")).toHaveText(state.label);
      await page.addStyleTag({
        content:
          'nextjs-portal, .tsqd-parent-container, aside[aria-label="Quick Tip"] { display: none !important; }',
      });
      await page.evaluate(() => document.fonts.ready);
      // the strip the bar stands in, shadow included
      const box = await bar.boundingBox();
      expect(box).not.toBeNull();
      await expect(page).toHaveScreenshot(
        `float-bar-${state.tag}-${theme}.png`,
        {
          clip: { x: 0, y: box!.y - 24, width: 390, height: box!.height + 56 },
        }
      );
    });
  }
}
