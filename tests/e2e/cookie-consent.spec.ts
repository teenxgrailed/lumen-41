import { expect, test } from "@playwright/test";

// Every other spec starts with a saved choice (see tests/helpers/consent.ts);
// this one starts clean to prove the banner still appears on a first visit.
test.use({ storageState: { cookies: [], origins: [] } });

test("first visit shows the cookie banner and Decline saves the choice", async ({
  page,
}) => {
  await page.goto("/privacy", { waitUntil: "domcontentloaded" });
  const banner = page.getByRole("region", { name: "Cookie consent" });
  await expect(banner).toBeVisible();

  await banner.getByRole("button", { name: "Decline" }).click();
  await expect(banner).toBeHidden();

  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === "needt_consent")?.value).toBe(
    "declined"
  );
});
