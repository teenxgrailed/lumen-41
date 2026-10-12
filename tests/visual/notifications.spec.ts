import { expect, test } from "@playwright/test";

import { signInVisualUser } from "./helpers";

/* Notifications moved from Sonner to the design's corner stack. Everything in
 * the product raises them through one facade, so the risk is not that a call
 * site breaks — it is that the renderer silently stops rendering and two
 * hundred messages disappear at once, which no screenshot would catch.
 *
 * A failure is the message that matters most, so that is the one driven here:
 * it also proves the one thing Sonner used to give for free and this stack
 * had to be taught — that an error interrupts a screen reader rather than
 * waiting politely for a pause. */

test.skip(
  ({ viewport }) => (viewport?.width ?? 0) < 1024,
  "One viewport is enough: this is the renderer, not the layout."
);

/* The production build registers the PWA worker, and it answers a request
 * before a route stub ever sees it — the E2E config blocks workers for this
 * reason and the visual config does not. */
test.use({ serviceWorkers: "block" });

test("A failure from the product lands in the corner stack, and interrupts", async ({
  page,
}) => {
  await signInVisualUser(page);

  // The product says "Could not update this task" when this refuses.
  await page.route("**/api/tasks/**", async (route) => {
    if (route.request().method() === "PUT") {
      return route.fulfill({ status: 500, json: { error: "nope" } });
    }
    return route.continue();
  });

  await page.goto("/tasks");
  await page.getByRole("checkbox").first().click();

  const stack = page.getByRole("region", { name: "Needt notifications" });
  await expect(stack).toBeVisible({ timeout: 20_000 });
  await expect(stack).toContainText("Could not update this task");
  await expect(stack).toHaveAttribute("aria-live", "assertive");

  // And it can be sent away.
  await stack.getByRole("button", { name: "Dismiss notification" }).click();
  await expect(stack).toBeHidden({ timeout: 10_000 });
});

/* The stack is anchored to a fixed strip down the right-hand side, and the
 * right-hand side of several screens is where the buttons are — "Plan my
 * day" on Today, the calendar's own controls, half of Settings. A layer that
 * swallowed a press there would be invisible in every screenshot and obvious
 * to the first person who tried to use the product. */
test("The corner's strip does not swallow the buttons behind it", async ({
  page,
}) => {
  await signInVisualUser(page);
  await page.goto("/today");

  const plan = page.getByRole("button", { name: "Plan my day" });
  await expect(plan).toBeVisible({ timeout: 20_000 });

  // It sits inside the strip: the right edge of the window, where the stack
  // anchors. With nothing raised, the press has to reach it.
  const box = await plan.boundingBox();
  const width = page.viewportSize()?.width ?? 0;
  expect(box, "Plan my day should be laid out").not.toBeNull();
  expect(width - (box!.x + box!.width)).toBeLessThan(388);

  await plan.click({ timeout: 10_000 });

  // And the card, when there is one, takes its own presses.
  await page.route("**/api/tasks/**", (route) =>
    route.request().method() === "PUT"
      ? route.fulfill({ status: 500, json: { error: "nope" } })
      : route.continue()
  );
  await page.goto("/tasks");
  await page.getByRole("checkbox").first().click();
  const stack = page.getByRole("region", { name: "Needt notifications" });
  await expect(stack).toBeVisible({ timeout: 20_000 });
  await stack.getByRole("button", { name: "Dismiss notification" }).click();
  await expect(stack).toBeHidden({ timeout: 10_000 });
});
