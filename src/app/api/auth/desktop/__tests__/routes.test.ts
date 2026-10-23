import { decode } from "next-auth/jwt";
import { NextRequest } from "next/server";

import { POST as issueCode } from "@/app/api/auth/desktop/code/route";
import { POST as exchange } from "@/app/api/auth/desktop/exchange/route";

import { authenticateAccountRequest } from "@/lib/auth/account-request-auth";
import {
  desktopChallengeFor,
  issueDesktopAuthCode,
  redeemDesktopAuthCode,
} from "@/lib/auth/desktop-handoff";
import { getEmailVerificationStatus } from "@/lib/auth/email-verification-access";
import { enforceRateLimits } from "@/lib/security/rate-limit";

jest.mock("@/lib/auth/auth-options", () => ({
  SESSION_MAX_AGE_SECONDS: 30 * 24 * 60 * 60,
}));
jest.mock("@/lib/auth/account-request-auth", () => ({
  authenticateAccountRequest: jest.fn(),
}));
jest.mock("@/lib/auth/email-verification-access", () => ({
  getEmailVerificationStatus: jest.fn(),
}));
jest.mock("@/lib/auth/session-version", () => ({
  issueSessionVersion: jest.fn(async (token: Record<string, unknown>) => ({
    ...token,
    sessionVersion: 4,
    sessionVersionCheckedAt: 1,
  })),
}));
jest.mock("@/lib/auth/desktop-handoff", () => {
  const actual = jest.requireActual("@/lib/auth/desktop-handoff");
  return {
    ...actual,
    issueDesktopAuthCode: jest.fn(),
    redeemDesktopAuthCode: jest.fn(),
  };
});
jest.mock("@/lib/security/rate-limit", () => ({
  accountRule: jest.fn(() => ({ identifier: "account" })),
  ipRule: jest.fn(() => ({ identifier: "ip" })),
  enforceRateLimits: jest.fn(),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({ prisma: {} }));

const CHALLENGE = desktopChallengeFor("v".repeat(43));
const ORIGIN = "https://use.needt.app";

function post(
  path: string,
  body: unknown,
  headers: Record<string, string> = {}
) {
  return new NextRequest(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      "x-needt-desktop": "1",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXTAUTH_SECRET = "test-secret-for-desktop-handoff";
  process.env.NEXTAUTH_URL = ORIGIN;
  jest.mocked(enforceRateLimits).mockResolvedValue(null);
  jest.mocked(authenticateAccountRequest).mockResolvedValue({
    user: { id: "user-1", email: "ada@example.com", isActive: true },
    sessionHash: "hash",
  });
  jest
    .mocked(getEmailVerificationStatus)
    .mockResolvedValue({ required: false, verified: true } as never);
  jest.mocked(issueDesktopAuthCode).mockResolvedValue("c".repeat(43));
});

describe("POST /api/auth/desktop/code", () => {
  it("issues a code to a signed-in person who sends a valid challenge", async () => {
    const response = await issueCode(
      post("/api/auth/desktop/code", { challenge: CHALLENGE })
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ code: "c".repeat(43) });
    expect(issueDesktopAuthCode).toHaveBeenCalledWith({
      userId: "user-1",
      challenge: CHALLENGE,
    });
  });

  it("is a cross-site request: refused without touching the session", async () => {
    const response = await issueCode(
      post(
        "/api/auth/desktop/code",
        { challenge: CHALLENGE },
        { origin: "https://evil.example" }
      )
    );
    expect(response.status).toBe(403);
    expect(authenticateAccountRequest).not.toHaveBeenCalled();
    expect(issueDesktopAuthCode).not.toHaveBeenCalled();
  });

  it("is refused without the handoff header", async () => {
    const response = await issueCode(
      post(
        "/api/auth/desktop/code",
        { challenge: CHALLENGE },
        { "x-needt-desktop": "" }
      )
    );
    expect(response.status).toBe(403);
    expect(issueDesktopAuthCode).not.toHaveBeenCalled();
  });

  it("needs a session", async () => {
    jest.mocked(authenticateAccountRequest).mockResolvedValue({
      response: new Response(null, { status: 401 }) as never,
    });
    const response = await issueCode(
      post("/api/auth/desktop/code", { challenge: CHALLENGE })
    );
    expect(response.status).toBe(401);
    expect(issueDesktopAuthCode).not.toHaveBeenCalled();
  });

  it("holds back a person who has not confirmed their email", async () => {
    jest
      .mocked(getEmailVerificationStatus)
      .mockResolvedValue({ required: true, verified: false } as never);
    const response = await issueCode(
      post("/api/auth/desktop/code", { challenge: CHALLENGE })
    );
    expect(response.status).toBe(403);
    expect(issueDesktopAuthCode).not.toHaveBeenCalled();
  });

  it("rejects a challenge that is not a digest", async () => {
    const response = await issueCode(
      post("/api/auth/desktop/code", { challenge: "nope" })
    );
    expect(response.status).toBe(400);
    expect(issueDesktopAuthCode).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/desktop/exchange", () => {
  const body = { code: "c".repeat(43), verifier: "v".repeat(43) };

  it("trades a valid code for a session cookie", async () => {
    jest.mocked(redeemDesktopAuthCode).mockResolvedValue({
      id: "user-1",
      name: "Ada",
      email: "ada@example.com",
      image: null,
      role: "user",
    });
    const response = await exchange(post("/api/auth/desktop/exchange", body));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ ok: true, next: "/today" });

    const cookie = response.cookies.get("__Secure-next-auth.session-token");
    expect(cookie).toBeDefined();
    expect(cookie).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
    const claims = await decode({
      token: cookie?.value,
      secret: "test-secret-for-desktop-handoff",
    });
    expect(claims).toMatchObject({
      sub: "user-1",
      email: "ada@example.com",
      role: "user",
      sessionVersion: 4,
    });
    // The token only travels in Set-Cookie, never in the body.
    expect(text).not.toContain(cookie?.value as string);
  });

  it("answers every failure the same way and sets no cookie", async () => {
    jest.mocked(redeemDesktopAuthCode).mockResolvedValue(null);
    const response = await exchange(post("/api/auth/desktop/exchange", body));
    expect(response.status).toBe(401);
    expect(response.cookies.getAll()).toHaveLength(0);
  });

  it("does not look at a code from another site", async () => {
    const response = await exchange(
      post("/api/auth/desktop/exchange", body, {
        origin: "https://evil.example",
      })
    );
    expect(response.status).toBe(403);
    expect(redeemDesktopAuthCode).not.toHaveBeenCalled();
  });

  it("does not look at a form-encoded post", async () => {
    const response = await exchange(
      post("/api/auth/desktop/exchange", body, {
        "content-type": "application/x-www-form-urlencoded",
      })
    );
    expect(response.status).toBe(403);
    expect(redeemDesktopAuthCode).not.toHaveBeenCalled();
  });

  it("ignores a body that is not strings", async () => {
    const response = await exchange(
      post("/api/auth/desktop/exchange", { code: 1, verifier: null })
    );
    expect(response.status).toBe(401);
    expect(redeemDesktopAuthCode).not.toHaveBeenCalled();
  });

  it("is rate limited", async () => {
    jest
      .mocked(enforceRateLimits)
      .mockResolvedValue(new Response(null, { status: 429 }) as never);
    const response = await exchange(post("/api/auth/desktop/exchange", body));
    expect(response.status).toBe(429);
    expect(redeemDesktopAuthCode).not.toHaveBeenCalled();
  });
});
