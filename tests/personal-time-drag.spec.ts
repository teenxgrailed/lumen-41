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
 * Personal time can be moved and resized on the week grid. Take a band and
 * drag it: it keeps its length and lands on the quarter hour under the hand.
 * Pull its bottom edge: only the end moves. Both write
 * `PATCH /api/personal-blocks/:id` (the `personal.update` op the agent runs).
 * A repeating block moves as a whole series, so it asks first ("Move every
 * repeat" or Cancel). Before this a band could only be changed from the form
 * in its card.
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

/** Today 10:00 to 11:00 in Zurich, once or every day. */
async function keepWalk(page: Page, rrule: string | null) {
  const today = formatInTimeZone(newDate(), TZ, "yyyy-MM-dd");
  const start = fromZonedTime(`${today}T10:00:00`, TZ);
  const res = await page.request.post("/api/personal-blocks", {
    data: {
      kind: "custom",
      title: "Long walk",
      emoji: "🚶",
      start: start.toISOString(),
      end: addMinutes(start, 60).toISOString(),
      ...(rrule ? { rrule } : {}),
    },
  });
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { result: { block: ApiBlock } };
  return body.result.block.id;
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

const patched = (page: Page, id: string) =>
  page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/personal-blocks/${id}`) &&
      r.request().method() === "PATCH"
  );

const bandOf = (page: Page, id: string) =>
  page.locator(`[data-personal-band="${id}"]`).first();

/** Open the calendar with the band in the middle of the grid, away from the autoscroll edges. */
async function openCalendar(page: Page, id: string) {
  await page.goto("/calendar");
  const band = bandOf(page, id);
  await expect(band).toBeVisible({ timeout: 30_000 });
  await band.evaluate((el) => el.scrollIntoView({ block: "center" }));
  return band;
}

/** Press inside the band, travel `dy` px, release. A pointer stream, in steps. */
async function drag(page: Page, from: { x: number; y: number }, dy: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const steps = 8;
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(from.x, from.y + (dy * i) / steps);
  }
  await page.mouse.up();
}

/** An hour of the grid is 52px; a quarter hour is 13px. */
const HOUR = 52;

test.describe("personal time: move and resize on the grid", () => {
  test.beforeEach(({ page }) => {
    test.skip(
      (page.viewportSize()?.width ?? 0) < 1024,
      "Desktop grid; the phone has no drag."
    );
  });

  test("drags a band an hour down, then pulls its end 30 minutes", async ({
    page,
  }) => {
    await seed(page, "personal-drag");
    const id = await keepWalk(page, null);
    const band = await openCalendar(page, id);

    // move: grab the upper part of the band, well clear of the bottom edge
    const box = (await band.boundingBox())!;
    const moved = patched(page, id);
    await drag(page, { x: box.x + box.width / 2, y: box.y + 14 }, HOUR);
    expect((await moved).status()).toBe(200);

    const after = await readBlock(page, id);
    expect(clock(after.start)).toBe("11:00");
    expect(clock(after.end)).toBe("12:00");
    await expect(bandOf(page, id)).toHaveAttribute(
      "aria-label",
      /Long walk, personal time, 11:00–12:00/
    );

    // resize: the grip on the bottom edge moves only the end
    const grip = bandOf(page, id).locator("[data-pb-resize]");
    await bandOf(page, id).evaluate((el) =>
      el.scrollIntoView({ block: "center" })
    );
    const g = (await grip.boundingBox())!;
    const resized = patched(page, id);
    await drag(page, { x: g.x + g.width / 2, y: g.y + g.height / 2 }, HOUR / 2);
    expect((await resized).status()).toBe(200);

    const final = await readBlock(page, id);
    expect(clock(final.start)).toBe("11:00");
    expect(clock(final.end)).toBe("12:30");
    expect(final.rrule).toBeNull();
    await expect(bandOf(page, id)).toHaveAttribute(
      "aria-label",
      /Long walk, personal time, 11:00–12:30/
    );
  });

  test("a repeating band asks before the whole series moves", async ({
    page,
  }) => {
    await seed(page, "personal-drag-series");
    const id = await keepWalk(page, "FREQ=DAILY");
    const band = await openCalendar(page, id);
    const box = (await band.boundingBox())!;
    const from = { x: box.x + box.width / 2, y: box.y + 14 };

    // Cancel: nothing is written and the band stays
    let writes = 0;
    page.on("request", (r) => {
      if (
        r.method() === "PATCH" &&
        r.url().endsWith(`/api/personal-blocks/${id}`)
      )
        writes += 1;
    });
    await drag(page, from, HOUR);
    const ask = page.locator("[data-pb-drop-confirm]");
    await expect(ask).toHaveText("Move every repeat");
    await page.locator("[data-pb-drop-cancel]").click();
    await expect(ask).toBeHidden();
    expect(writes).toBe(0);
    expect(clock((await readBlock(page, id)).start)).toBe("10:00");

    // Move every repeat: the series shifts, still daily
    await bandOf(page, id).evaluate((el) =>
      el.scrollIntoView({ block: "center" })
    );
    const again = (await bandOf(page, id).boundingBox())!;
    await drag(page, { x: again.x + again.width / 2, y: again.y + 14 }, HOUR);
    const moved = patched(page, id);
    await ask.click();
    expect((await moved).status()).toBe(200);
    const after = await readBlock(page, id);
    expect(clock(after.start)).toBe("11:00");
    expect(clock(after.end)).toBe("12:00");
    expect(after.rrule).toBe("FREQ=DAILY");
  });
});
