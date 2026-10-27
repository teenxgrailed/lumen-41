import { type Page, expect, test } from "@playwright/test";

import { formatInTimeZone, newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import { createV3User, signInAs } from "./helpers/v3-user";

/**
 * The desktop Week grid (owner feedback 27.10.26): press and drag down a day
 * to draw a range and the create card opens on it; Hide done lives in the
 * gear; a horizontal wheel (or ←/→ on the focused grid) moves a day.
 */
const TZ = "Europe/Zurich";
/** An hour of the grid is 52px; a quarter hour is 13px. */
const HOUR = 52;

interface ApiTask {
  id: string;
  title: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  scheduleLocked: boolean;
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

const clock = (iso: string | null) =>
  iso ? formatInTimeZone(newDate(iso), TZ, "HH:mm") : null;

const range = (page: Page) => page.locator("[data-c2-range]");

test.describe("calendar week: create, hide done, sideways", () => {
  test.beforeEach(({ page }) => {
    test.skip(
      (page.viewportSize()?.width ?? 0) < 1024,
      "Desktop grid; the phone has its own calendar."
    );
  });

  test("drag over 14:00–15:30 creates a task pinned at that range", async ({
    page,
  }) => {
    await seed(page, "cal-drag-create");
    await page.goto("/calendar");
    const today = formatInTimeZone(newDate(), TZ, "yyyy-MM-dd");
    const col = page.locator(`[data-c2-day="${today}"]`);
    await expect(col).toBeVisible({ timeout: 30_000 });
    // bring 14:00 into the middle of the scroller
    await page
      .locator("[data-c2-wscroll]")
      .evaluate((el, y) => (el.scrollTop = y - 200), 14 * HOUR);
    const box = (await col.boundingBox())!;
    const x = box.x + box.width / 2;
    const y0 = box.y + 14 * HOUR + 3; // just under 14:00
    const y1 = box.y + 15.5 * HOUR; // 15:30
    await page.mouse.move(x, y0);
    await page.mouse.down();
    for (let i = 1; i <= 8; i += 1)
      await page.mouse.move(x, y0 + ((y1 - y0) * i) / 8);
    await expect(page.locator("[data-c2-select]")).toHaveText("14:00–15:30");
    await page.mouse.up();

    const card = page.locator("[data-c2-create]");
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Task", exact: true }).click();
    await expect(card.locator("[data-c2-create-len]")).toHaveText("1 h 30 min");
    await expect(
      card.getByRole("switch", { name: "Pin at this time" })
    ).toBeChecked();
    const title = card.locator("[data-c2-create-title]");
    await title.fill("Deep work");
    const created = page.waitForResponse(
      (r) => r.url().endsWith("/api/tasks") && r.request().method() === "POST"
    );
    await title.press("Enter");
    expect((await created).ok()).toBe(true);
    await expect(card).toBeHidden();

    const res = await page.request.get("/api/tasks");
    const tasks = (await res.json()) as ApiTask[];
    const task = tasks.find((t) => t.title === "Deep work");
    expect(task).toBeTruthy();
    expect(clock(task!.scheduledStart)).toBe("14:00");
    expect(clock(task!.scheduledEnd)).toBe("15:30");
    expect(task!.scheduleLocked).toBe(true);
  });

  test("Esc on the card cancels and removes the ghost", async ({ page }) => {
    await seed(page, "cal-create-esc");
    await page.goto("/calendar");
    const today = formatInTimeZone(newDate(), TZ, "yyyy-MM-dd");
    const col = page.locator(`[data-c2-day="${today}"]`);
    await expect(col).toBeVisible({ timeout: 30_000 });
    await page
      .locator("[data-c2-wscroll]")
      .evaluate((el, y) => (el.scrollTop = y - 200), 10 * HOUR);
    const box = (await col.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + 10 * HOUR + 10);
    await expect(page.locator("[data-c2-create]")).toBeVisible();
    await expect(page.locator('[data-c2-block="draft"]')).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-c2-create]")).toBeHidden();
    await expect(page.locator('[data-c2-block="draft"]')).toHaveCount(0);
  });

  test("Hide done is a toggle in the gear and is remembered", async ({
    page,
  }) => {
    await seed(page, "cal-hide-done");
    await page.goto("/calendar");
    await expect(page.locator("[data-c2-strip]")).toBeVisible({
      timeout: 30_000,
    });
    // no loose button in the header any more
    await expect(page.locator("[data-c2-hide-done]")).toHaveCount(0);
    await page.locator("[data-task-view-gear]").click();
    const toggle = page.getByRole("switch", { name: "Hide done" });
    await expect(toggle).not.toBeChecked();
    const saved = page.waitForResponse(
      (r) =>
        r.url().includes("/api/user-settings") && r.request().method() !== "GET"
    );
    // the switch input is visually hidden; a person presses its track
    await page
      .locator("label.nt-switch")
      .filter({ has: toggle })
      .locator(".nt-switch-track")
      .click();
    expect((await saved).ok()).toBe(true);
    await expect(toggle).toBeChecked();

    await page.reload();
    await expect(page.locator("[data-c2-strip]")).toBeVisible({
      timeout: 30_000,
    });
    await page.locator("[data-task-view-gear]").click();
    await expect(page.getByRole("switch", { name: "Hide done" })).toBeChecked();
  });

  test("a horizontal wheel and ←/→ move the week by a day", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await seed(page, "cal-sideways");
    await page.goto("/calendar");
    const grid = page.locator("[data-c2-wscroll]");
    await expect(grid).toBeVisible({ timeout: 30_000 });
    const first = async () =>
      grid.evaluate((el) => {
        const head = el.getBoundingClientRect();
        const cols = Array.from(
          el.querySelectorAll<HTMLElement>("[data-c2-day]")
        );
        const seen = cols
          .map((c) => ({ d: c.dataset.c2Day!, x: c.getBoundingClientRect().x }))
          .filter((c) => c.x >= head.x + 50)
          .sort((a, b) => a.x - b.x);
        return seen[0]?.d ?? null;
      });
    const addDay = (d: string, n: number) => {
      const t = new Date(`${d}T12:00:00Z`);
      t.setUTCDate(t.getUTCDate() + n);
      return t.toISOString().slice(0, 10);
    };
    const start = await first();
    expect(start).toBeTruthy();
    const label = await range(page).textContent();

    const box = (await grid.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(300, 0);
    await expect.poll(first).toBe(addDay(start!, 1));
    await expect(range(page)).not.toHaveText(label ?? "");

    // after the gesture ends, ← steps back a day on the focused grid
    await page.waitForTimeout(400);
    await grid.focus();
    await page.keyboard.press("ArrowLeft");
    await expect.poll(first).toBe(start);
    await page.keyboard.press("ArrowRight");
    await expect.poll(first).toBe(addDay(start!, 1));
  });
});
