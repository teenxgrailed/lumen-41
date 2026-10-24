import { type Page, expect, test } from "@playwright/test";

import {
  addMinutes,
  formatInTimeZone,
  fromZonedTime,
  newDate,
} from "@/lib/date-utils";
import { weeklyRule } from "@/lib/personal-time";
import { prisma } from "@/lib/prisma";

import { createV3User, signInAs } from "./helpers/v3-user";

/**
 * Personal time can be changed from the screen. Open a block, change its
 * name, when it starts and ends, and which days it repeats on; Save writes
 * `PATCH /api/personal-blocks/:id` (the `personal.update` op the agent also
 * runs) and the band redraws. Before this the peek (desktop) and the sheet
 * (phone) only offered Close and Remove, and nothing in the client called the
 * PATCH route, so a block could be made and removed but never changed.
 *
 * The block repeats every day, so a band is drawn on any day of the week and
 * the test does not depend on which day it runs. Editing a repeating block
 * edits the whole series.
 */
const TZ = "Europe/Zurich";

interface ApiBlock {
  id: string;
  title: string;
  start: string;
  end: string;
  rrule: string | null;
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
  return { id: body.result.block.id, today };
}

async function readBlock(page: Page, id: string) {
  const res = await page.request.get("/api/personal-blocks");
  expect(res.ok()).toBe(true);
  const { blocks } = (await res.json()) as { blocks: ApiBlock[] };
  const block = blocks.find((b) => b.id === id);
  expect(block).toBeTruthy();
  return block!;
}

const clock = (iso: string) => formatInTimeZone(newDate(iso), TZ, "HH:mm");

/** Fill the open form: a new name, 12:30 to 13:15, and one day taken off. */
async function changeAndSave(page: Page, id: string, dropDay: number) {
  const form = page.locator(`[data-pb-edit="${id}"]`);
  await expect(form).toBeVisible();
  await form.locator('[data-pb-field="title"]').fill("Quiet lunch");
  await form.locator('[data-pb-field="start"]').fill("12:30");
  await form.locator('[data-pb-field="end"]').fill("13:15");
  const chip = form.locator(`[data-pb-day="${dropDay}"]`);
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "false");

  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/personal-blocks/${id}`) &&
      r.request().method() === "PATCH"
  );
  await page.locator("[data-pb-save]").click();
  expect((await saved).status()).toBe(200);
}

async function expectSaved(page: Page, id: string, dropDay: number) {
  const block = await readBlock(page, id);
  expect(block.title).toBe("Quiet lunch");
  expect(clock(block.start)).toBe("12:30");
  expect(clock(block.end)).toBe("13:15");
  const days = [0, 1, 2, 3, 4, 5, 6].filter((d) => d !== dropDay);
  expect(block.rrule).toBe(weeklyRule(days));
  // the screen redraws from the saved block
  await expect(
    page.locator(`[data-personal-band="${id}"]`).first()
  ).toHaveAttribute("aria-label", /Quiet lunch, personal time, 12:30–13:15/);
}

/** A weekday that is not today, so today's band stays on screen after Save. */
function otherDay(today: string) {
  const weekday = newDate(`${today}T12:00:00Z`).getUTCDay();
  return (weekday + 3) % 7;
}

test.describe("personal time: change a block", () => {
  test("edits the name, time and repeat from the peek on the desktop", async ({
    page,
  }) => {
    test.skip(
      (page.viewportSize()?.width ?? 0) < 1024,
      "The desktop peek; the phone has its own case."
    );
    await seed(page, "personal-edit-desktop");
    const { id, today } = await keepLunch(page);

    await page.goto("/calendar");
    const band = page.locator(`[data-personal-band="${id}"]`).first();
    await expect(band).toBeVisible({ timeout: 30_000 });
    await band.click();

    const peek = page.locator(`[data-pb-peek="${id}"]`);
    await expect(peek).toBeVisible();
    await peek.locator("[data-pb-edit-open]").click();
    await changeAndSave(page, id, otherDay(today));

    await expect(peek).toHaveCount(0);
    await expectSaved(page, id, otherDay(today));
  });

  test("edits the name, time and repeat from the sheet on the phone", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    await seed(page, "personal-edit-phone");
    await context.addCookies([
      { name: "needt-ui", value: "phone", url: "http://127.0.0.1:3000" },
    ]);
    const { id, today } = await keepLunch(page);

    await page.goto("/calendar");
    await page.locator('.needt-v3[data-ui="phone"]').waitFor();
    const row = page.locator(`[data-personal-band="${id}"]`).first();
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.click();

    await page.locator("[data-pb-edit-open]").click();
    await changeAndSave(page, id, otherDay(today));

    await expectSaved(page, id, otherDay(today));
    await context.close();
  });
});
