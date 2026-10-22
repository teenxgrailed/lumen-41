import { NextRequest } from "next/server";

import { createHash } from "node:crypto";

import { calendarOAuthStateCookieValue } from "@/lib/calendar-oauth";
import {
  mailOAuthStateCookie,
  mailOAuthVerifierCookie,
} from "@/lib/mail/oauth-state";

import { GET } from "../route";

// The handlers may return undefined in the type (auth.response), never at runtime here.
async function call(request: NextRequest) {
  const res = await GET(request);
  if (!res) throw new Error("handler returned no response");
  return res;
}

jest.mock("@/lib/auth/api-auth", () => ({
  authenticateRequest: async () => ({ userId: "user-1" }),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/auth", () => ({
  getGoogleCredentials: async () => ({
    clientId: "client-id",
    clientSecret: "client-secret",
  }),
}));
jest.mock("@/lib/entitlements", () => ({
  canAddMailbox: jest.fn(async () => ({ allowed: true })),
}));
jest.mock("@/lib/google", () => ({
  createGoogleOAuthClient: async () => ({
    generateAuthUrl: (options: Record<string, unknown>) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(options)) {
        params.set(key, Array.isArray(value) ? value.join(" ") : String(value));
      }
      return `https://accounts.example/auth?${params}`;
    },
  }),
}));

describe("google mail OAuth start", () => {
  const original = process.env.NEXTAUTH_URL;
  beforeEach(() => {
    process.env.NEXTAUTH_URL = "https://use.needt.app";
  });
  afterEach(() => {
    if (original === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = original;
  });

  it("sends state and an S256 challenge, and binds both to cookies", async () => {
    const res = await call(
      new NextRequest("http://0.0.0.0:3000/api/mail/oauth/google/auth")
    );
    const location = new URL(res.headers.get("location") ?? "");
    const state = location.searchParams.get("state");
    const challenge = location.searchParams.get("code_challenge");
    expect(state).toMatch(/^[a-f0-9]{64}$/);
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Path=/api/mail/oauth");
    expect(setCookie).toContain("SameSite=lax");

    const stateCookie = res.cookies.get(mailOAuthStateCookie("google"));
    expect(stateCookie?.value).toBe(
      calendarOAuthStateCookieValue(state!, "user-1")
    );
    const verifier = res.cookies.get(mailOAuthVerifierCookie("google"))?.value;
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(
      createHash("sha256")
        .update(verifier as string)
        .digest("base64url")
    ).toBe(challenge);
  });
});
