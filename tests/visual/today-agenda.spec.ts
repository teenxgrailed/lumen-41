import { expect, test } from "@playwright/test";

import { VISUAL_TEST_NOW } from "./fixtures";
import { signInVisualUser } from "./helpers";

async function prepare(page: import("@playwright/test").Page) {
  await page.clock.setFixedTime(new Date(VISUAL_TEST_NOW));
  await page.addInitScript(() => {
    localStorage.setItem("needt-visit-count", "0");
    localStorage.setItem("needt:quick-tip:last-shown-at", "9999999999999");
  });
  await signInVisualUser(page);
  const theme = await page.request.patch("/api/user-settings", {
    data: { theme: "dark" },
  });
  expect(theme.ok()).toBeTruthy();
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
}

test("Today binds real tasks and keeps completion after reload", async ({
  page,
}, testInfo) => {
  await prepare(page);
  const title = `Today production task ${testInfo.project.name}`;
  const created = await page.request.post("/api/tasks", {
    data: {
      title,
      status: "todo",
      duration: 30,
      estimatedMinutes: 30,
      dueDate: VISUAL_TEST_NOW,
      isAutoScheduled: false,
      autoScheduled: false,
      scheduleLocked: false,
      tagIds: [],
    },
  });
  expect(created.ok()).toBeTruthy();
  const task = (await created.json()) as { id: string };

  await page.goto("/today", { waitUntil: "domcontentloaded" });
  await expect(
    page
      .getByRole("main")
      .getByText(title, { exact: true })
      .locator("visible=true")
      .first()
  ).toBeVisible();
  await expect(page.locator(".needt-v2:not(.needt-notices)")).toHaveAttribute(
    "data-theme",
    "dark"
  );

  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/tasks/${task.id}`) &&
      response.request().method() === "PUT"
  );
  await page
    .getByRole("main")
    .getByRole("checkbox", { name: `Complete ${title}` })
    .click();
  // Each layout shows a finished task differently, so the completion itself is
  // read back from the task rather than from the row.
  expect((await saved).ok()).toBeTruthy();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page
      .getByRole("main")
      .getByText("Today", { exact: true })
      .locator("visible=true")
      .first()
  ).toBeVisible();
  const stored = await page.request.get(`/api/tasks/${task.id}`);
  expect(stored.ok()).toBeTruthy();
  expect(((await stored.json()) as { status: string }).status).toBe(
    "completed"
  );

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth
  );
  expect(overflow).toBe(false);
});

test("Today exposes load failures and recovers", async ({ page }) => {
  await prepare(page);
  // The screen loads more than once per visit, so keep failing until the error
  // state is on screen; releasing on the first hit just hides it again.
  let fail = true;
  await page.route("**/api/needt/today", async (route) => {
    if (fail) {
      await route.fulfill({ status: 503, json: { error: "Unavailable" } });
      return;
    }
    await route.continue();
  });

  await page.goto("/today", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Today could not be loaded.")).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Today could not be loaded.")).toBeHidden();
  await expect(
    page
      .locator(".needt-v2:not(.needt-notices)")
      .getByText("Today", { exact: true })
      .locator("visible=true")
      .first()
  ).toBeVisible();
});
