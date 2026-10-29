import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { createV3User, signInAs } from "./helpers/v3-user";

/*
 * The bottom of a phone page never clips: scrolled to the end, the page's tail
 * is taller than the fog under the dock, so the last row ends above it.
 * The screenshot goes to test-results/phone-dock-bottom (uploaded with the e2e
 * report) so the bottom of the page can be looked at.
 */
const OUT = path.join("test-results", "phone-dock-bottom");

test("phone page ends above the fog under the dock", async ({ browser }) => {
  test.setTimeout(120_000);
  await mkdir(OUT, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const user = await createV3User("phone-dock-bottom");
  await signInAs(page, user);
  await context.addCookies([
    {
      name: "needt-ui",
      value: "phone",
      url: process.env.TEST_BASE_URL ?? "http://localhost:3000",
    },
  ]);
  await page.goto("/today");
  await page.locator('.needt-v3[data-ui="phone"]').waitFor();
  await expect(page.locator(".nva-add")).toBeVisible({ timeout: 30_000 });

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const room = await page.evaluate(() => {
    const tail = document.querySelector(".pk-tail");
    const fog = document.querySelector(".pk-fog");
    return {
      tail: tail ? tail.getBoundingClientRect().height : -1,
      fog: fog
        ? parseFloat(getComputedStyle(fog).getPropertyValue("--ps-fog-h"))
        : -1,
    };
  });
  expect(room.fog).toBeGreaterThan(0);
  expect(room.tail).toBeGreaterThanOrEqual(room.fog + 16);
  await page.screenshot({ path: path.join(OUT, "bottom.png") });
  await context.close();
});
