import { expect, test } from "@playwright/test";

import { VISUAL_TEST_NOW } from "./fixtures";
import { signInVisualUser } from "./helpers";

/*
 * The launch screens on a 390-px phone (iPhone 12–15 width), the phone face
 * of the app: Plan & billing, Notifications (with Habits), Habits with a Quit
 * habit, its detail, the Pulling flow, the new-habit sheet, and the paywall.
 *
 * Runs once, in the mobile project, at its own viewport: the mobile project's
 * 375 px stays the other specs' width. Habits data is served from fixtures so
 * the shots do not depend on the visual user's database or on the
 * `habits_quit` flag.
 */
test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "mobile", "390-px phone shots run once");
});

const DAY = 24 * 60 * 60 * 1000;
const now = new Date(VISUAL_TEST_NOW).getTime();
const iso = (ms: number) => new Date(ms).toISOString();

const german = {
  id: "visual-habit-german",
  title: "German, twenty minutes",
  projectId: null,
  color: null,
  icon: null,
  at: "18:00",
  quota: null,
  archivedAt: null,
  kind: "BUILD",
  remindersEnabled: true,
  daysOfWeek: [],
};
const smoking = {
  id: "visual-habit-smoking",
  title: "Smoking",
  projectId: null,
  color: null,
  icon: null,
  at: null,
  quota: null,
  archivedAt: null,
  kind: "QUIT",
  quitStartedAt: iso(now - 12 * DAY - 4 * 60 * 60 * 1000),
  reason: "I want to run the 10k in spring without stopping.",
  remindersEnabled: true,
  daysOfWeek: [],
};
const summary = {
  started: true,
  streakStartedAt: smoking.quitStartedAt,
  currentStreak: 12,
  bestStreak: 31,
  totalCleanDays: 74,
  lastMilestone: 7,
  nextMilestone: { days: 14, daysLeft: 2 },
  counts: { URGE: 20, RESISTED: 18, RELAPSE: 2, MILESTONE: 4 },
};
const tags = ["boredom", "stress", "night", "phone_in_bed"];
const events = Array.from({ length: 12 }, (_, i) => {
  const at = now - i * 0.6 * DAY - 2 * 60 * 60 * 1000;
  return [
    {
      id: `visual-urge-${i}`,
      habitId: smoking.id,
      type: "URGE",
      at: iso(at),
      tag: tags[i % tags.length],
      intensity: (i % 5) + 1,
      note: null,
    },
    {
      id: `visual-held-${i}`,
      habitId: smoking.id,
      type: "RESISTED",
      at: iso(at + 10 * 60 * 1000),
      tag: null,
      intensity: null,
      note: null,
    },
  ];
})
  .flat()
  .sort((a, b) => b.at.localeCompare(a.at));

type Gate = "on" | "upgrade";

async function serveHabits(
  page: import("@playwright/test").Page,
  gate: Gate,
  habits: readonly unknown[]
) {
  await page.route(/\/api\/habits(\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({ json: { habits, quit: gate } });
  });
  await page.route(/\/api\/habits\/[^/]+\/quit-summary/, (route) =>
    route.fulfill({ json: { summary } })
  );
  await page.route(/\/api\/habits\/[^/]+\/events(\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET")
      return route.fulfill({
        status: 201,
        json: {
          event: { ...events[0], id: "visual-new", at: VISUAL_TEST_NOW },
        },
      });
    await route.fulfill({ json: { events } });
  });
}

async function freeBilling(page: import("@playwright/test").Page) {
  await page.route("**/api/billing", (route) =>
    route.fulfill({
      json: {
        configured: true,
        plan: "FREE",
        status: "ACTIVE",
        interval: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        canManageBilling: false,
        usage: {
          calendars: { used: 0, limit: 1 },
          autoScheduledTasks: { used: 0, limit: 15 },
          boards: { used: 1, limit: 1 },
          mailboxes: { used: 1, limit: 0 },
          aiActions: { used: 0, limit: 0 },
        },
      },
    })
  );
}

