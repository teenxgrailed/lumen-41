import { expect, test } from "@playwright/test";

test("sign-in treats an external callbackUrl as a local calendar fallback", async ({
  page,
}) => {
  await page.goto("/auth/signin?callbackUrl=https://attacker.invalid");

  // The v3 sign-in: "Welcome back", the address first, then Continue.
  await expect(
    page.getByRole("heading", { name: "Welcome back" })
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
  // Nothing the hostile parameter carried reaches the page.
  await expect(page.getByText("attacker.invalid")).toHaveCount(0);
});
