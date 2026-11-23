import { expect, test } from "@playwright/test";

import { prisma } from "@/lib/prisma";

import { createV3User, signInAs } from "./helpers/v3-user";

/*
 * Always easy start, the row (variant A). In Suggest mode a task with a pending
 * proposal shows its title and "Упростить?". Pressing it runs the real
 * task.simplify: the row now says the first step with "for: <title>" under it
 * and an Undo. Undo puts the old title back and the row looks as it did.
 */
test("a suggested task is simplified from its row and Undo puts it back", async ({
  page,
}) => {
  const user = await createV3User("easy-start-row");
  await prisma.userSettings.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      timeZone: "Europe/Zurich",
      easyStartMode: "suggest",
    },
    update: { easyStartMode: "suggest" },
  });
  const task = await prisma.task.create({
    data: {
      userId: user.id,
      workspaceId: user.workspaceId,
      assigneeId: user.id,
      title: "Write the pricing page copy",
      status: "todo",
      dueDate: new Date(),
      estimatedMinutes: 60,
    },
  });
  await prisma.easyStartProposal.create({
    data: {
      userId: user.id,
      workspaceId: user.workspaceId,
      taskId: task.id,
      reason: "backfill",
      entry: "Write three headline options",
      title: "Pricing page copy",
      baseTitle: task.title,
      baseEntry: null,
    },
  });
  await signInAs(page, user);

  await page.goto("/tasks");
  const row = page.locator("[data-task]").filter({ hasText: task.title });
  await expect(row.locator("[data-esr-suggest]")).toBeVisible();

  await row.locator("[data-esr-suggest]").click();
  const simplified = page
    .locator("[data-task]")
    .filter({ hasText: "Write three headline options" });
  await expect(simplified).toBeVisible();
  await expect(simplified).toContainText("for: Pricing page copy");
  await expect(simplified.locator("[data-esr-undo]")).toBeVisible();

  await simplified.locator("[data-esr-undo]").click();
  await expect(
    page.locator("[data-task]").filter({ hasText: task.title })
  ).toBeVisible();
  await expect(page.locator("[data-esr-undo]")).toHaveCount(0);
  const after = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
  expect(after.title).toBe(task.title);
  expect(after.entry).toBeNull();
});
