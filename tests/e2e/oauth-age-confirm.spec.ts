import { expect, test } from "@playwright/test";
import { type Server, createServer } from "node:http";

import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

/**
 * Google sign-up and the 16+ confirmation, through the real button, the real
 * /api/auth/age-confirm, the real NextAuth callback route and the real
 * `signIn` gates. Only Google itself is replaced: the server runs with
 * NEEDT_E2E_OAUTH_URL (see tests/e2e/environment.ts), which points the
 * `google` provider at the mock identity provider started below.
 */
const PORT = 4599;

type MockProfile = { sub: string; email: string; name: string };

let server: Server;
/** The profile the next sign-in returns, keyed by the code it hands out. */
const profiles = new Map<string, MockProfile>();
let counter = 0;

function stamp() {
  counter += 1;
  return `${newDate().getTime()}-${counter}`;
}

function startMockProvider(): Promise<Server> {
  const mock = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
    if (url.pathname === "/authorize") {
      const redirect = new URL(url.searchParams.get("redirect_uri") ?? "");
      redirect.searchParams.set(
        "code",
        url.searchParams.get("login_hint") ?? ""
      );
      redirect.searchParams.set("state", url.searchParams.get("state") ?? "");
      res.writeHead(302, { Location: redirect.toString() });
      res.end();
      return;
    }
    if (url.pathname === "/token") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const code = new URLSearchParams(body).get("code") ?? "";
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            access_token: `at-${code}`,
            token_type: "Bearer",
            expires_in: 3600,
          })
        );
      });
      return;
    }
    if (url.pathname === "/userinfo") {
      const code = (req.headers.authorization ?? "").replace(/^Bearer at-/, "");
      const profile = profiles.get(code);
      res.writeHead(profile ? 200 : 401, {
        "Content-Type": "application/json",
      });
      res.end(
        JSON.stringify(
          profile ? { ...profile, email_verified: true } : { error: "unknown" }
        )
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) =>
    mock.listen(PORT, "127.0.0.1", () => resolve(mock))
  );
}

test.beforeAll(async () => {
  server = await startMockProvider();
});

/* A route handler still waiting when the context closes stalls the teardown. */
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

/**
 * The mock's /authorize needs to know who signs in. NextAuth does not forward
 * a custom parameter, so the browser's request to the mock is rewritten to
 * carry the profile's code as `login_hint`.
 */
async function routeToProfile(
  page: import("@playwright/test").Page,
  profile: MockProfile
) {
  const code = `c-${stamp()}`;
  profiles.set(code, profile);
  await page.route(`http://127.0.0.1:${PORT}/authorize*`, async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set("login_hint", code);
    await route.continue({ url: url.toString() });
  });
}

async function sessionCookie(page: import("@playwright/test").Page) {
  const cookies = await page.context().cookies();
  return cookies.find((c) => c.name.endsWith("next-auth.session-token"));
}

test("a Google sign-up with the 16+ box ticked creates the account", async ({
  page,
}) => {
  const email = `e2e-new-${stamp()}@gmail.com`;
  await routeToProfile(page, {
    sub: `g-${stamp()}`,
    email,
    name: "New Person",
  });

  await page.goto("/auth/signin?mode=signup");
  await page.locator("[data-auth-age] input[type=checkbox]").check();
  const ageConfirm = page.waitForResponse(
    (r) => r.url().includes("/api/auth/age-confirm") && r.status() === 200
  );
  await page.locator('button[data-provider="google"]').click();
  await ageConfirm;

  await expect.poll(async () => !!(await sessionCookie(page))).toBe(true);
  expect(page.url()).not.toContain("error=");
  const user = await prisma.user.findFirst({
    where: { email },
    select: { ageConfirmedAt: true },
  });
  expect(user?.ageConfirmedAt).not.toBeNull();
});

test("Google sign-up without the confirmation is refused, then works once ticked", async ({
  page,
}) => {
  const email = `e2e-refused-${stamp()}@gmail.com`;
  await routeToProfile(page, { sub: `g-${stamp()}`, email, name: "Refused" });

  /* Straight to the provider without the box: no cookie, no account. */
  await page.goto("/auth/signin");
  await page.locator('button[data-provider="google"]').click();
  await expect(page).toHaveURL(/error=AgeConfirmRequired/);
  expect(await prisma.user.count({ where: { email } })).toBe(0);

  /* The page it lands on is usable: the box is there, the button is not
     stuck, and ticking then continuing gets in. */
  const button = page.locator('button[data-provider="google"]');
  await expect(button).toBeEnabled();
  await expect(button).not.toContainText("Opening");
  await page.locator("[data-auth-age] input[type=checkbox]").check();
  await button.click();
  await expect.poll(async () => !!(await sessionCookie(page))).toBe(true);
  expect(await prisma.user.count({ where: { email } })).toBe(1);
});

test("an existing Google account is never blocked, in sign-up mode or without the cookie", async ({
  page,
}) => {
  const sub = `g-${stamp()}`;
  const email = `e2e-existing-${stamp()}@gmail.com`;
  const user = await prisma.user.create({
    data: { email, name: "Existing", emailVerified: newDate() },
  });
  await prisma.account.create({
    data: {
      userId: user.id,
      type: "oauth",
      provider: "google",
      providerAccountId: sub,
    },
  });
  await routeToProfile(page, { sub, email, name: "Existing" });

  /* Sign-up mode with the box ticked. */
  await page.goto("/auth/signin?mode=signup");
  await page.locator("[data-auth-age] input[type=checkbox]").check();
  await page.locator('button[data-provider="google"]').click();
  await expect.poll(async () => !!(await sessionCookie(page))).toBe(true);
  expect(page.url()).not.toContain("error=");
  expect(await prisma.user.count({ where: { email } })).toBe(1);
});

test("an existing Google account signs in on the sign-in page without ever confirming age", async ({
  page,
}) => {
  const sub = `g-${stamp()}`;
  const email = `e2e-returning-${stamp()}@gmail.com`;
  /* No Account row: matched by email, as a returning person whose provider
     link is not stored yet. */
  await prisma.user.create({
    data: { email, name: "Returning", emailVerified: newDate() },
  });
  await routeToProfile(page, { sub, email, name: "Returning" });

  await page.goto("/auth/signin");
  await page.locator('button[data-provider="google"]').click();
  await expect.poll(async () => !!(await sessionCookie(page))).toBe(true);
  expect(page.url()).not.toContain("error=");
});
