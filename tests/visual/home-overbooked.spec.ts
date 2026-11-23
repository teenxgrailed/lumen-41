import { type Page, expect, test } from "@playwright/test";

import { prisma } from "@/lib/prisma";

import { openOverdue } from "../helpers/home";
import { VISUAL_TEST_EMAIL } from "./fixtures";
import { signInVisualUser } from "./helpers";

/* An overbooked day: far more planned today than the working time left, a
 * pile of untimed tasks and a few overdue ones. Home must not only state the
 * problem: the time-left card offers "Spread across the week", and Overdue
 * offers Spread beside Move to today, with Spread carrying the weight because
 * today is already full. Next up's long title stays two lines. */

test.skip(({ viewport }) => {
  const w = viewport?.width ?? 0;
  return w >= 700 && w < 1024;
}, "Desktop and phone; the tablet draws the desktop face.");
test.use({ serviceWorkers: "block" });

const LONG_TITLE =
  "Create campaign/FOUR_LOOK_LIST.md (T-100201) and hand the final cut to the studio before the Friday review";

/**
 * Thursday 16 July 2026 in Zurich, the visual fixtures' day, in the afternoon:
 * past the morning, so Next up stands where the highlight suggestions would.
 */
const NOW = "2026-07-16T14:00:00+02:00";
const day = (d: number) => new Date(`2026-07-${d}T00:00:00+02:00`);

async function seedOverbookedDay() {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: VISUAL_TEST_EMAIL },
    select: { id: true },
  });
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { personalOwnerId: user.id },
    select: { id: true },
  });
  const base = {
    userId: user.id,
    workspaceId: workspace.id,
    status: "todo",
    isAutoScheduled: false,
  };
  const anytime = [
    "Write the onboarding email",
    "Review the pricing page copy",
    "Prepare the investor update",
    "Clean up the design tokens",
    "Draft the Q3 roadmap",
    "Answer the support backlog",
  ];
  // A day plan left by an earlier spec must not outlive the seed it was drawn
  // from; the plan rows are not part of the sign-in reset.
  await prisma.dayPlan.deleteMany({ where: { userId: user.id } });
  // the visual user's tasks are reset on every sign-in, these with them
  await prisma.task.createMany({
    data: [
      ...anytime.map((title, i) => ({
        ...base,
        id: `visual-spread-today-${i}`,
        title,
        dueDate: day(16),
        estimatedMinutes: 120,
        duration: 120,
      })),
      {
        ...base,
        id: "visual-spread-late-0",
        title: LONG_TITLE,
        dueDate: day(13),
        estimatedMinutes: 45,
        duration: 45,
      },
      {
        ...base,
        id: "visual-spread-late-1",
        title: "Send the venue deposit",
        dueDate: day(14),
        estimatedMinutes: 15,
        duration: 15,
      },
      {
        ...base,
        id: "visual-spread-late-2",
        title: "Book the photographer",
        dueDate: day(15),
        estimatedMinutes: 30,
        duration: 30,
      },
    ],
  });
}

/**
 * This spec is about the old Today (the overdue row, Spread, the time-left
 * card), so the day plan is answered as switched off, the way the server does
 * when the `day_plan` kill switch is off (404 "disabled"). Left live, the phone
 * asks for a draft once the page has loaded and Today swaps to the plan view
 * whenever that answer lands: before the screenshot (the Spread buttons are
 * gone and the plan's four fixture tasks are drawn) or after it (the old
 * Today), so the run depended on the server's speed.
 */
async function switchDayPlanOff(page: Page) {
  await page.route("**/api/day-plan**", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "disabled" }),
    })
  );
}

async function openHome(page: Page) {
  await page.clock.setFixedTime(new Date(NOW));
  await switchDayPlanOff(page);
  await page.addInitScript(() => {
    localStorage.setItem("needt:quick-tip:last-shown-at", "9999999999999");
    localStorage.setItem("needt-visit-count", "0");
  });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await signInVisualUser(page);
  await seedOverbookedDay();
  await page.goto("/today");
  // Home v2: all overdue work is one closed row; Spread / Move to today live in it
  await openOverdue(page, 20_000);
  await page.addStyleTag({
    content:
      'nextjs-portal, .tsqd-parent-container, aside[aria-label="Quick Tip"] { display: none !important; }',
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

test("Overbooked Home offers Spread across the week, and Spread leads on Overdue", async ({
  page,
}, testInfo) => {
  await openHome(page);
  const phone = testInfo.project.name === "mobile";

  const spread = page.getByRole("button", { name: "Spread across the week" });
  await expect(spread).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Overbooked by/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Spread", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Move to today" })
  ).toBeVisible();

  if (!phone) {
    // Today is full, so Spread is the raised button and Move to today words.
    await expect(page.locator("[data-hd-spread]")).toHaveClass(
      /nx-btn-secondary/
    );
    await expect(page.locator(".hd-move-today")).toHaveClass(/nx-btn-text/);
    await expect(
      page.getByText(/Spread gives each one the next day/)
    ).toBeVisible();
  }
  // An overdue task never takes the Now card: its long title is clamped in its
  // row, whole in the tooltip.
  if (!phone) {
    await expect(
      page.locator(`.hd-title[title="${LONG_TITLE}"]`).first()
    ).toBeVisible();
  }
  // Opening the overdue row may scroll the page (it did in one run, not in the
  // next); the shot is always taken from the top.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(350);

  await expect(page).toHaveScreenshot("home-overbooked.png", {
    animations: "disabled",
  });
});
