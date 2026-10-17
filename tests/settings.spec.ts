import { type Page, expect, test } from "@playwright/test";
import { SubscriptionPlan } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { createV3User, signInAs } from "./helpers/v3-user";

/*
 * Settings on the v3 screens, against the real API and database. Settings is
 * a sheet over Today: `/settings#section` and `/settings?section=...` open it
 * on that section and leave the address on /today. Nothing in it is saved with
 * a button.
 */

const settings = (page: Page) => page.getByRole("dialog", { name: "Settings" });
const rail = (page: Page) =>
  page.getByRole("navigation", { name: "Settings sections" });

/** The open section's title in the sheet's header. */
const title = (page: Page, name: string) =>
  settings(page).getByRole("banner").getByRole("heading", { name, level: 2 });

/** The switch input is visually hidden; a person presses its track. */
const track = (page: Page, name: string) =>
  page.locator("label.nt-switch").filter({
    has: page.getByRole("switch", { name }),
  });

/** The transient "what you did" pill at the bottom centre. */
const notices = (page: Page) =>
  page.getByRole("region", { name: "Needt action notices" });

test("Settings: a link opens its section, and the rail walks to billing with the real prices", async ({
  page,
}) => {
  const user = await createV3User("settings-nav", {
    plan: SubscriptionPlan.FREE,
  });
  await signInAs(page, user);

  await page.goto("/settings#appearance");
  await expect(title(page, "Appearance")).toBeVisible();
  // The sheet sits over Today; the address does not stay on /settings.
  await expect(page).toHaveURL(/\/today$/);

  await rail(page).getByRole("button", { name: "Plan & billing" }).click();
  await expect(title(page, "Plan & billing")).toBeVisible();
  await expect(settings(page).getByText("Your plan · Free")).toBeVisible();
  await expect(
    settings(page).getByRole("button", { name: /Pro Monthly\s*\$7 \/ month/ })
  ).toBeVisible();
  await expect(
    settings(page).getByRole("button", {
      name: /Pro Yearly\s*\$59 \/ year\s*\$4\.92\/mo/,
    })
  ).toBeVisible();
  await expect(
    settings(page).getByRole("button", { name: /Lifetime\s*\$149 one-time/ })
  ).toBeVisible();
  // Hosted AI is not metered on this screen.
  await expect(settings(page).getByText(/\d+\/\d+ actions left/)).toHaveCount(
    0
  );

  await rail(page).getByRole("button", { name: "Account" }).click();
  await expect(title(page, "Account")).toBeVisible();
  await expect(
    settings(page).locator("#settings-panel").getByText(user.email)
  ).toBeVisible();
});

test("Settings: the 14-day trial starts from Plan & billing and the plan says so", async ({
  page,
}) => {
  const user = await createV3User("settings-trial", {
    plan: SubscriptionPlan.FREE,
  });
  await signInAs(page, user);

  await page.goto("/settings?section=billing");
  await expect(title(page, "Plan & billing")).toBeVisible();
  await settings(page)
    .getByRole("button", { name: "Start 14-day free trial" })
    .click();

  await expect(notices(page)).toContainText(
    "Your 14-day Pro trial has started"
  );
  await expect(settings(page).getByText("Your plan · Pro trial")).toBeVisible();
  await expect(
    settings(page).getByText(/days left of your trial/)
  ).toBeVisible();
  await expect(
    settings(page).getByRole("button", { name: "Start 14-day free trial" })
  ).toHaveCount(0);
  expect(await prisma.trialGrant.count({ where: { userId: user.id } })).toBe(1);
});

test("Settings: a switch saves on its own and is still set after a reload", async ({
  page,
}) => {
  const user = await createV3User("settings-toggle");
  await signInAs(page, user);
  const stored = async () =>
    (
      (await prisma.userSettings.findUnique({ where: { userId: user.id } }))
        ?.prefs as Record<string, unknown> | null
    )?.parts;

  await page.goto("/settings?section=tasks");
  await expect(title(page, "Tasks")).toBeVisible();
  const subtasks = page.getByRole("switch", { name: "Show subtasks" });
  await expect(subtasks).toBeChecked();

  await track(page, "Show subtasks").click();
  await expect(subtasks).not.toBeChecked();
  await expect.poll(stored).toBe(false);

  await page.goto("/settings#tasks");
  await expect(title(page, "Tasks")).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Show subtasks" })
  ).not.toBeChecked();

  // And back: the saved value is the one the person changes, not a default.
  await track(page, "Show subtasks").click();
  await expect.poll(stored).toBe(true);
});

for (const width of [360, 390]) {
  test(`Settings: the phone lists sections and opens one without horizontal overflow at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    const user = await createV3User(`settings-phone-${width}`);
    await signInAs(page, user);

    await page.goto("/settings#data");
    await expect(settings(page).getByText("Data & privacy")).toBeVisible();
    await expect(
      settings(page).getByText(
        "Every task with its project, estimate and dates."
      )
    ).toBeVisible();
    await expect(
      settings(page).getByRole("link", { name: "CSV" })
    ).toBeVisible();
    await expect(
      settings(page).getByRole("switch", { name: "Share usage data" })
    ).toBeVisible();

    // Back to the list of sections, then into another one.
    await settings(page)
      .getByRole("button", { name: "Back to Settings" })
      .click();
    await settings(page)
      .getByRole("button", { name: /^Appearance/ })
      .click();
    await expect(
      settings(page).getByRole("button", { name: "Dark", exact: true })
    ).toHaveAttribute("aria-pressed", "true");

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
  });
}
