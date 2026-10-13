import { expect, test } from "@playwright/test";

import { VISUAL_TEST_NOW } from "./fixtures";
import { signInVisualUser } from "./helpers";

async function settleVisualSurface(page: import("@playwright/test").Page) {
  await page.addStyleTag({
    content:
      "nextjs-portal, .tsqd-parent-container { display: none !important; }",
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.waitForTimeout(250);
}

async function useVisualTheme(
  page: import("@playwright/test").Page,
  theme: "dark" | "paper"
) {
  await page.emulateMedia({
    colorScheme: theme === "dark" ? "dark" : "light",
    reducedMotion: "reduce",
  });
  const update = await page.request.patch("/api/user-settings", {
    data: { theme },
  });
  expect(update.ok()).toBeTruthy();
  const settingsResponses = Promise.all(
    ["/api/user-settings", "/api/customization"].map((pathname) =>
      page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === pathname &&
          response.request().method() === "GET"
      )
    )
  );
  await page.goto("/settings#theme", { waitUntil: "domcontentloaded" });
  await settingsResponses;
  const themePicker = page.getByRole("combobox", { name: "Theme" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  await expect(page.getByText("Monday", { exact: true })).toBeVisible();
  await expect(themePicker).toHaveText(theme === "dark" ? "Dark" : "Paper");
  await expect(
    page
      .getByText("Animations:", { exact: true })
      .locator("..")
      .getByRole("switch")
  ).not.toBeChecked();
}

test("Calendar, Today, and Workspace stay visually stable", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date(VISUAL_TEST_NOW));
  await page.addInitScript(() => {
    localStorage.setItem("needt:quick-tip:last-shown-at", String(Date.now()));
    localStorage.setItem("needt-visit-count", "0");
  });
  await signInVisualUser(page);
  await useVisualTheme(page, "dark");
  await settleVisualSurface(page);
  await expect(page).toHaveScreenshot("settings-appearance.png");
  await page.goto("/calendar", { waitUntil: "domcontentloaded" });

  await expect(page.locator(".needt-v2:not(.needt-notices)")).toHaveAttribute(
    "data-theme",
    "dark"
  );
  await expect(
    page.locator(
      (page.viewportSize()?.width ?? 0) < 640
        ? '[data-calendar-view="day"]'
        : '[data-calendar-view="week"]'
    )
  ).toBeVisible();
  const calendarView = page.locator(
    (page.viewportSize()?.width ?? 0) < 640
      ? '[data-calendar-view="day"]'
      : '[data-calendar-view="week"]'
  );
  await expect(
    calendarView.getByText("Review calendar sync", { exact: true })
  ).toBeVisible();
  await settleVisualSurface(page);
  await expect(page).toHaveScreenshot("calendar.png");

  await page.evaluate(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true })
    );
  });
  await expect(
    page.getByRole("dialog", { name: "Command Menu" })
  ).toBeVisible();
  await settleVisualSurface(page);
  await expect(page).toHaveScreenshot("command-palette.png");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "New event" }).click();
  await expect(page.getByRole("heading", { name: "New event" })).toBeVisible();
  await settleVisualSurface(page);
  await expect(page).toHaveScreenshot("calendar-create-event.png");
  await page.keyboard.press("Escape");

  await page.goto("/today", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".needt-v2:not(.needt-notices)")).toHaveAttribute(
    "data-theme",
    "dark"
  );
  await expect(
    page
      .getByRole("main")
      .getByText("Plan the launch")
      .locator("visible=true")
      .first()
  ).toBeVisible();
  await settleVisualSurface(page);
  await expect(page).toHaveScreenshot("today.png");

  const pageList = await page.request.get("/api/pages");
  expect(pageList.ok()).toBeTruthy();
  const pagePayload = (await pageList.json()) as {
    pages: Array<{ id: string; title: string }>;
  };
  let visualPage = pagePayload.pages.find(
    (entry) => entry.title === "Visual design notes"
  );
  if (!visualPage) {
    const createResponse = await page.request.post("/api/pages", {
      data: { title: "Visual design notes", icon: "🎨" },
    });
    expect(createResponse.ok()).toBeTruthy();
    visualPage = (
      (await createResponse.json()) as {
        page: { id: string; title: string };
      }
    ).page;
  }
  await page.goto(`/pages/${visualPage.id}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("Page document")).toBeVisible();
  await settleVisualSurface(page);
  await expect(page).toHaveScreenshot("page-document.png");

  await page.goto("/tasks", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".needt-v2:not(.needt-notices)")).toHaveAttribute(
    "data-theme",
    "dark"
  );
  await expect(
    page
      .getByRole("main")
      .getByText("Review calendar sync")
      .locator("visible=true")
      .first()
  ).toBeVisible();
  await settleVisualSurface(page);
  await expect(page).toHaveScreenshot("workspace.png");

  if ((page.viewportSize()?.width ?? 0) >= 640) {
    await page.getByRole("button", { name: "Kanban" }).click();
    await expect(page.getByText("In progress")).toBeVisible();
    await page.getByRole("button", { name: "Flow" }).click();
    await expect(
      page.getByText("Review calendar sync").locator("visible=true").first()
    ).toBeVisible();
  }
});

test("primary app surfaces stay coherent in light mode", async ({ page }) => {
  await page.clock.setFixedTime(new Date(VISUAL_TEST_NOW));
  await page.addInitScript(() => {
    localStorage.setItem("needt:quick-tip:last-shown-at", "9999999999999");
    localStorage.setItem("needt-visit-count", "0");
  });
  await signInVisualUser(page);
  await useVisualTheme(page, "paper");
  await settleVisualSurface(page);
  await expect(page).toHaveScreenshot("settings-appearance-light.png");

  await page.goto("/calendar", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".needt-v2:not(.needt-notices)")).toHaveAttribute(
    "data-theme",
    "paper"
  );
  await expect(
    page.locator(
      (page.viewportSize()?.width ?? 0) < 640
        ? '[data-calendar-view="day"]'
        : '[data-calendar-view="week"]'
    )
  ).toBeVisible();
  await settleVisualSurface(page);
  await expect(page).toHaveScreenshot("calendar-light.png");

  await page.evaluate(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true })
    );
  });
  await expect(
    page.getByRole("dialog", { name: "Command Menu" })
  ).toBeVisible();
  await settleVisualSurface(page);
  await expect(page).toHaveScreenshot("command-palette-light.png");
  await page.keyboard.press("Escape");

  await page.goto("/today", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".needt-v2:not(.needt-notices)")).toHaveAttribute(
    "data-theme",
    "paper"
  );
  await settleVisualSurface(page);
  await expect(page).toHaveScreenshot("today-light.png");

  await page.goto("/tasks", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".needt-v2:not(.needt-notices)")).toHaveAttribute(
    "data-theme",
    "paper"
  );
  await expect(
    page
      .getByRole("main")
      .getByText("Review calendar sync")
      .locator("visible=true")
      .first()
  ).toBeVisible();
  await settleVisualSurface(page);
  await expect(page).toHaveScreenshot("workspace-light.png");
});
