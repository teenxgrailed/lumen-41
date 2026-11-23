import { expect, test } from "@playwright/test";

import { createV3User, signInAs } from "./helpers/v3-user";

/**
 * The floating bottom bar (`prefs.barStyle = "float"`) on a phone: a capsule of
 * round buttons, the place you are in a dark pill holding its name. A tap on
 * another place moves the pill there (a transform, never a resize), the
 * capsule keeps its box, and the classic pill's icons stay out of sight.
 */
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test("the ink pill follows the place, the capsule keeps its box", async ({
  page,
}) => {
  const user = await createV3User("dock-float");
  await signInAs(page, user);
  const set = await page.request.patch("/api/user-settings", {
    data: { prefs: { barStyle: "float" } },
  });
  expect(set.ok()).toBeTruthy();

  await page.goto("/today");
  const capsule = page.locator(".nfb-pill");
  await expect(capsule).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".nfb-label")).toHaveText("Home");
  const box = (await capsule.boundingBox())!;
  const ink = page.locator(".nfb-ink");
  const inkBox = (await ink.boundingBox())!;

  // the capsule holds in the viewport with room at both edges
  expect(box.x).toBeGreaterThanOrEqual(16);
  expect(box.x + box.width).toBeLessThanOrEqual(390 - 16);

  await page.locator('[data-nfb-place="docs"]').tap();
  await expect(page).toHaveURL(/\/pages/, { timeout: 60_000 });
  await expect(page.locator(".nfb-label")).toHaveText("Docs");
  await expect(page.locator('[data-nfb-place="docs"]')).toHaveAttribute(
    "aria-current",
    "page"
  );
  await expect
    .poll(async () => (await ink.boundingBox())!.x)
    .toBeGreaterThan(inkBox.x + 20);
  const after = (await capsule.boundingBox())!;
  expect(after.width).toBeCloseTo(box.width, 0);
  expect((await ink.boundingBox())!.width).toBeCloseTo(inkBox.width, 0);

  // the classic pill's own icons draw nothing under the floating bar
  await expect(page.locator(".nva-icon").first()).toBeHidden();

  // a place the bar does not hold: the pill rests on the menu opener, "More"
  await page.goto("/habits");
  await expect(page.locator(".nfb-label")).toHaveText("More");
});
