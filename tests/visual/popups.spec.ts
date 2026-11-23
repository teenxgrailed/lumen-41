import { type Page, expect, test } from "@playwright/test";

import type { PopupView } from "@/lib/popups/types";

import { signInVisualUser } from "./helpers";

/*
 * What's new and the upsell, as the app draws them: the server's answer
 * (`/api/popups/next`) is a fixture, the host maps it onto WhatsNewPopup and
 * UpsellPopup, and the shot is the popup itself, at 1440 on the desktop and
 * 390 on a phone, dark and light. Nothing here is the popups lab; this is the
 * wired path.
 */
const WHATS_NEW: PopupView = {
  id: "visual-whats-new",
  source: "announcement",
  key: "visual-whats-new",
  kind: "update",
  badge: null,
  title: "Plan your day in one tap",
  body: "Plan my day now reads your calendar and your habits together before it places anything.",
  bullets: [
    { icon: "calendar", text: "Tasks fit around meetings and focus blocks" },
    { icon: "repeat", text: "Habits keep their usual time" },
    { icon: "zap", text: "Start Focus from the plan and come back" },
  ],
  imageUrl: null,
  primary: { label: "Plan my day", href: "/today" },
  secondary: "Later",
  cards: [],
  feature: null,
};

const UPSELL: PopupView = {
  id: "moment:limit:limit:habits",
  source: "limit",
  key: "limit:habits",
  kind: "limit",
  badge: "Free plan",
  title: "Need more habits?",
  body: "Free keeps 3 active habits. Pro and Lifetime have no limit.",
  bullets: [],
  imageUrl: null,
  primary: null,
  secondary: "Not now",
  cards: [
    { plan: "pro", pick: "annual" },
    { plan: "lifetime", pick: "lifetime" },
  ],
  feature: "Habits",
};

async function open(
  page: Page,
  theme: "dark" | "light",
  popup: PopupView,
  ready: string
) {
  await page.addInitScript(() => {
    localStorage.setItem("needt:quick-tip:last-shown-at", "9999999999999");
    localStorage.setItem("needt-visit-count", "0");
    // Automated browsers never get a popup; this run is the exception.
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await signInVisualUser(page);
  await page.route(/\/api\/popups\/next/, (route) =>
    route.fulfill({ json: { popup } })
  );
  await page.route(/\/api\/popups\/[^/]+\/event/, (route) =>
    route.fulfill({ json: { ok: true } })
  );
  // The plan, with the two facts the upsell reads pinned: a trial is on offer
  // and Lifetime seats remain.
  await page.route(/\/api\/billing$/, async (route) => {
    const res = await route.fetch();
    const body = (await res.json()) as Record<string, unknown>;
    await route.fulfill({
      response: res,
      json: { ...body, trialEligible: true, lifetimeAvailable: true },
    });
  });
  const res = await page.request.patch("/api/user-settings", {
    data: { theme },
  });
  expect(res.ok()).toBeTruthy();
  await page.goto("/today");
  await page.addStyleTag({
    content:
      'nextjs-portal, .tsqd-parent-container, aside[aria-label="Quick Tip"] { display: none !important; }',
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  // The host looks once, a few seconds after load.
  await page.locator(ready).waitFor({ timeout: 45_000 });
  await page.waitForTimeout(900);
}

const SCENES = [
  ["whats-new", WHATS_NEW, '[data-pp="whats-new"]'],
  ["upsell", UPSELL, '[data-pp="upsell"]'],
] as const;

test.describe("desktop 1440", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop", "1440 shots run once");
  });
  for (const theme of ["dark", "light"] as const) {
    for (const [name, popup, ready] of SCENES) {
      test(`${name}, ${theme}`, async ({ page }) => {
        await open(page, theme, popup, ready);
        await expect(page.locator(".pp-card")).toHaveScreenshot(
          `popup-${name}-1440-${theme}.png`,
          { animations: "disabled" }
        );
      });
    }
  }
});

test.describe("phone 390", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    serviceWorkers: "block",
  });
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "mobile", "390-px shots run once");
  });
  for (const theme of ["dark", "light"] as const) {
    for (const [name, popup, ready] of SCENES) {
      test(`${name}, ${theme}`, async ({ page }) => {
        await open(page, theme, popup, ready);
        await expect(page.locator(".pp-phone").first()).toHaveScreenshot(
          `popup-${name}-390-${theme}.png`,
          { animations: "disabled" }
        );
      });
    }
  }
});
