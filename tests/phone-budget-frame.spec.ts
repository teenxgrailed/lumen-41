import { expect, test } from "@playwright/test";

import { prisma } from "@/lib/prisma";

import { createV3User, signInAs } from "./helpers/v3-user";

/*
 * Budget on the phone fills the screen above the menu pill. The frame is an
 * iframe, a replaced element: with `height: auto` it was 150px tall (15.11.26).
 * budget.needt.app is stubbed, the layout is what is checked.
 */
test("phone Budget frame fills the screen above the menu", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  await prisma.featureFlag.upsert({
    where: { key: "budget_module" },
    update: { enabled: true, rolloutPercentage: 100 },
    create: {
      key: "budget_module",
      enabled: true,
      rolloutPercentage: 100,
      description: "e2e",
    },
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  await context.route("https://budget.needt.app/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>Budget</title><body>Budget Home</body>",
    })
  );
  const user = await createV3User("phone-budget-frame");
  await signInAs(page, user);
  await context.addCookies([
    {
      name: "needt-ui",
      value: "phone",
      url: process.env.TEST_BASE_URL ?? "http://localhost:3000",
    },
  ]);
  await page.goto("/budget");
  await page.locator("[data-bd-promo-open]").click({ timeout: 30_000 });
  const frame = page.locator("[data-bd-frame]");
  await expect(frame).toBeVisible();
  const box = await frame.boundingBox();
  // Above the pill (84px) and the home indicator, nowhere near 150px.
  expect(box?.height ?? 0).toBeGreaterThan(844 - 84 - 40);
});