async function prepare(page: import("@playwright/test").Page) {
  await page.clock.setFixedTime(new Date(VISUAL_TEST_NOW));
  await page.addInitScript(() => {
    localStorage.setItem("needt:quick-tip:last-shown-at", "9999999999999");
    localStorage.setItem("needt-visit-count", "0");
  });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.route("**/api/ai-settings", (route) =>
    route.fulfill({ json: { hostedAvailable: true, hasApiKey: false } })
  );
  await signInVisualUser(page);
  const theme = await page.request.patch("/api/user-settings", {
    data: { theme: "dark" },
  });
  expect(theme.ok()).toBeTruthy();
}

async function settle(page: import("@playwright/test").Page) {
  await page.addStyleTag({
    content:
      'nextjs-portal, .tsqd-parent-container, aside[aria-label="Quick Tip"] { display: none !important; }',
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await expect(page.locator(".animate-pulse, .glass-skeleton")).toHaveCount(0, {
    timeout: 15_000,
  });
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
  });
  await page.waitForTimeout(350);
}

const shot = async (page: import("@playwright/test").Page, name: string) => {
  await settle(page);
  await expect(page).toHaveScreenshot(`${name}-390.png`);
};

test("Settings on a 390-px phone", async ({ page }) => {
  test.setTimeout(240_000);
  await freeBilling(page);
  await serveHabits(page, "on", [german, smoking]);
  await prepare(page);

  await page.goto("/settings#plan", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Plan & billing").first()).toBeVisible();
  await shot(page, "settings-plan");

  await page.goto("/settings#alerts", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Notifications").first()).toBeVisible();
  await shot(page, "settings-alerts");
  // The Habits group, further down the same page (from #621).
  const habits = page.getByText("Evening check-in");
  if (await habits.count()) {
    await habits.first().scrollIntoViewIfNeeded();
    await shot(page, "settings-alerts-habits");
  }
});

test("Habits and a Quit habit on a 390-px phone", async ({ page }) => {
  test.setTimeout(240_000);
  await serveHabits(page, "on", [german, smoking]);
  await prepare(page);

  await page.goto("/habits", { waitUntil: "domcontentloaded" });
  await expect(page.locator(`[data-hq-quit="${smoking.id}"]`)).toBeVisible();
  await shot(page, "habits");

  await page.locator(`[data-hq-quit="${smoking.id}"] .hq-row-open`).click();
  await expect(page.locator(`[data-hq-detail="${smoking.id}"]`)).toBeVisible();
  await shot(page, "habits-quit-detail");
  await page
    .locator(`[data-hq-detail="${smoking.id}"] .hq-detail-acts`)
    .scrollIntoViewIfNeeded();
  await shot(page, "habits-quit-detail-end");

  await page.locator(`[data-hq-detail="${smoking.id}"] [data-hq-pull]`).click();
  await expect(page.locator('[data-hq-step="breathe"]')).toBeVisible();
  await shot(page, "habits-pull-breathe");

  await page.getByRole("button", { name: "Skip to my reason" }).click();
  await expect(page.locator('[data-hq-step="reason"]')).toBeVisible();
  await shot(page, "habits-pull-reason");

  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.locator('[data-hq-step="ask"]')).toBeVisible();
  await shot(page, "habits-pull-ask");

  await page.locator("[data-hq-passed]").click();
  await expect(page.locator('[data-hq-step="held"]')).toBeVisible();
  await shot(page, "habits-pull-held");
});

test("New habit and the paywall on a 390-px phone", async ({ page }) => {
  test.setTimeout(240_000);
  await freeBilling(page);
  await serveHabits(page, "upgrade", [german]);
  await prepare(page);

  await page.goto("/habits", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-hq-lock]").first()).toBeVisible();
  await shot(page, "habits-free");

  await page.locator("[data-phb-new]").click();
  await page.locator("[data-hq-kind-quit]").click();
  await expect(page.locator(".phb-form [data-hq-lock]")).toBeVisible();
  await shot(page, "habits-new-quit-free");

  await page
    .locator(".phb-form [data-hq-lock]")
    .getByRole("button", { name: "See Pro" })
    .click();
  await expect(page.getByRole("dialog").last()).toBeVisible();
  await shot(page, "paywall");
});
