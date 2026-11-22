import { type Page, expect, test } from "@playwright/test";

import { formatInTimeZone, newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import { VISUAL_TEST_EMAIL } from "./fixtures";
import { signInVisualUser } from "./helpers";

/*
 * Home and the task sheet on a 390-px phone, dark and light: a task carries
 * the icon its title picks, the sheet has the icon button beside the title
 * (the project colour at low alpha), and the picker lists the icons with
 * Automatic. One run, in the mobile project.
 */
test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  serviceWorkers: "block",
});
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "mobile", "390-px phone shots run once");
});

const serverDay = () =>
  formatInTimeZone(newDate(), "Europe/Zurich", "yyyy-MM-dd");

test.afterEach(async () => {
  // later specs read the visual user's projects; leave none behind
  await prisma.task.deleteMany({ where: { id: "visual-icon-task" } });
  await prisma.project.deleteMany({ where: { id: "visual-icon-project" } });
});

const TITLE = "Cook dinner for Anna";

async function seed() {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: VISUAL_TEST_EMAIL },
    select: { id: true },
  });
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { personalOwnerId: user.id },
    select: { id: true },
  });
  await prisma.dayPlan.deleteMany({ where: { userId: user.id } });
  const project = await prisma.project.create({
    data: {
      id: "visual-icon-project",
      name: "Home",
      color: "#E07A5F",
      userId: user.id,
      workspaceId: workspace.id,
    },
  });
  await prisma.task.create({
    data: {
      id: "visual-icon-task",
      title: TITLE,
      userId: user.id,
      workspaceId: workspace.id,
      projectId: project.id,
      status: "todo",
      isAutoScheduled: false,
      estimatedMinutes: 45,
      duration: 45,
      dueDate: new Date(`${serverDay()}T00:00:00.000Z`),
    },
  });
}

async function open(page: Page, theme: "dark" | "light") {
  await page.addInitScript(() => {
    localStorage.setItem("needt:quick-tip:last-shown-at", "9999999999999");
    localStorage.setItem("needt-visit-count", "0");
  });
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await signInVisualUser(page);
  // The day plan is drawn for the server's day, so the screen must read the
  // same day: the frozen clock of the other specs is left off here. Only the
  // sheet is shot, so no date reaches a baseline.
  for (const screen of ["today", "calendar", "workspace", "docs"]) {
    await page.unroute(`**/api/needt/${screen}`);
  }
  await seed();
  const res = await page.request.patch("/api/user-settings", {
    data: { theme },
  });
  expect(res.ok()).toBeTruthy();
  const draft = await page.request.post("/api/day-plan/draft", {
    data: { date: serverDay() },
  });
  expect(draft.ok()).toBe(true);
  await page.goto("/today");
  await page.addStyleTag({
    content:
      'nextjs-portal, .tsqd-parent-container, aside[aria-label="Quick Tip"] { display: none !important; }',
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

for (const theme of ["dark", "light"] as const) {
  test(`Task icon, ${theme}`, async ({ page }) => {
    await open(page, theme);
    await page.locator("[data-day-plan]").waitFor({ timeout: 60_000 });
    await page.locator("[data-day-plan]").getByText(TITLE).first().click();
    const sheet = page.locator('[data-pov-task="visual-icon-task"]');
    await expect(sheet).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(500);
    await expect(page.locator(".pov-task").first()).toHaveScreenshot(
      `task-sheet-icon-390-${theme}.png`,
      {
        animations: "disabled",
      }
    );

    await sheet.locator("[data-pov-icon]").click();
    await expect(sheet.locator("[data-pov-pick='icon']")).toBeVisible();
    await page.waitForTimeout(300);
    await expect(page.locator(".pov-task").first()).toHaveScreenshot(
      `task-sheet-icon-picker-390-${theme}.png`,
      { animations: "disabled" }
    );
  });
}
