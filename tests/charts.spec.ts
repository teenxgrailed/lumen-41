import { type Page, expect, test } from "@playwright/test";

import { addCalendarDays, newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import { type V3User, createV3User, signInAs } from "./helpers/v3-user";

/**
 * Charts end to end: a project with two weeks of history gets a progress
 * chart from its page, the chart is switched to bars and removed with Undo
 * offered; Home gets a time-spent chart in its rail. The numbers come from
 * the real API over rows seeded through Prisma.
 */
const SHOTS = process.env.CHARTS_SHOTS_DIR;

async function seed(page: Page, label: string) {
  const user = await createV3User(label);
  await page.addInitScript(() => {
    localStorage.setItem("needt:quick-tip:last-shown-at", "9999999999999");
    localStorage.setItem("needt-visit-count", "0");
  });
  await signInAs(page, user);
  return user;
}

async function seedHistory(user: V3User) {
  const now = newDate();
  const project = await prisma.project.create({
    data: {
      name: "Launch",
      color: "#2E6DE9",
      userId: user.id,
      workspaceId: user.workspaceId,
    },
  });
  for (let i = 0; i < 10; i++) {
    const created = addCalendarDays(now, -14 + i);
    const task = await prisma.task.create({
      data: {
        title: `Step ${i + 1}`,
        userId: user.id,
        assigneeId: user.id,
        workspaceId: user.workspaceId,
        projectId: project.id,
        createdAt: created,
        ...(i < 6
          ? {
              status: "completed",
              completedAt: addCalendarDays(created, 2),
            }
          : { status: "todo" }),
      },
    });
    const start = addCalendarDays(now, -(i % 7));
    start.setUTCHours(8, 0, 0, 0);
    await prisma.timeEntry.create({
      data: {
        taskId: task.id,
        userId: user.id,
        startedAt: start,
        endedAt: new Date(start.getTime() + (25 + i * 9) * 60000),
        source: "manual",
      },
    });
  }
  return project;
}

test.describe("Charts", () => {
  test("add a progress chart to a project, show it as bars, remove it", async ({
    page,
  }) => {
    const user = await seed(page, "charts-project");
    const project = await seedHistory(user);
    await page.goto(`/projects/${project.id}`);

    const section = page.locator('[data-ch-section="project"]');
    await expect(section).toBeVisible();
    await section.locator("[data-ch-add]").click();
    await page.locator('[data-ch-add-metric="task_progress"]').click();

    const card = section.locator(
      '[data-ch-card][data-ch-metric="task_progress"]'
    );
    await expect(card).toBeVisible();
    await expect(card).toContainText("Progress");
    await expect(card).toContainText("6 of 10 done");
    await expect(card.locator('[data-ch-svg="line"]')).toBeVisible();
    if (SHOTS)
      await page.locator("[data-wk-ppage]").screenshot({
        path: `${SHOTS}/project-progress-line.png`,
      });

    await section.locator("[data-ch-add]").click();
    await page.locator('[data-ch-add-metric="time_spent"]').click();
    const time = section.locator('[data-ch-card][data-ch-metric="time_spent"]');
    await expect(
      time.locator('[data-ch-svg="bar"] rect').first()
    ).toBeVisible();

    await card.locator("[data-ch-more]").click();
    await page.locator("[data-ch-style]").click();
    await expect(card.locator('[data-ch-svg="bar"]')).toBeVisible();
    if (SHOTS)
      await page.locator("[data-wk-ppage]").screenshot({
        path: `${SHOTS}/project-two-charts.png`,
      });

    await card.locator("[data-ch-more]").click();
    await page.locator("[data-ch-remove]").click();
    await expect(card).toHaveCount(0);
    await expect(page.getByText("Removed “Progress”")).toBeVisible();
  });

  test("Home shows its own charts in the rail", async ({ page }) => {
    const user = await seed(page, "charts-home");
    await seedHistory(user);
    await page.goto("/today");
    const section = page.locator('[data-ch-section="home"]');
    await expect(section).toBeVisible();
    await section.locator("[data-ch-add]").click();
    await page.locator('[data-ch-add-metric="time_spent"]').click();
    const card = section.locator('[data-ch-card][data-ch-metric="time_spent"]');
    await expect(card).toBeVisible();
    await expect(card).toContainText("a day");
    if (SHOTS)
      await page.locator("[data-ha-charts]").screenshot({
        path: `${SHOTS}/home-time-spent.png`,
      });
  });
});
