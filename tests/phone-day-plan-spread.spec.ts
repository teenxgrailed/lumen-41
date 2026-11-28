import { type Page, expect, test } from "@playwright/test";

import { formatInTimeZone, newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import { openOverdue } from "./helpers/home";
import { createV3User, signInAs } from "./helpers/v3-user";

/**
 * The phone's Today keeps overdue work in one row, "3 overdue →"; opened, it
 * offers Spread and Move to today. Spread asks the server (POST
 * /api/tasks/spread) to give each task the next day with room; Move to today
 * puts every one on today. Both write the task's due day, which is what these
 * specs read back. The phone draws no day plan (desktop-only), so none is
 * drafted here. `PHONE_SHOTS=<dir>` also writes a screenshot (dark, 390 px).
 */
const TZ = "Europe/Zurich";
const dayKey = (offset: number) =>
  formatInTimeZone(
    new Date(newDate().getTime() + offset * 86_400_000),
    TZ,
    "yyyy-MM-dd"
  );
const asDay = (key: string) => new Date(`${key}T00:00:00.000Z`);
const dueKey = (d: Date) => formatInTimeZone(d, TZ, "yyyy-MM-dd");

async function seed(page: Page, label: string) {
  const user = await createV3User(label);
  await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: { timeZone: TZ, theme: "dark" },
    create: { userId: user.id, timeZone: TZ, theme: "dark" },
  });
  const base = {
    userId: user.id,
    workspaceId: user.workspaceId,
    status: "todo",
    isAutoScheduled: false,
    estimatedMinutes: 30,
    duration: 30,
  };
  const rows: Array<[string, number]> = [
    ["Review homepage wireframes", 0],
    ["Write pricing page copy", 0],
    ["Ship three parcels", 0],
    ["Cancel the internet contract", -3],
    ["Fix the footer links", -2],
    ["Answer buyer questions", -1],
  ];
  await prisma.task.createMany({
    data: rows.map(([title, due], i) => ({
      ...base,
      id: `${user.id}-${i}`,
      title,
      dueDate: asDay(dayKey(due)),
    })),
  });
  await page.addInitScript(() => {
    localStorage.setItem("needt:quick-tip:last-shown-at", "9999999999999");
    localStorage.setItem("needt-visit-count", "0");
  });
  await signInAs(page, user);
  await page.context().addCookies([
    {
      name: "needt-ui",
      value: "phone",
      url: process.env.TEST_BASE_URL ?? "http://localhost:3000",
    },
  ]);
  return user;
}

async function openToday(page: Page) {
  await page.goto("/today", {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await openOverdue(page, 60_000);
  const late = page.locator("[data-hv2-late]");
  await expect(late).toContainText("3 overdue");
  await expect(late.locator("[data-hv2-late-body]")).toBeVisible();
  return late;
}

const overdueIds = (userId: string) => [3, 4, 5].map((i) => `${userId}-${i}`);

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  colorScheme: "dark",
  serviceWorkers: "block",
});
test.setTimeout(240_000);

test("Move to today puts every overdue task on today", async ({ page }) => {
  const user = await seed(page, "dps-move");
  const late = await openToday(page);
  if (process.env.PHONE_SHOTS) {
    await page.screenshot({ path: `${process.env.PHONE_SHOTS}/after.png` });
  }
  await late.getByRole("button", { name: "Move to today" }).click();
  const today = dayKey(0);
  await expect
    .poll(
      async () => {
        const rows = await prisma.task.findMany({
          where: { id: { in: overdueIds(user.id) } },
          select: { dueDate: true },
        });
        return rows.map((r) => (r.dueDate ? dueKey(r.dueDate) : null));
      },
      { timeout: 30_000 }
    )
    .toEqual([today, today, today]);
});

test("Spread gives each overdue task a day that is today or later", async ({
  page,
}) => {
  const user = await seed(page, "dps-spread");
  const late = await openToday(page);
  const spread = page.waitForResponse(
    (r) =>
      r.url().includes("/api/tasks/spread") && r.request().method() === "POST"
  );
  await late.getByRole("button", { name: "Spread" }).click();
  expect((await spread).ok()).toBe(true);
  const today = dayKey(0);
  await expect
    .poll(
      async () => {
        const rows = await prisma.task.findMany({
          where: { id: { in: overdueIds(user.id) } },
          select: { dueDate: true },
        });
        return rows.every(
          (r) => r.dueDate != null && dueKey(r.dueDate) >= today
        );
      },
      { timeout: 30_000 }
    )
    .toBe(true);
});
