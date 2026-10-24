import { type Page, expect, test } from "@playwright/test";

import { VISUAL_TEST_NOW } from "./fixtures";
import { signInVisualUser } from "./helpers";

/*
 * The empty week. With no calendar connected and no event in view the
 * Calendar shows one card over the grid (desktop) or under the day (phone):
 * connect a calendar, or add an event. With a calendar connected and nothing
 * at all in the week it only says so. The feeds, events and tasks are
 * fixtures, so the shots do not depend on what the seed puts in the week.
 */
const GOOGLE_FEED = {
  id: "visual-feed-google",
  type: "GOOGLE",
  name: "Work",
  color: "#3b82f6",
  enabled: true,
};

type Case = "connect" | "quiet";

async function prepare(page: Page, theme: "dark" | "light", state: Case) {
  await page.clock.setFixedTime(new Date(VISUAL_TEST_NOW));
  await page.addInitScript(() => {
    localStorage.setItem("needt:quick-tip:last-shown-at", "9999999999999");
    localStorage.setItem("needt-visit-count", "0");
  });
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await signInVisualUser(page);
  const json = (body: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
  await page.route("**/api/feeds", (route) =>
    route.request().method() === "GET"
      ? route.fulfill(json(state === "quiet" ? [GOOGLE_FEED] : []))
      : route.continue()
  );
  await page.route("**/api/events", (route) =>
    route.request().method() === "GET"
      ? route.fulfill(json([]))
      : route.continue()
  );
  // The quiet hint is for a week with nothing in it, tasks included. The
  // phone is shot as a first run (no tasks yet), so the card sits right under
  // the day instead of below the fold.
  if (state === "quiet" || (page.viewportSize()?.width ?? 0) < 768) {
    await page.route("**/api/tasks", (route) =>
      route.request().method() === "GET"
        ? route.fulfill(json([]))
        : route.continue()
    );
  }
  // The starter game's card would sit on the same screen; it is not this spec.
  await page.route("**/api/starter-game", (route) =>
    route.request().method() === "GET"
      ? route.fulfill(
          json({
            hiddenUntil: null,
            neverShow: true,
            hidden: true,
            openTasks: 0,
            eligible: false,
            canPlay: true,
          })
        )
      : route.continue()
  );
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
  for (const state of ["connect", "quiet"] as const) {
    test(`Calendar empty week (${state}) on the desktop, ${theme}`, async ({
      page,
    }) => {
      test.skip(
        (page.viewportSize()?.width ?? 0) < 1024,
        "The desktop week grid; the phone has its own case."
      );
      await prepare(page, theme, state);
      await page.goto("/calendar", { waitUntil: "domcontentloaded" });

      const empty = page.locator(`[data-c2-empty="${state}"]`);
      await expect(empty).toBeVisible({ timeout: 20_000 });
      if (state === "connect") {
        await expect(
          empty.getByRole("link", { name: "Connect a calendar" })
        ).toHaveAttribute("href", "/connections");
        await expect(
          empty.getByRole("button", { name: "Add an event" })
        ).toBeVisible();
      } else {
        await expect(empty).toHaveText("Nothing this week");
      }
      await settle(page);
      await expect(page).toHaveScreenshot(
        `calendar-empty-${state}-desktop-${theme}.png`
      );

      if (state === "connect") {
        // Add an event opens the grid's own draft, and the card steps aside.
        await empty.getByRole("button", { name: "Add an event" }).click();
        await expect(page.locator("[data-c2-empty]")).toHaveCount(0);
      }
    });

    test(`Calendar empty week (${state}) on the phone, ${theme}`, async ({
      page,
    }) => {
      test.skip(
        (page.viewportSize()?.width ?? 0) >= 768,
        "The phone schedule; the desktop has its own case."
      );
      await prepare(page, theme, state);
      await page.goto("/calendar", { waitUntil: "domcontentloaded" });

      if (state === "connect") {
        const card = page.locator('[data-v2p-cal-empty="connect"]');
        await expect(card).toBeVisible({ timeout: 20_000 });
        await expect(
          card.getByRole("link", { name: "Connect a calendar" })
        ).toHaveAttribute("href", "/connections");
        await expect(
          card.getByRole("button", { name: "Add an event" })
        ).toBeVisible();
        await card.scrollIntoViewIfNeeded();
      } else {
        await expect(page.getByText("Nothing this week")).toBeVisible({
          timeout: 20_000,
        });
      }
      await settle(page);
      await expect(page).toHaveScreenshot(
        `calendar-empty-${state}-phone-${theme}.png`
      );
    });
  }
}
