import { type Page, expect, test } from "@playwright/test";
import { SubscriptionPlan } from "@prisma/client";

import { createV3User, signInAs } from "./helpers/v3-user";

/**
 * Goals end to end: make a goal on /goals, add a task to it from its panel,
 * tick the task and see the goal's progress move to 100%. Free sees the Pro
 * label instead of a way to make one.
 */
async function seed(page: Page, label: string, plan?: SubscriptionPlan) {
  const user = await createV3User(label, plan ? { plan } : undefined);
  await page.addInitScript(() => {
    localStorage.setItem("needt:quick-tip:last-shown-at", "9999999999999");
    localStorage.setItem("needt-visit-count", "0");
  });
  await signInAs(page, user);
  return user;
}

test.describe("Goals", () => {
  test("create a goal, link a task, tick it and see progress", async ({
    page,
  }) => {
    await seed(page, "goals-pro");
    await page.goto("/goals");
    await expect(page.getByRole("heading", { name: "Goals" })).toBeVisible();

    await page.getByRole("button", { name: "New goal" }).first().click();
    const sheet = page.locator("[data-gl-sheet]");
    await sheet.locator('input[name="goal-title"]').fill("Run 10k");
    await sheet.getByRole("button", { name: "Health" }).click();
    await sheet.locator("[data-gl-create]").click();

    const panel = page.locator("[data-gl-panel]");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Run 10k" })).toBeVisible();

    const add = panel.getByLabel("Add a task to this goal");
    await add.fill("Buy running shoes");
    await add.press("Enter");
    const task = panel.locator("[data-gl-task]", {
      hasText: "Buy running shoes",
    });
    await expect(task).toBeVisible();
    await expect(panel.locator("[data-gl-percent]")).toHaveText("0%");

    // The box follows the server (no optimistic flip), so click and wait for
    // the progress instead of `check()`, which demands an instant state change.
    await task.getByRole("checkbox").click();
    await expect(panel.locator("[data-gl-percent]")).toHaveText("100%");
    await expect(
      page.locator("[data-gl-goal]", { hasText: "Run 10k" })
    ).toContainText("1 of 1 task");
  });

  test("Free sees the Pro label and cannot create", async ({ page }) => {
    await seed(page, "goals-free", SubscriptionPlan.FREE);
    await page.goto("/goals");
    await expect(page.getByText("Goals are part of Pro")).toBeVisible();
    const res = await page.request.post("/api/goals", {
      data: { title: "Run 10k" },
    });
    expect(res.status()).toBe(403);
  });
});
