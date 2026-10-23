import { type Page, expect, test } from "@playwright/test";

import { VISUAL_TEST_NOW } from "./fixtures";
import { signInVisualUser } from "./helpers";

/*
 * Settings -> Desktop -> Widgets: the live preview of the Today medium widget.
 * Picking a style tile shows that style, light and dark, built from the lab's
 * markup; the rows are the person's own tasks for today when there are some.
 * The Mac app is simulated with `window.__needtNative` (what the Swift shell
 * sets). One screenshot of the preview per style, plus one with real tasks.
 */
test.skip(
  ({ viewport }) => (viewport?.width ?? 0) < 768,
  "The phone settings sheet has no Desktop group."
);
// The PWA service worker answers /api/tasks from the network once it controls
// the page, past page.route: the preview would show the seeded user's tasks.
test.use({ serviceWorkers: "block" });

const STYLES = [
  ["A", "Sky"],
  ["B", "Pixel"],
  ["C", "Bento"],
  ["D", "Ink"],
  ["E", "Lucky cat"],
  ["F", "Noir"],
  ["G", "Mist"],
  ["H", "Rim"],
] as const;

async function prepare(page: Page, tasks?: unknown[]) {
  await page.clock.setFixedTime(new Date(VISUAL_TEST_NOW));
  await page.addInitScript(() => {
    localStorage.setItem("needt:quick-tip:last-shown-at", "9999999999999");
    localStorage.setItem("needt-visit-count", "0");
    (window as unknown as { __needtNative: object }).__needtNative = {};
  });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.route("**/api/billing", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        plan: "PRO",
        status: "ACTIVE",
        interval: "year",
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        canManageBilling: false,
        usage: {
          calendars: { used: 0, limit: 1 },
          autoScheduledTasks: { used: 0, limit: 15 },
          boards: { used: 1, limit: 1 },
          mailboxes: { used: 1, limit: 0 },
          aiActions: { used: 0, limit: 0 },
        },
      }),
    });
  });
  // No tasks unless the test brings some: the preview then shows the lab's week.
  await page.route("**/api/tasks", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(tasks ?? []),
    });
  });
  await signInVisualUser(page);
}

async function open(page: Page) {
  await page.goto("/settings#widgets", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/today$/);
  await expect(
    page.getByRole("group", { name: "Style for new widgets" })
  ).toBeVisible();
  await page.addStyleTag({
    content:
      'nextjs-portal, .tsqd-parent-container, aside[aria-label="Quick Tip"] { display: none !important; }',
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

for (const [key, name] of STYLES) {
  test(`Settings Widgets preview, ${name}`, async ({ page }) => {
    await prepare(page);
    await open(page);
    await page
      .getByRole("button", { name: new RegExp(`^${key} · ${name}$`) })
      .click();
    const preview = page.getByTestId("widget-preview");
    await expect(preview).toHaveAttribute("data-style", key);
    await expect(preview.getByRole("img")).toHaveCount(2);
    // Real size: medium is 338 x 158 pt in both themes.
    for (const w of await preview.locator(".w").all()) {
      const box = await w.boundingBox();
      expect(box?.width).toBe(338);
      expect(box?.height).toBe(158);
    }
    await page.waitForTimeout(350);
    await expect(preview).toHaveScreenshot(
      `settings-widgets-preview-${key}.png`
    );
  });
}

test("Settings Widgets preview shows the person's own tasks", async ({
  page,
}) => {
  const day = VISUAL_TEST_NOW.slice(0, 10);
  const tasks = [
    ["Send the invoice", "completed", "09:30"],
    ["Prepare the board deck", "todo", "15:00"],
    ["Pick up the parcel", "todo", "16:30"],
    ["Evening run", "todo", "18:00"],
  ].map(([title, status, at], i) => ({
    id: `t${i}`,
    title,
    status,
    scheduledStart: `${day}T${at}:00.000Z`,
  }));
  await prepare(page, tasks);
  await open(page);
  await page.getByRole("button", { name: /^A · Sky$/ }).click();
  const preview = page.getByTestId("widget-preview");
  await expect(
    preview.getByText("Prepare the board deck").first()
  ).toBeVisible();
  await page.waitForTimeout(350);
  await expect(preview).toHaveScreenshot("settings-widgets-preview-tasks.png");
});
