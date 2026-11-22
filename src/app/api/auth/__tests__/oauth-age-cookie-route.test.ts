import { NextRequest } from "next/server";

import { GET } from "@/app/api/auth/[...nextauth]/route";

import {
  AGE_CONFIRM_REDIRECT,
  AGE_COOKIE,
  ageConfirmationGate,
  issueAgeToken,
} from "@/lib/auth/age-confirmation";
import { isExistingOAuthUser } from "@/lib/auth/signups";

/* The gate runs the way the route runs it: inside NextAuth's handler, after
   the provider round trip, with next/headers unable to answer. The mocked
   NextAuth handler calls the real age gate like the real `signIn` callback. */
jest.mock("next-auth", () => ({
  __esModule: true,
  default: jest.fn(() => async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    const verdict = await ageConfirmationGate({
      provider: "google",
      providerAccountId: "g-1",
      email: "new@example.com",
      nowMs: Date.now(),
    });
    return new Response(null, {
      status: 302,
      headers: { location: verdict === true ? "/calendar" : verdict },
    });
  }),
}));
jest.mock("@/lib/auth/auth-options", () => ({
  getAuthOptions: jest.fn(async () => ({})),
}));
jest.mock("@/lib/auth/signups", () => ({ isExistingOAuthUser: jest.fn() }));
jest.mock("next/headers", () => ({
  cookies: jest.fn(async () => {
    throw new Error("outside a request scope");
  }),
}));
jest.mock("@/lib/security/rate-limit", () => ({
  accountRule: jest.fn(),
  ipRule: jest.fn(),
  clearCredentialFailures: jest.fn(),
  enforceCredentialLock: jest.fn(),
  enforceRateLimits: jest.fn(),
  recordCredentialFailure: jest.fn(),
}));

const context = {
  params: Promise.resolve({ nextauth: ["callback", "google"] }),
};

function callback(cookie?: string) {
  return new NextRequest("http://localhost/api/auth/callback/google?code=x", {
    headers: cookie ? { cookie } : {},
  });
}

beforeEach(() => {
  jest.mocked(isExistingOAuthUser).mockResolvedValue(false);
});

describe("GET /api/auth/callback/google age confirmation", () => {
  it("lets a new Google account through on the request's own cookie", async () => {
    const response = await GET(
      callback(`${AGE_COOKIE}=${issueAgeToken(Date.now())}`),
      context
    );
    expect(response.headers.get("location")).toBe("/calendar");
  });

  it("spends the cookie once the sign-in went through", async () => {
    const response = await GET(
      callback(`${AGE_COOKIE}=${issueAgeToken(Date.now())}`),
      context
    );
    expect(
      response.headers
        .getSetCookie()
        .some(
          (c: string) =>
            c.startsWith(`${AGE_COOKIE}=;`) && c.includes("Max-Age=0")
        )
    ).toBe(true);
  });

  it("still refuses a new Google account with no cookie, and keeps nothing to spend", async () => {
    const response = await GET(callback("other=1"), context);
    expect(response.headers.get("location")).toBe(AGE_CONFIRM_REDIRECT);
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });

  it("refuses a forged cookie", async () => {
    const response = await GET(
      callback(`${AGE_COOKIE}=9999999999.forged`),
      context
    );
    expect(response.headers.get("location")).toBe(AGE_CONFIRM_REDIRECT);
  });

  it("keeps the cookie when the sign-in is refused, so the retry can use it", async () => {
    jest.mocked(isExistingOAuthUser).mockRejectedValue(new Error("db down"));
    const response = await GET(
      callback(`${AGE_COOKIE}=${issueAgeToken(Date.now())}`),
      context
    );
    expect(response.headers.get("location")).toBe(AGE_CONFIRM_REDIRECT);
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });
});
