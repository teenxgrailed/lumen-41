import { type Page, expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
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

type Frame = {
  t: number;
  phase: string | null;
  height: number;
  opacity: number;
  nextY: number;
};

/**
 * Records one frame per animation frame for `ms`: the ticked row's phase,
 * height and opacity, and where the next row sits. Cheap, so it does not
 * disturb the motion the way a screenshot loop would.
 */
function startRecording(page: Page, title: string, next: string, ms: number) {
  return page.evaluate(
    ([name, other, span]) => {
      const out: Frame[] = [];
      (window as unknown as { __frames: Frame[] }).__frames = out;
      const t0 = performance.now();
      const step = () => {
        const el = [...document.querySelectorAll("[data-complete]")].find((e) =>
          e.textContent?.includes(name as string)
        );
        const n = [...document.querySelectorAll("[data-task]")].find((e) =>
          e.textContent?.includes(other as string)
        );
        out.push({
          t: Math.round(performance.now() - t0),
          phase: el?.getAttribute("data-complete") ?? null,
          height: el ? Math.round(el.getBoundingClientRect().height) : 0,
          opacity: el ? Number(getComputedStyle(el).opacity) : 0,
          nextY: n ? Math.round(n.getBoundingClientRect().y) : 0,
        });
        if (performance.now() - t0 < (span as number))
          requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },
    [title, next, ms]
  );
}

const recorded = (page: Page) =>
  page.evaluate(() => (window as unknown as { __frames: Frame[] }).__frames);

/** A still of the list, never allowed to stall the test. */
async function still(page: Page, name: string) {
  await mkdir(FRAMES, { recursive: true });
  await page
    .screenshot({ path: path.join(FRAMES, `${name}.png`), timeout: 8000 })
    .catch(() => undefined);
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
  await still(page, "overdue-0-before");

  await startRecording(page, "Pay the invoice", "Call the landlord", 1800);
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
  await still(page, "overdue-1-struck");

  // the fold ran, then the row was removed and the rows below moved up
  await expect(rowOf(page, "Pay the invoice")).toHaveCount(0, {
    timeout: 3000,
  });
  await page.waitForTimeout(1000);
  const timeline = await recorded(page);
  await mkdir(FRAMES, { recursive: true });
  await writeFile(
    path.join(FRAMES, "overdue-timeline.json"),
    JSON.stringify(timeline, null, 1)
  );
  await still(page, "overdue-2-after");

  const phases = timeline.map((f) => f.phase);
  expect(phases).toContain("strike");
  expect(phases).toContain("collapse");
  expect(phases.indexOf("strike")).toBeLessThan(phases.indexOf("collapse"));
  // the fold is a height collapse, not a cut: some frame is part-way
  const full = Math.max(...timeline.map((f) => f.height));
  expect(timeline.some((f) => f.height > 0 && f.height < full)).toBe(true);
  // the exit takes under a second and a half end to end
  const startedAt = timeline.find((f) => f.phase)?.t ?? 0;
  const gone = timeline.find((f) => f.phase === null && f.t > startedAt);
  expect(gone?.t ?? Infinity).toBeLessThan(1500);
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
