import { type Page, expect, test } from "@playwright/test";

import { signInVisualUser } from "./helpers";

/* Notifications are raised through one facade (`notify`, src/lib/notifications)
 * from two hundred places, so the risk is not that a call site breaks — it is
 * that the stack silently stops rendering and every message disappears at
 * once, which no other screenshot would catch.
 *
 * v3 draws what you did (and its Undo) as a compact pill at the bottom centre,
 * the region "Needt action notices", and the product speaking on its own
 * initiative in the bottom-right corner. A failure is the message that
 * matters most, so that is the one driven here, through the path a person
 * takes: tick a task while the server refuses the write. The tick puts the
 * old fields back and says "Could not update the task. Your change was
 * reverted." — once, and urgently, which is the one thing Sonner gave for free
 * and this stack had to be taught: an error interrupts a screen reader rather
 * than waiting politely for a pause. */

test.skip(
  ({ viewport }) => (viewport?.width ?? 0) < 1024,
  "One viewport is enough: this is the renderer, not the layout."
);

/* The production build registers the PWA worker, and it answers a request
 * before a route stub ever sees it — the E2E config blocks workers for this
 * reason and the visual config does not. */
test.use({ serviceWorkers: "block" });

const REFUSED = "Could not update the task. Your change was reverted.";

/** Make the API refuse every write to a task. */
async function refuseTaskWrites(page: Page) {
  await page.route("**/api/tasks/**", async (route) => {
    if (route.request().method() === "PUT") {
      return route.fulfill({ status: 500, json: { error: "nope" } });
    }
    return route.continue();
  });
}

/** Tick the first task on the Tasks screen. */
async function tickFirstTask(page: Page) {
  await page.goto("/tasks");
  // `exact`: the row is itself a button whose name also contains "Mark done".
  const tick = page.getByRole("button", { name: "Mark done", exact: true });
  await expect(tick.first()).toBeVisible({ timeout: 20_000 });
  await tick.first().click();
}

test("A refused write raises one risk notice in the action stack, and interrupts", async ({
  page,
}) => {
  await signInVisualUser(page);
  await refuseTaskWrites(page);
  await tickFirstTask(page);

  const stack = page.getByRole("region", { name: "Needt action notices" });
  await expect(stack).toBeVisible({ timeout: 20_000 });
  await expect(stack).toContainText(REFUSED);
  await expect(stack).toHaveAttribute("aria-live", "assertive");
  // One refused write is one card: a retry of the whole mutation would send
  // the write twice and stack a second "Could not ..." on the first.
  await expect(stack.locator('[data-toast-kind="risk"]')).toHaveCount(1);

  await expect(stack).toHaveScreenshot("risk-notice.png", {
    // The pill's entrance has settled once the fold arithmetic has run.
    animations: "disabled",
  });

  // And it can be sent away. The dismiss mark is 0 wide until the pill is
  // hovered, which also holds its dismiss clock.
  await stack.hover();
  await stack.getByRole("button", { name: "Dismiss notification" }).click();
  await expect(stack).toBeHidden({ timeout: 10_000 });
});

/* The bottom-right corner is the Ask Needt pill and, when the product has
 * something to say, its island; the right-hand side of several screens is also
 * where the buttons are — "Plan my day" on Today, the task-view gear, the
 * calendar's own controls. A layer that swallowed a press there would be
 * invisible in every screenshot and obvious to the first person who tried to
 * use the product. So: with nothing raised and with a notice up, whatever is
 * under the middle of each button in that strip must be that button. */
test("The corner's layers do not swallow the buttons behind them", async ({
  page,
}) => {
  await signInVisualUser(page);
  await page.goto("/today");

  const plan = page.getByRole("button", { name: "Plan my day" });
  await expect(plan).toBeVisible({ timeout: 20_000 });

  const buttonsUnderLayers = () =>
    page.evaluate(() => {
      const strip = 388;
      const hidden: string[] = [];
      let checked = 0;
      for (const b of document.querySelectorAll<HTMLElement>(
        "main button, main a"
      )) {
        const r = b.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        if (window.innerWidth - r.right >= strip) continue;
        if (r.bottom < 0 || r.top > window.innerHeight) continue;
        checked += 1;
        const top = document.elementFromPoint(
          r.left + r.width / 2,
          r.top + r.height / 2
        );
        if (!top || !(b === top || b.contains(top))) {
          hidden.push(b.getAttribute("aria-label") ?? b.textContent ?? "?");
        }
      }
      return { checked, hidden };
    });

  // "Plan my day" sits in the strip, so the check has something to check.
  const quiet = await buttonsUnderLayers();
  expect(quiet.checked).toBeGreaterThan(0);
  expect(quiet.hidden).toEqual([]);
  await plan.click({ timeout: 10_000 });

  // With a notice up the stack is on screen too; the same must hold.
  await page.goto("/tasks");
  await refuseTaskWrites(page);
  await tickFirstTask(page);
  const stack = page.getByRole("region", { name: "Needt action notices" });
  await expect(stack).toContainText(REFUSED, { timeout: 20_000 });
  const loud = await buttonsUnderLayers();
  expect(loud.hidden).toEqual([]);

  await stack.hover();
  await stack.getByRole("button", { name: "Dismiss notification" }).click();
  await expect(stack).toBeHidden({ timeout: 10_000 });
});
