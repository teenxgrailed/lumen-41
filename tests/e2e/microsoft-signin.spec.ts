import { expect, test } from "@playwright/test";

import { consentCookieFor } from "../helpers/consent";

/**
 * "Continue with Microsoft" appears only when the server has the Azure
 * credentials (AZURE_AD_CLIENT_ID and AZURE_AD_CLIENT_SECRET). The e2e server
 * runs without them, so the provider is not offered and no button is drawn.
 */
const ORIGIN = process.env.NEXTAUTH_URL ?? "http://127.0.0.1:3000";

test("no Microsoft button while its variables are unset", async ({
  page,
  request,
}) => {
  test.skip(
    !!process.env.AZURE_AD_CLIENT_ID || !!process.env.AZURE_AD_CLIENT_SECRET,
    "Microsoft credentials are set for this run."
  );
  await page.context().addCookies([consentCookieFor(ORIGIN)]);
  await page.goto(`${ORIGIN}/auth/signin`);
  await expect(
    page.getByRole("heading", { name: "Welcome to Needt" })
  ).toBeVisible();

  await expect(page.locator('[data-provider="azure-ad"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Microsoft/ })).toHaveCount(0);

  const providers = await request.get(`${ORIGIN}/api/auth/providers`);
  expect(providers.ok()).toBe(true);
  expect(Object.keys(await providers.json())).not.toContain("azure-ad");
});
