import { expect, test } from "@playwright/test";

import { createV3User, signInAs } from "./helpers/v3-user";

/**
 * Ask Needt on the desktop is a right-hand panel docked like the left rail:
 * ⌘J opens it, the page narrows to make room (it is not an overlay), the
 * floating button steps away, Esc hands the focus back without closing it, and
 * a drag on its left edge resizes it.
 */
test("⌘J docks Ask on the right and the page gives up the width", async ({
  page,
}) => {
  const user = await createV3User("ask-dock");
  await signInAs(page, user);
  await page.goto("/");
  await page.locator('.needt-v3[data-ui="desktop"]').waitFor();

  const main = page.locator("main.shell-app-stack");
  const dock = page.locator("[data-chat-dock]");
  const before = (await main.boundingBox())!.width;
  await expect(dock).toHaveCSS("width", "0px");

  await page.keyboard.press("Control+KeyJ");
  const panel = page.locator("[data-chat-panel]");
  await expect(panel).toBeVisible();
  const open = (await dock.boundingBox())!.width;
  expect(open).toBeGreaterThan(250);
  await expect
    .poll(async () => (await main.boundingBox())!.width)
    .toBe(before - open);
  // One surface: the pill is away while the panel is up.
  await expect(page.locator('[data-corner="away"]')).toHaveCount(1);

  // Esc returns focus to the page and leaves the panel open.
  await page.keyboard.press("Escape");
  await expect(panel).toBeVisible();
  await expect(main).toBeFocused();

  // Drag the left edge 80px to the left: the panel grows by that much.
  const edge = page.locator("[data-chat-dock-edge]");
  const box = (await edge.boundingBox())!;
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 78, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect
    .poll(async () => Math.round((await dock.boundingBox())!.width))
    .toBeGreaterThan(open + 60);

  // It is remembered: reload and the panel is back at that width.
  const grown = Math.round((await dock.boundingBox())!.width);
  await page.reload();
  await expect(page.locator("[data-chat-panel]")).toBeVisible();
  await expect
    .poll(async () => Math.round((await dock.boundingBox())!.width))
    .toBe(grown);

  // ⌘J again closes it and the page gets the width back.
  await page.keyboard.press("Control+KeyJ");
  await expect(dock).toHaveCSS("width", "0px");
});
