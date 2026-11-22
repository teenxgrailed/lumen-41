import { type Page, expect, test } from "@playwright/test";

import { formatInTimeZone, newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import { createV3User, signInAs } from "./helpers/v3-user";

/**
 * A task's icon comes from its title (a local keyword map). From the task
 * sheet the person can pick another one, or hand the choice back to
 * Automatic. The choice is the task's `icon`, read back over the API the way
 * a connector would. `PHONE_SHOTS=<dir>` also writes shots of Home (390 px).
 */
const TZ = "Europe/Zurich";
const today = () => formatInTimeZone(newDate(), TZ, "yyyy-MM-dd");

const apiIcon = async (page: Page, id: string) => {
  const res = await page.request.get(`/api/tasks/${id}`);
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { icon: string | null }).icon;
};

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  colorScheme: "dark",
  serviceWorkers: "block",
});
test.setTimeout(240_000);

test("the icon of a task is changed from its sheet and kept on the task", async ({
  page,
}) => {
  const user = await createV3User("task-icon");
  await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: { timeZone: TZ, theme: "dark" },
    create: { userId: user.id, timeZone: TZ, theme: "dark" },
  });
  const id = `${user.id}-icon`;
  await prisma.task.create({
    data: {
      id,
      userId: user.id,
      workspaceId: user.workspaceId,
      assigneeId: user.id,
      title: "Write pricing page copy",
      status: "todo",
      isAutoScheduled: false,
      estimatedMinutes: 30,
      duration: 30,
      dueDate: new Date(`${today()}T00:00:00.000Z`),
    },
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
  await page.request.post("/api/day-plan/draft", { data: { date: today() } });
  await page.goto("/today", {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await page.locator("[data-day-plan]").waitFor({ timeout: 60_000 });
  if (process.env.PHONE_SHOTS) {
    await page.screenshot({ path: `${process.env.PHONE_SHOTS}/home.png` });
  }

  const glyph = page.locator("[data-day-plan] [data-task-icon]").first();
  await expect(glyph).toHaveAttribute("data-task-icon", "write");
  expect(await apiIcon(page, id)).toBeNull();

  await page
    .locator("[data-day-plan]")
    .getByText("Write pricing page copy")
    .first()
    .click();
  const sheet = page.locator(`[data-pov-task="${id}"]`);
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  const button = sheet.locator("[data-pov-icon]");
  await expect(button).toHaveAttribute("data-task-icon", "write");
  await button.click();
  await sheet.locator('[data-pov-icon-key="cook"]').click();
  await expect.poll(() => apiIcon(page, id), { timeout: 30_000 }).toBe("cook");
  await expect(button).toHaveAttribute("data-task-icon", "cook");

  // Automatic hands the choice back to the title
  await button.click();
  await sheet.getByRole("button", { name: "Automatic" }).click();
  await expect.poll(() => apiIcon(page, id), { timeout: 30_000 }).toBeNull();
  await expect(button).toHaveAttribute("data-task-icon", "write");

  // the API takes an icon too (a connector writes it the same way)
  const put = await page.request.put(`/api/tasks/${id}`, {
    data: { icon: "travel" },
  });
  expect(put.ok()).toBe(true);
  expect(await apiIcon(page, id)).toBe("travel");
});
