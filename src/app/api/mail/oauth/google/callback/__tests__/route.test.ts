import { NextRequest } from "next/server";

import { calendarOAuthStateCookieValue } from "@/lib/calendar-oauth";
import { createGoogleOAuthClient } from "@/lib/google";
import { createOAuthMailAccount } from "@/lib/mail-db";
import {
  createMailOAuthSession,
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
jest.mock("@/lib/google", () => ({ createGoogleOAuthClient: jest.fn() }));
jest.mock("googleapis", () => ({
  google: {
    oauth2: jest.fn(() => ({
      userinfo: { get: async () => ({ data: { email: "me@example.com" } }) },
    })),
  },
}));
jest.mock("@/lib/entitlements", () => ({
  canAddMailbox: jest.fn(async () => ({ allowed: true })),
}));
jest.mock("@/lib/mail-db", () => ({
  createOAuthMailAccount: jest.fn(async () => ({ id: "mail-1" })),
}));
jest.mock("@/lib/queue/enqueue", () => ({
  enqueueMailSync: jest.fn(),
  ensureMailSyncSchedule: jest.fn(),
}));
jest.mock("@/lib/token-manager", () => ({
  TokenManager: {
    getInstance: () => ({ storeTokens: jest.fn(async () => "ref-1") }),
  },
}));

const CALLBACK = "http://0.0.0.0:3000/api/mail/oauth/google/callback";

function callbackRequest(options: {
  query?: Record<string, string>;
  cookies?: Record<string, string>;
}) {
  const url = new URL(CALLBACK);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    url.searchParams.set(key, value);
  }
  const cookie = Object.entries(options.cookies ?? {})
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
  return new NextRequest(url, cookie ? { headers: { cookie } } : undefined);
}

function boundCookies(userId = "user-1") {
  const session = createMailOAuthSession();
  return {
    session,
    cookies: {
      [mailOAuthStateCookie("google")]: calendarOAuthStateCookieValue(
        session.state,
        userId
      ),
      [mailOAuthVerifierCookie("google")]: session.codeVerifier,
    } as Record<string, string>,
  };
}

function expectCookiesCleared(res: Response) {
  const setCookie = res.headers.get("set-cookie") ?? "";
  for (const name of [
    mailOAuthStateCookie("google"),
    mailOAuthVerifierCookie("google"),
  ]) {
    expect(setCookie).toContain(`${name}=;`);
  }
  expect(setCookie).toContain("Path=/api/mail/oauth");
  expect(setCookie).toContain("Max-Age=0");
}

describe("google mail OAuth callback", () => {
  const original = process.env.NEXTAUTH_URL;
  const getToken = jest.fn();

  beforeEach(() => {
    process.env.NEXTAUTH_URL = "https://use.needt.app";
    getToken.mockReset();
    getToken.mockResolvedValue({
      tokens: { access_token: "at", refresh_token: "rt", expiry_date: 1 },
    });
    (createGoogleOAuthClient as jest.Mock).mockResolvedValue({
      getToken,
      setCredentials: jest.fn(),
    });
    (createOAuthMailAccount as jest.Mock).mockClear();
  });
  afterEach(() => {
    if (original === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = original;
  });

  it("rejects a callback with no state and attaches nothing", async () => {
    const { cookies } = boundCookies();
    const res = await call(callbackRequest({ query: { code: "c" }, cookies }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_state" });
    expect(getToken).not.toHaveBeenCalled();
    expect(createOAuthMailAccount).not.toHaveBeenCalled();
    expectCookiesCleared(res);
  });

  it("rejects a callback with no state cookie (attacker link opened by a victim)", async () => {
    const { session } = boundCookies();
    const res = await call(
      callbackRequest({ query: { code: "c", state: session.state } })
    );
    expect(res.status).toBe(400);
    expect(getToken).not.toHaveBeenCalled();
    expect(createOAuthMailAccount).not.toHaveBeenCalled();
  });

  it("rejects state that does not match the cookie", async () => {
    const { cookies } = boundCookies();
    const res = await call(
      callbackRequest({
        query: { code: "c", state: createMailOAuthSession().state },
        cookies,
      })
    );
    expect(res.status).toBe(400);
    expect(getToken).not.toHaveBeenCalled();
    expect(createOAuthMailAccount).not.toHaveBeenCalled();
    expectCookiesCleared(res);
  });

  it("rejects state that was issued to a different user", async () => {
    const { session, cookies } = boundCookies("user-2");
    const res = await call(
      callbackRequest({ query: { code: "c", state: session.state }, cookies })
    );
    expect(res.status).toBe(400);
    expect(getToken).not.toHaveBeenCalled();
    expect(createOAuthMailAccount).not.toHaveBeenCalled();
  });

  it("rejects a matching state when the PKCE verifier cookie is missing", async () => {
    const { session, cookies } = boundCookies();
    delete cookies[mailOAuthVerifierCookie("google")];
    const res = await call(
      callbackRequest({ query: { code: "c", state: session.state }, cookies })
    );
    expect(res.status).toBe(400);
    expect(getToken).not.toHaveBeenCalled();
  });

  it("connects the mailbox with the PKCE verifier when state matches", async () => {
    const { session, cookies } = boundCookies();
    const res = await call(
      callbackRequest({ query: { code: "c", state: session.state }, cookies })
    );
    expect(getToken).toHaveBeenCalledWith({
      code: "c",
      codeVerifier: session.codeVerifier,
    });
    expect(createOAuthMailAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        provider: "GMAIL",
        address: "me@example.com",
      })
    );
    expect(res.headers.get("location")).toBe(
      "https://use.needt.app/mail?connected=gmail"
    );
    expectCookiesCleared(res);
  });

  it("redirects to NEXTAUTH_URL, not the container address, when the provider sends no code", async () => {
    const { session, cookies } = boundCookies();
    const res = await call(
      callbackRequest({
        query: { error: "access_denied", state: session.state },
        cookies,
      })
    );
    expect(res.headers.get("location")).toBe(
      "https://use.needt.app/mail?error=google"
    );
    expect(createOAuthMailAccount).not.toHaveBeenCalled();
    expectCookiesCleared(res);
  });
});
