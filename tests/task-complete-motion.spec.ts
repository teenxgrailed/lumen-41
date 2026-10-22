import { type Page, expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/prisma";

import { type V3User, createV3User, signInAs } from "./helpers/v3-user";

/*
 * Ticking a task on Home: the box pops and the row is struck, then the row
 * folds (height + fade) and the rows under it close the gap; with Reduce
 * Motion there is no exit at all. Overdue and Inbox list open tasks only, so
 * these are the rows that used to vanish at once.
 *
 * The frames are written to test-results/completion-frames and uploaded by CI
 * (the "completion-frames" artifact) so the motion can be looked at.
 */

const FRAMES = path.join("test-results", "completion-frames");
const DAY_MS = 24 * 60 * 60 * 1000;

async function seed(user: V3User, title: string, daysAgo: number | null) {
  return prisma.task.create({
    data: {
      userId: user.id,
      workspaceId: user.workspaceId,
      title,
      status: "todo",
      dueDate:
        daysAgo === null ? null : new Date(Date.now() - daysAgo * DAY_MS),
    },
  });
}

const rowOf = (page: Page, title: string) =>
  page.locator("[data-task]").filter({ hasText: title });
/** The fold wrapper the completion drives (`data-complete` strike | collapse). */
const foldOf = (page: Page, title: string) =>
  page.locator("[data-complete]").filter({ hasText: title }).first();

async function frames(page: Page, name: string, every: number, count: number) {
  await mkdir(FRAMES, { recursive: true });
  const started = Date.now();
  const seen: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const phase = await page
      .locator("[data-complete]")
      .first()
      .getAttribute("data-complete")
      .catch(() => null);
    seen.push(phase ?? "none");
    await page.screenshot({
      path: path.join(
        FRAMES,
        `${name}-${String(Date.now() - started).padStart(4, "0")}ms-${phase ?? "none"}.png`
      ),
    });
    await page.waitForTimeout(every);
  }
  return seen;
}

test("Home: a ticked Overdue row pops, is struck, then folds away and the list closes up", async ({
  page,
}) => {
  const user = await createV3User("complete-motion");
  await signInAs(page, user);
  const first = await seed(user, "Pay the invoice", 3);
  await seed(user, "Call the landlord", 2);
  await seed(user, "Renew the passport", 1);

  await page.goto("/today");
  const row = rowOf(page, "Pay the invoice");
  await expect(row).toBeVisible();
  const others = rowOf(page, "Call the landlord");
  await expect(others).toBeVisible();
  const before = (await others.boundingBox())?.y ?? 0;

  await row
    .getByRole("button", { name: "Mark done", exact: true })
    .first()
    .click();

  // the strike: the row is still there, ticked, and its fold is not started
  await expect(foldOf(page, "Pay the invoice")).toHaveAttribute(
    "data-complete",
    "strike"
  );
  await expect(row).toBeVisible();
  const seen = await frames(page, "overdue", 80, 14);

  // the fold ran, then the row was removed and the rows below moved up
  expect(seen).toContain("strike");
  await expect(rowOf(page, "Pay the invoice")).toHaveCount(0, {
    timeout: 3000,
  });
  const after = (await others.boundingBox())?.y ?? 0;
  expect(after).toBeLessThan(before);

  await expect
    .poll(
      async () =>
        (await prisma.task.findUnique({ where: { id: first.id } }))?.status
    )
    .toBe("completed");
});

test("Home: Undo inside the window keeps the row", async ({ page }) => {
  const user = await createV3User("complete-undo");
  await signInAs(page, user);
  const task = await seed(user, "Book the dentist", 2);
  await seed(user, "Water the plants", 1);

  await page.goto("/today");
  await rowOf(page, "Book the dentist")
    .getByRole("button", { name: "Mark done", exact: true })
    .first()
    .click();
  await page
    .getByRole("region", { name: "Needt action notices" })
    .getByRole("button", { name: "Undo" })
    .click();

  await page.waitForTimeout(1500);
  await expect(rowOf(page, "Book the dentist")).toBeVisible();
  await expect
    .poll(
      async () =>
        (await prisma.task.findUnique({ where: { id: task.id } }))?.status
    )
    .toBe("todo");
});

test("Home: with Reduce Motion the row leaves with no exit", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const user = await createV3User("complete-reduced");
  await signInAs(page, user);
  await seed(user, "Send the parcel", 2);
  await seed(user, "Pick up the keys", 1);

  await page.goto("/today");
  await rowOf(page, "Send the parcel")
    .getByRole("button", { name: "Mark done", exact: true })
    .first()
    .click();

  await expect(rowOf(page, "Send the parcel")).toHaveCount(0);
  await expect(page.locator("[data-complete]")).toHaveCount(0);
});
