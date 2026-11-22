import { type Page, expect, test } from "@playwright/test";

import { formatInTimeZone, newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import { VISUAL_TEST_EMAIL } from "./fixtures";
import { signInVisualUser } from "./helpers";

/*
 * Always easy start, the task row (variant A), in the list of tasks: a row with
 * an easy first step says the step and "for: <title>" under it; in Suggest mode
 * the row of a task with a pending proposal keeps its title and offers
 * Упростить?; applying it gives the same row with an Undo. Phone (390 px, dark)
 * and desktop (1440 px, dark). Only the rows are shot, so no date reaches a
 * baseline.
 */
test.use({ serviceWorkers: "block" });
test.beforeEach(({}, info) => {
  test.skip(info.project.name === "tablet", "phone and desktop only");
});

const IDS = ["visual-esr-normal", "visual-esr-suggest"] as const;

test.afterEach(async () => {
  await prisma.task.deleteMany({ where: { id: { in: [...IDS] } } });
  await prisma.userSettings.updateMany({
    where: { user: { email: VISUAL_TEST_EMAIL } },
    data: { easyStartMode: "auto" },
  });
});

async function seed() {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: VISUAL_TEST_EMAIL },
    select: { id: true },
  });
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { personalOwnerId: user.id },
    select: { id: true },
  });
  await prisma.userSettings.updateMany({
    where: { userId: user.id },
    data: { easyStartMode: "suggest" },
  });
  const base = {
    userId: user.id,
    workspaceId: workspace.id,
    status: "todo",
    isAutoScheduled: false,
    estimatedMinutes: 45,
    duration: 45,
    // due today, as the other task shots: an undated task is not on every list
    dueDate: new Date(
      `${formatInTimeZone(newDate(), "Europe/Zurich", "yyyy-MM-dd")}T00:00:00.000Z`
    ),
  };
  await prisma.task.create({
    data: {
      ...base,
      id: IDS[0],
      title: "Send the design review notes to the team",
      entry: "Open last week's notes",
    },
  });
  await prisma.task.create({
    data: { ...base, id: IDS[1], title: "Write the pricing page copy" },
  });
  await prisma.easyStartProposal.create({
    data: {
      userId: user.id,
      workspaceId: workspace.id,
      taskId: IDS[1],
      reason: "backfill",
      entry: "Write three headline options",
      baseTitle: "Write the pricing page copy",
      baseEntry: null,
    },
  });
}

/** The rows of the seeded tasks: desktop rows carry data-task, phone rows data-pk-row. */
const rowsClip = (page: Page) =>
  page.evaluate(
    (ids) => {
      const boxes = ids
        .map((id) =>
          document.querySelector(`[data-task="${id}"], [data-pk-row="${id}"]`)
        )
        .filter((el): el is Element => !!el)
        .map((el) => el.getBoundingClientRect());
      const x = Math.min(...boxes.map((b) => b.left)) - 8;
      const y = Math.min(...boxes.map((b) => b.top)) - 8;
      return {
        x: Math.max(x, 0),
        y: Math.max(y, 0),
        width: Math.max(...boxes.map((b) => b.right)) - x + 8,
        height: Math.max(...boxes.map((b) => b.bottom)) - y + 8,
      };
    },
    [...IDS]
  );

test("Easy start row, normal and suggest, then simplified", async ({
  page,
}, info) => {
  const phone = info.project.name === "mobile";
  await page.setViewportSize(
    phone ? { width: 390, height: 844 } : { width: 1440, height: 1000 }
  );
  const tag = phone ? "390" : "1440";
  await page.addInitScript(() => {
    localStorage.setItem("needt:quick-tip:last-shown-at", "9999999999999");
    localStorage.setItem("needt-visit-count", "0");
  });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await signInVisualUser(page);
  await seed();
  const res = await page.request.patch("/api/user-settings", {
    data: { theme: "dark" },
  });
  expect(res.ok()).toBeTruthy();
  await page.goto("/tasks");
  await page.addStyleTag({
    content:
      'nextjs-portal, .tsqd-parent-container, aside[aria-label="Quick Tip"] { display: none !important; }',
  });
  const rows = page.locator(
    `[data-task="${IDS[1]}"], [data-pk-row="${IDS[1]}"]`
  );
  await expect(page.locator("[data-esr-suggest]").first()).toBeVisible({
    timeout: 60_000,
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await rows.first().scrollIntoViewIfNeeded();
  await expect(page).toHaveScreenshot(`easy-start-row-${tag}-dark.png`, {
    animations: "disabled",
    clip: await rowsClip(page),
  });

  const seen: string[] = [];
  page.on("response", async (r) => {
    if (r.url().includes("/api/easy-start/")) {
      seen.push(
        `${r.request().method()} ${r.url()} ${r.status()} ${(await r.text().catch(() => "")).slice(0, 200)}`
      );
    }
  });
  await page.locator("[data-esr-suggest]").first().click();
  await expect(page.locator("[data-esr-undo]").first())
    .toBeVisible()
    .catch(async (error: unknown) => {
      const rowText = await rows
        .first()
        .innerText()
        .catch(() => "(no row)");
      throw new Error(
        `Undo never showed. responses: ${JSON.stringify(seen)}; row: ${rowText}; ${String(error)}`
      );
    });
  await page.waitForTimeout(300);
  await expect(page).toHaveScreenshot(
    `easy-start-row-${tag}-simplified-dark.png`,
    {
      animations: "disabled",
      clip: await rowsClip(page),
    }
  );
});
