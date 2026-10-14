import { expect, test } from "@playwright/test";

import { getRedisConnection } from "@/lib/queue/connection";
import { hashRateLimitIdentifier } from "@/lib/security/rate-limit";

import { VISUAL_TEST_EMAIL, VISUAL_TEST_PASSWORD } from "./fixtures";

/* Sign-in is the one screen everybody sees, and it was the last one still
 * drawn in the pre-port chrome. It is now the design's `AuthScreen` over the
 * same NextAuth credentials flow that shipped before, so what is asserted
 * here is that the two halves still meet: the design renders, the client-side
 * refusals the design draws still fire, and a correct pair still ends up
 * inside the application.
 *
 * The server's own refusal is deliberately not exercised: the credentials
 * endpoint is rate limited, and burning attempts here would make every other
 * spec's sign-in order-dependent. For the same reason this runs at one
 * viewport and clears any lock left by a previous run first — the limiter
 * lives in Redis, which nothing between runs resets. */

test.skip(
  ({ viewport }) => (viewport?.width ?? 0) < 1024,
  "One sign-in per run: the credentials endpoint is rate limited."
);

/* Three buckets guard this endpoint — a lock on the account, five attempts
 * per account per quarter hour, twenty per address — and all three live in
 * Redis, which nothing between runs resets. A second run of this file would
 * otherwise fail on the limiter rather than on the code. */
test.beforeEach(async () => {
  const hash = hashRateLimitIdentifier(VISUAL_TEST_EMAIL);
  const redis = getRedisConnection();
  const rateLimited = await redis.keys("needt:rate-limit:credentials:*");
  await redis.del(
    `needt:credentials:failures:${hash}`,
    `needt:credentials:strikes:${hash}`,
    `needt:credentials:lock:${hash}`,
    ...rateLimited
  );
});

test("Sign-in wears the design and still signs you in", async ({ page }) => {
  await page.goto("/auth/signin");

  await expect(
    page.getByText("Sign in — your day is where you left it.")
  ).toBeVisible();

  /* v3 asks for the address first; the password arrives under it. */
  const email = page.getByPlaceholder("you@example.com");
  const password = page.getByPlaceholder("Password", { exact: true });
  const next = page.getByRole("button", { name: "Continue" });

  // The design's own refusals, both decided in the page.
  await email.fill("nobody");
  await next.click();
  await expect(page.getByText("Include an @ in the address.")).toBeVisible();
  await email.fill(VISUAL_TEST_EMAIL);
  await next.click();
  await password.fill("short");
  await expect(page.getByText("Use at least 8 characters.")).toBeVisible();

  /* A failed OAuth return arrives as a query parameter and has to be
     announced, not just drawn — `tests/onboarding.spec.ts` pins the role. */
  await page.goto("/auth/signin?error=OAuthAccountNotLinked");
  await expect(page.locator("p[role=alert]")).toContainText(
    "method you used before"
  );

  await page.goto("/auth/signin");
  await email.fill(VISUAL_TEST_EMAIL);
  await next.click();
  await password.fill(VISUAL_TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page).not.toHaveURL(/\/auth\/signin/, { timeout: 40_000 });
  /* The rail's account button is a desktop thing; the application's own main
     landmark is the one proof of arrival that every width shares. */
  await expect(page.getByRole("main")).toBeVisible({ timeout: 40_000 });
});

/* The onboarding suite signs a new account up through this screen, and the
 * controls it reaches for only exist where public sign-up is allowed. The
 * names are asserted here so that suite fails on this file rather than on a
 * four-minute timeout. */
test("Sign-up offers itself only where it is allowed", async ({ page }) => {
  await page.route("**/api/auth/public-signup", (route) =>
    route.fulfill({ json: { enabled: false } })
  );
  await page.goto("/auth/signin");
  await expect(page.getByText("Sign in — your day")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create one" })).toHaveCount(0);
  // Closed registration points to the waitlist instead.
  await expect(page.locator("[data-auth-waitlist]")).toBeVisible();

  await page.unroute("**/api/auth/public-signup");
  await page.route("**/api/auth/public-signup", (route) =>
    route.fulfill({ json: { enabled: true } })
  );
  await page.goto("/auth/signin");
  await page.getByRole("button", { name: "Create one" }).click();

  await page.getByPlaceholder("you@example.com").fill("new@example.com");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByPlaceholder("At least 8 characters")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create account" })
  ).toBeVisible();
  // The design drops both of these; the onboarding suite must not look for them.
  await expect(page.getByLabel("Confirm password")).toHaveCount(0);
});
