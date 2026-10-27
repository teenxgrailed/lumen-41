import { type Page, expect, test } from "@playwright/test";

import {
  addMinutes,
  formatInTimeZone,
  fromZonedTime,
  newDate,
} from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import { createV3User, signInAs } from "./helpers/v3-user";

/**
 * Home's day timeline shows personal time as bands. They open the same block
 * view as the calendar: the peek on the desktop, the sheet on the phone, and
 * Edit there renames the block (PATCH /api/personal-blocks/:id). The block
 * repeats every day, so a band is on screen whichever day this runs.
 */
const TZ = "Europe/Zurich";

interface ApiBlock {
  id: string;
  title: string;
}

async function seed(page: Page, label: string) {
  const user = await createV3User(label);
  await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: { timeZone: TZ },
    create: { userId: user.id, timeZone: TZ },
  });
  await page.addInitScript(() => {
    localStorage.setItem("needt:quick-tip:last-shown-at", "9999999999999");
    localStorage.setItem("needt-visit-count", "0");
  });
  await signInAs(page, user);
  return user;
}

async function keepLunch(page: Page) {
  const today = formatInTimeZone(newDate(), TZ, "yyyy-MM-dd");
  const start = fromZonedTime(`${today}T13:00:00`, TZ);
  const res = await page.request.post("/api/personal-blocks", {
    data: {
      kind: "custom",
      title: "Slow lunch",
      emoji: "🍽️",
      start: start.toISOString(),
      end: addMinutes(start, 60).toISOString(),
      rrule: "FREQ=DAILY",
    },
  });
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { result: { block: ApiBlock } };
  return { id: body.result.block.id };
}

async function readTitle(page: Page, id: string) {
  const res = await page.request.get("/api/personal-blocks");
  expect(res.ok()).toBe(true);
  const { blocks } = (await res.json()) as { blocks: ApiBlock[] };
  const block = blocks.find((b) => b.id === id);
  expect(block).toBeTruthy();
  return block!.title;
}

async function rename(page: Page, id: string) {
  const form = page.locator(`[data-pb-edit="${id}"]`);
  await expect(form).toBeVisible();
  await form.locator('[data-pb-field="title"]').fill("Home lunch");
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/personal-blocks/${id}`) &&
      r.request().method() === "PATCH"
  );
  await page.locator("[data-pb-save]").click();
  expect((await saved).status()).toBe(200);
}

test.describe("personal time: open a band from Home", () => {
  test("opens the peek from Home on the desktop and renames the block", async ({
    page,
  }) => {
    test.skip(
      (page.viewportSize()?.width ?? 0) < 1024,
      "The desktop peek; the phone has its own case."
    );
    await seed(page, "personal-home-desktop");
    const { id } = await keepLunch(page);

    await page.goto("/today");
    const band = page.locator(`[data-personal-band="${id}"]`).first();
    await expect(band).toBeVisible({ timeout: 30_000 });
    await band.focus();
    await page.keyboard.press("Enter");

    const peek = page.locator(`[data-pb-peek="${id}"]`);
    await expect(peek).toBeVisible();
    await expect(peek).toContainText("Slow lunch");
    await peek.locator("[data-pb-edit-open]").click();
    await rename(page, id);
    await expect(peek).toHaveCount(0);
    expect(await readTitle(page, id)).toBe("Home lunch");
  });

  test("opens the sheet from Home on the phone and renames the block", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    await seed(page, "personal-home-phone");
    await context.addCookies([
      { name: "needt-ui", value: "phone", url: "http://127.0.0.1:3000" },
    ]);
    const { id } = await keepLunch(page);

    await page.goto("/today");
    await page.locator('.needt-v3[data-ui="phone"]').waitFor();
    const row = page.locator(`[data-personal-band="${id}"]`).first();
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.click();

    await page.locator("[data-pb-edit-open]").click();
    await rename(page, id);
    expect(await readTitle(page, id)).toBe("Home lunch");
    await context.close();
  });
});
