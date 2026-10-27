import { type Page, expect, test } from "@playwright/test";

import { prisma } from "@/lib/prisma";

import { createV3User, signInAs } from "./helpers/v3-user";

/*
 * Pin a timed task from its menu, see the pin on the row, then hand it back
 * to the scheduler. Each step is checked over the API, the way a connector
 * would read it: `scheduleLocked` and `isAutoScheduled` flip, and pinning
 * writes one frozen block.
 */

const apiTask = async (page: Page, id: string) => {
  const res = await page.request.get(`/api/tasks/${id}`);
  expect(res.ok()).toBe(true);
  return (await res.json()) as {
    scheduleLocked: boolean;
    isAutoScheduled: boolean;
    scheduledStart: string | null;
  };
};

test("a task is pinned from its menu and handed back to the scheduler", async ({
  page,
}) => {
  const user = await createV3User("task-pin");
  await signInAs(page, user);
  const start = new Date();
  start.setUTCHours(start.getUTCHours() + 2, 0, 0, 0);
  const task = await prisma.task.create({
    data: {
      userId: user.id,
      workspaceId: user.workspaceId,
      title: "Pin me down",
      status: "todo",
      dueDate: new Date(),
      estimatedMinutes: 30,
      scheduledStart: start,
      scheduledEnd: new Date(start.getTime() + 30 * 60 * 1000),
      isAutoScheduled: true,
      scheduleLocked: false,
    },
  });

  await page.goto("/today");
  const row = page.locator("[data-task]").filter({ hasText: "Pin me down" });
  await expect(row).toBeVisible();
  await expect(row.locator("[data-task-pin]")).toHaveCount(0);

  await page.goto(`/tasks?task=${task.id}`);
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Pin here" }).click();

  await expect
    .poll(async () => (await apiTask(page, task.id)).scheduleLocked)
    .toBe(true);
  expect((await apiTask(page, task.id)).isAutoScheduled).toBe(false);
  expect(
    await prisma.scheduledBlock.count({ where: { taskId: task.id } })
  ).toBe(1);

  await page.goto("/today");
  await expect(
    page
      .locator("[data-task]")
      .filter({ hasText: "Pin me down" })
      .locator("[data-task-pin]")
      .first()
  ).toHaveAttribute("title", /^Pinned at \d{2}:\d{2} — the scheduler won't/);

  await page.goto(`/tasks?task=${task.id}`);
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Let Needt schedule it" }).click();

  await expect
    .poll(async () => (await apiTask(page, task.id)).scheduleLocked)
    .toBe(false);
  expect((await apiTask(page, task.id)).isAutoScheduled).toBe(true);
});
