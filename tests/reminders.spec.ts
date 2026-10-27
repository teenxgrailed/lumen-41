import { expect, test } from "@playwright/test";

import { prisma } from "@/lib/prisma";

import { createV3User, signInAs } from "./helpers/v3-user";

/*
 * Reminders end to end against the real API and database: set one on a task
 * from its dialog a minute ahead, and once that minute has passed it is in
 * the bell's Activity. The bell reads fired reminders straight from the
 * reminders table, so this does not wait on the worker.
 */
test("Reminders: a reminder set a minute ahead lands in Activity", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const user = await createV3User("reminders-fire");
  await signInAs(page, user);
  const title = "Call the print shop";
  const task = await prisma.task.create({
    data: {
      userId: user.id,
      workspaceId: user.workspaceId,
      title,
      status: "todo",
      dueDate: new Date(),
    },
  });

  await page.goto("/tasks");
  await page.getByText(title).click();
  const dialog = page.getByRole("dialog", { name: title });

  // The chip row folds what does not fit into "+N".
  const chip = dialog.locator('[data-tdc-trigger="remind"]');
  if (await chip.isVisible()) await chip.click();
  else {
    await dialog.locator('[data-tdc-trigger="more"]').click();
    await dialog.getByRole("menuitem", { name: /Remind/ }).click();
  }

  // The next whole minute at least a minute away, on the browser's clock.
  const local = await page.evaluate(() => {
    const d = new Date(Date.now() + 60_000);
    d.setSeconds(0, 0);
    d.setMinutes(d.getMinutes() + 1);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  await dialog.getByLabel("Remind at a time").fill(local);
  await dialog.getByRole("button", { name: "Set", exact: true }).click();

  await expect
    .poll(
      async () =>
        (await prisma.taskReminder.count({
          where: { taskId: task.id, kind: "AT_TIME", canceledAt: null },
        })) > 0,
      { timeout: 15_000 }
    )
    .toBe(true);
  const reminder = await prisma.taskReminder.findFirstOrThrow({
    where: { taskId: task.id, kind: "AT_TIME" },
  });
  // The reminder fires at a wall-clock minute; wait for it to pass.
  const wait = (reminder.fireAt?.getTime() ?? Date.now()) - Date.now() + 2_000;
  await page.waitForTimeout(Math.max(0, wait));

  await page.goto("/tasks");
  await page.getByRole("button", { name: /^Notifications/ }).click();
  const row = page.locator('[data-kind="reminder"]').filter({ hasText: title });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row).toHaveAttribute("data-unread", "true");
});
