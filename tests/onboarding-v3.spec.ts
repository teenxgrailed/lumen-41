import { type Page, expect, test } from "@playwright/test";

/**
 * Onboarding v3 (/start). Walks the screens before the account on the real
 * planner, checks the desktop board geometry the design fixes, and attaches a
 * screenshot of every screen at desktop and phone widths (the page is dark only
 * on thinking, gift and opening; "cats" is also shot under both OS colour
 * schemes to prove there is no theme switch). The shots are test attachments:
 * CI uploads test-results/ and playwright-report/ as the visual review.
 */

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

const SCREENS = [
  "welcome",
  "name",
  "cats",
  "tasks",
  "repeats",
  "priority",
  "days",
  "rhythm",
  "calendar",
  "week",
  "notify",
  "account",
  "plans",
  "card",
] as const;

async function shot(
  page: Page,
  label: string,
  testInfo: import("@playwright/test").TestInfo
) {
  // Entry animations are CSS; let the stage settle before the picture.
  await page.waitForTimeout(1400);
  await testInfo.attach(label, {
    body: await page.screenshot({ fullPage: false }),
    contentType: "image/png",
  });
}

for (const [name, viewport] of [
  ["desktop", DESKTOP],
  ["phone", PHONE],
] as const) {
  test.describe(`onboarding v3 · ${name}`, () => {
    test.use({ viewport });

    for (const step of SCREENS) {
      test(`screen ${step}`, async ({ page }, testInfo) => {
        await page.goto(`/start?step=${step}`);
        await expect(page.locator(".ob3")).toBeVisible();
        await expect(page.locator(".ob3")).toHaveAttribute("data-step", step);
        await shot(page, `${name}-${step}`, testInfo);
      });
    }

    test("planning runs the real planner and ends on the week", async ({
      page,
    }, testInfo) => {
      await page.goto("/start?step=days");
      await page.getByRole("button", { name: "Continue" }).click();
      await page.getByRole("button", { name: "Continue" }).click();
      await expect(page.locator(".ob3")).toHaveAttribute(
        "data-step",
        "calendar"
      );
      await page.getByRole("button", { name: /Use a sample calendar/ }).click();
      await expect(page.locator(".ob3")).toHaveAttribute(
        "data-step",
        "thinking"
      );
      // Dark only while Needt plans.
      await expect(page.locator(".ob3")).toHaveClass(/is-dark/);
      await shot(page, `${name}-thinking`, testInfo);
      await expect(page.locator(".ob3")).toHaveAttribute("data-step", "week", {
        timeout: 20_000,
      });
      await expect(page.locator(".ob3")).toHaveClass(/is-light/);
      await expect(page.getByText("tasks placed")).toBeVisible();
    });
  });
}

test.describe("onboarding v3 · desktop board", () => {
  test.use({ viewport: DESKTOP });

  test("areas are a 4-column board of at most 624 px with a pill row under it", async ({
    page,
  }) => {
    await page.goto("/start?step=cats");
    const cats = page.locator(".ob3-cats");
    await expect(cats).toBeVisible();
    const columns = await cats.evaluate(
      (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length
    );
    expect(columns).toBe(4);
    const box = await cats.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(624 + 1);
    await expect(page.locator(".ob3-foot .ob3-back")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Deselect all" })
    ).toBeVisible();
    await expect(page.locator(".ob3-cta")).toBeVisible();
    // The header shows four parts with fill lines.
    await expect(page.locator(".ob3-ph")).toHaveCount(4);
  });

  test("the week opens on Day by day", async ({ page }) => {
    await page.goto("/start?step=week");
    await expect(page.locator(".ob3-days")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Shuffle" })).toBeVisible();
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`no theme switch: cats looks the same under ${scheme}`, async ({
      browser,
    }, testInfo) => {
      const ctx = await browser.newContext({
        viewport: DESKTOP,
        colorScheme: scheme,
      });
      const page = await ctx.newPage();
      await page.goto("/start?step=cats");
      await expect(page.locator(".ob3")).toHaveClass(/is-light/);
      await shot(page, `desktop-cats-os-${scheme}`, testInfo);
      await ctx.close();
    });
  }
});

test.describe("onboarding v3 · API", () => {
  test("the planner endpoint plans with the engine and refuses empty answers", async ({
    request,
  }) => {
    const bad = await request.post("/api/onboarding/plan", {
      data: { answers: {}, timeZone: "UTC" },
    });
    expect(bad.status()).toBe(422);
    const ok = await request.post("/api/onboarding/plan", {
      data: {
        answers: { areas: ["work"], picks: ["work0", "work1"] },
        timeZone: "Europe/Zurich",
      },
    });
    expect(ok.status()).toBe(200);
    const { plan } = await ok.json();
    expect(plan.placed.length).toBeGreaterThan(0);
    expect(plan.steps).toHaveLength(7);
  });
});
