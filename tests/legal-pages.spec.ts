import { expect, test } from "@playwright/test";

for (const [path, title] of [
  ["/terms", "Needt Terms of Service"],
  ["/privacy", "Needt Privacy Notice"],
  ["/subprocessors", "Needt Subprocessors"],
] as const) {
  test(`${path} publishes the final document`, async ({ page }) => {
    await page.goto(path);

    await expect(
      page.getByRole("heading", { name: title, level: 1 })
    ).toBeVisible();
    await expect(page.getByText("Owner review required")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("{{");
  });
}
