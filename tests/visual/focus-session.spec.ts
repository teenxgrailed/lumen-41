import { expect, test } from "@playwright/test";

import { signInVisualUser } from "./helpers";

/* The rail's Focus control drives the product's own session, not a timer of
 * its own. It was ported with local React state — right for the design
 * preview, and in the application a session that `/focus`, the history and
 * the stats cannot see, and that a reload throws away. Nothing about that is
 * visible on a screenshot, so it is asserted here.
 *
 * One viewport is enough: this is behaviour, not a picture, and the rail only
 * exists above `lg`. */
test.skip(
  ({ viewport }) => (viewport?.width ?? 0) < 1024,
  "The rail is a desktop surface, and this is behaviour, not a picture."
);

test("A focus session started from the rail is the product's own", async ({
  page,
}) => {
  await signInVisualUser(page);
  await page.goto("/today");
  await page.getByRole("button", { name: "Focus" }).click();
  await page.getByPlaceholder("What is this session for?").fill("Wire check");
  await page.getByRole("tab", { name: "25 min" }).click();
  await page.getByRole("button", { name: "Start" }).click();

  // The rail shows the running session.
  await expect(page.getByRole("button", { name: /Wire check/ })).toBeVisible({
    timeout: 15_000,
  });

  // The server knows about it.
  const active = await page.evaluate(async () =>
    (await fetch("/api/focus/active")).json()
  );
  expect(active.active).toBe(true);

  // And it survives a reload, which an in-memory timer would not.
  await page.reload();
  await expect(page.getByRole("button", { name: /Wire check/ })).toBeVisible({
    timeout: 20_000,
  });

  // Stopping from the rail ends it on the server too. The rail still asks
  // first and then ends; a normal session has no wait between the two.
  await page.getByRole("button", { name: /Wire check/ }).click();
  await expect(page.getByRole("button", { name: /Press to end/ })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: /Press to end/ }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(async () =>
          (await fetch("/api/focus/active")).json()
        )).active,
      { timeout: 15_000 }
    )
    .toBe(false);
});
