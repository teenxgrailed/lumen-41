import { type Page, expect, test } from "@playwright/test";

import { prisma } from "@/lib/prisma";

import { type V3User, createV3User, signInAs } from "./helpers/v3-user";

/*
 * Tasks on the v3 screens, against the real API and database: create one from
 * New → New Task, edit it in its dialog, and close it with the shared
 * completion (the tick on the row), Undo included. Each test owns its account,
 * so none depends on another's data.
 */

async function seedTask(user: V3User, title: string) {
  return prisma.task.create({
    data: {
      userId: user.id,
      workspaceId: user.workspaceId,
      title,
      status: "todo",
      dueDate: new Date(),
    },
  });
}

/** The transient "what you did" pill at the bottom centre. */
const notices = (page: Page) =>
  page.getByRole("region", { name: "Needt action notices" });

const rowOf = (page: Page, title: string) =>
  page.locator("[data-task]").filter({ hasText: title });

test("Tasks: a task made from New → New Task is listed and survives a reload", async ({
  page,
}) => {
  const user = await createV3User("tasks-create");
  await signInAs(page, user);
  const title = "Write the launch post";

  await page.goto("/tasks");
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("menuitem", { name: /New Task/ }).click();
  await page.getByLabel("Task name").fill(title);
  await page.getByRole("button", { name: /Add task/ }).click();

  // The composer stays open for the next one; the notice says where it went.
  await expect(notices(page)).toContainText("Added to today");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(rowOf(page, title)).toBeVisible();

  await expect
    .poll(() => prisma.task.count({ where: { userId: user.id, title } }))
    .toBe(1);

  await page.reload();
  await expect(rowOf(page, title)).toBeVisible();
});

test("Tasks: editing the title in the task dialog is saved and survives a reload", async ({
  page,
}) => {
  const user = await createV3User("tasks-edit");
  await signInAs(page, user);
  const task = await seedTask(user, "Publish website");

  await page.goto("/tasks");
  await page.getByText("Publish website").click();
  await expect(page).toHaveURL(new RegExp(`task=${task.id}`));

  const dialog = page.getByRole("dialog", { name: "Publish website" });
  await dialog
    .getByRole("textbox", { name: "Title" })
    .fill("Publish website v2");
  // The dialog saves as you type; there is no Save button to press.
  await expect
    .poll(
      async () =>
        (await prisma.task.findUnique({ where: { id: task.id } }))?.title
    )
    .toBe("Publish website v2");

  await dialog.getByRole("button", { name: "Close" }).click();
  await page.reload();
  await expect(rowOf(page, "Publish website v2")).toBeVisible();
  await expect(page.getByText("Publish website", { exact: true })).toHaveCount(
    0
  );
});

test("Tasks: ticking a task closes it with the shared completion, and Undo reopens it", async ({
  page,
}) => {
  const user = await createV3User("tasks-complete");
  await signInAs(page, user);
  const task = await seedTask(user, "Ship the report");
  const status = async () =>
    (await prisma.task.findUnique({ where: { id: task.id } }))?.status;

  await page.goto("/tasks");
  const row = rowOf(page, "Ship the report");
  await expect(row).toBeVisible();
  // `exact`: the row itself is a button whose name also contains "Mark done".
  const tick = row.getByRole("button", { name: "Mark done", exact: true });
  await tick.click();

  // The write has gone out, the row is struck, and the notice carries Undo.
  await expect(notices(page)).toContainText("Done · “Ship the report”");
  await expect.poll(status).toBe("completed");
  await expect(
    row.getByRole("button", { name: "Mark not done", exact: true })
  ).toHaveAttribute("aria-pressed", "true");

  await notices(page).getByRole("button", { name: "Undo" }).click();
  await expect.poll(status).toBe("todo");
  await expect(
    rowOf(page, "Ship the report").getByRole("button", {
      name: "Mark done",
      exact: true,
    })
  ).toHaveAttribute("aria-pressed", "false");
});

for (const width of [360, 390]) {
  test(`Tasks: the phone list can tick a task without horizontal overflow at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    const user = await createV3User(`tasks-phone-${width}`);
    await signInAs(page, user);
    const task = await seedTask(user, "Ship the report");

    await page.goto("/tasks");
    await expect(
      page.getByRole("button", { name: "Ship the report" })
    ).toBeVisible();
    await page.getByRole("button", { name: "Mark done", exact: true }).click();

    // The phone has no notice for it: the task moves down to Done.
    await expect(page.getByText("All clear for today")).toBeVisible();
    await expect(page.getByRole("button", { name: "Done 1" })).toBeVisible();
    await expect
      .poll(
        async () =>
          (await prisma.task.findUnique({ where: { id: task.id } }))?.status
      )
      .toBe("completed");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
  });
}
