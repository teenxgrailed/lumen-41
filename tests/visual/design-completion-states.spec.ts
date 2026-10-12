import { expect, test } from "@playwright/test";

import { signInVisualUser } from "./helpers";

const EVENING_NOW = "2026-07-16T19:30:00+02:00";

async function prepareAuthenticatedPage(page: import("@playwright/test").Page) {
  await page.clock.setFixedTime(new Date(EVENING_NOW));
  await page.addInitScript(() => {
    localStorage.setItem("needt:quick-tip:last-shown-at", "9999999999999");
    localStorage.setItem("needt-visit-count", "0");
  });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await signInVisualUser(page);
  const themeResponse = await page.request.patch("/api/user-settings", {
    data: { theme: "dark" },
  });
  expect(themeResponse.ok()).toBeTruthy();
}

async function settle(page: import("@playwright/test").Page) {
  await page.addStyleTag({
    content:
      "nextjs-portal, .tsqd-parent-container { display: none !important; }",
  });
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator(".animate-pulse")).toHaveCount(0);
  await page.waitForTimeout(250);
}

test("Today uses the production Needt surface at every viewport", async ({
  page,
}) => {
  await prepareAuthenticatedPage(page);
  const taskResponse = await page.request.post("/api/tasks", {
    data: {
      title: "Production Today binding",
      status: "todo",
      duration: 30,
      estimatedMinutes: 30,
      dueDate: EVENING_NOW,
      isAutoScheduled: false,
      autoScheduled: false,
      scheduleLocked: false,
      tagIds: [],
    },
  });
  expect(taskResponse.ok()).toBeTruthy();

  await page.goto("/today", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".needt-v2:not(.needt-notices)")).toHaveAttribute(
    "data-theme",
    "dark"
  );
  // The task is real either way; on a phone it waits behind the Overdue line,
  // which this screenshot deliberately leaves closed.
  await expect(
    page.getByRole("main").getByText("Production Today binding")
  ).not.toHaveCount(0);
  await expect(
    page.getByText("Close the day with an intentional review.")
  ).toHaveCount(0);
  await expect(page.getByText("Prose", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Canvas", { exact: true })).toHaveCount(0);
  await settle(page);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
    )
  ).toBe(false);
});

test("companion stays clear of fixed actions across viewports", async ({
  page,
}) => {
  await prepareAuthenticatedPage(page);
  await page.goto("/today", { waitUntil: "domcontentloaded" });
  const companion = page.getByTestId("needt-ai-companion");
  await expect(companion).toBeVisible();

  const layout = await page.evaluate(() => {
    const companionElement = document.querySelector<HTMLElement>(
      '[data-testid="needt-ai-companion"]'
    );
    if (!companionElement) return null;
    const companionRect = companionElement.getBoundingClientRect();
    const avoids = Array.from(
      document.querySelectorAll<HTMLElement>("[data-assistant-avoid]")
    )
      .filter((element) => {
        const styles = window.getComputedStyle(element);
        return (
          styles.display !== "none" &&
          styles.visibility !== "hidden" &&
          element.getClientRects().length > 0
        );
      })
      .map((element) => element.getBoundingClientRect());
    return {
      companion: {
        left: companionRect.left,
        top: companionRect.top,
        right: companionRect.right,
        bottom: companionRect.bottom,
        width: companionRect.width,
        height: companionRect.height,
      },
      overlap: avoids.some(
        (avoid) =>
          companionRect.left < avoid.right &&
          companionRect.right > avoid.left &&
          companionRect.top < avoid.bottom &&
          companionRect.bottom > avoid.top
      ),
    };
  });

  expect(layout).not.toBeNull();
  expect(layout!.companion.width).toBeGreaterThanOrEqual(44);
  expect(layout!.companion.height).toBeGreaterThanOrEqual(44);
  expect(layout!.companion.left).toBeGreaterThanOrEqual(0);
  expect(layout!.companion.top).toBeGreaterThanOrEqual(0);
  expect(layout!.companion.right).toBeLessThanOrEqual(
    page.viewportSize()!.width
  );
  expect(layout!.companion.bottom).toBeLessThanOrEqual(
    page.viewportSize()!.height
  );
  expect(layout!.overlap).toBe(false);
});

test("Integrations empty search and private bug report dialog stay usable", async ({
  page,
}) => {
  await prepareAuthenticatedPage(page);
  await page.goto("/settings#integrations", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Calendars", level: 2 })
  ).toBeVisible();
  const search = page.getByPlaceholder("Search integrations");
  await expect(search).toBeVisible();
  await search.fill("no-such-integration");
  await expect(page.getByText("No matching integrations.")).toBeVisible();
  await settle(page);
  await expect(page).toHaveScreenshot("settings-integrations-empty.png");

  const reportTrigger = page.getByRole("button", { name: "Report a bug" });
  await reportTrigger.click();
  const report = page.getByRole("dialog", { name: "Report a bug" });
  await expect(report).toBeVisible();
  await expect(
    report.getByRole("combobox", { name: "Severity" })
  ).toContainText("Medium");
  await expect(
    report.getByText("Page content and logs are never")
  ).toBeVisible();
  await settle(page);
  await expect(page).toHaveScreenshot("settings-report-bug.png");
});
