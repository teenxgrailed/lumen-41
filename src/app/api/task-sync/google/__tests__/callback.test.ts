import { NextRequest } from "next/server";

import { calendarOAuthStateCookieValue } from "@/lib/calendar-oauth";
import { createGoogleOAuthClient } from "@/lib/google";
import { prisma } from "@/lib/prisma";
import {
  GOOGLE_TASKS_STATE_COOKIE,
  GOOGLE_TASKS_VERIFIER_COOKIE,
  createGoogleTasksOAuthSession,
} from "@/lib/task-sync/google-oauth-state";

import { GET } from "../callback/route";

// The handler may return undefined in the type (auth.response), never at runtime here.
async function call(request: NextRequest) {
  const res = await GET(request);
  if (!res) throw new Error("handler returned no response");
  return res;
}

const mockStoreTokens = jest.fn();

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
jest.mock("@/lib/token-manager", () => ({
  TokenManager: { getInstance: () => ({ storeTokens: mockStoreTokens }) },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    taskProvider: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    taskListMapping: { deleteMany: jest.fn() },
  },
}));

const db = prisma as unknown as {
  taskProvider: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  taskListMapping: { deleteMany: jest.Mock };
};

const CALLBACK = "http://0.0.0.0:3000/api/task-sync/google/callback";
const TASKS = "https://www.googleapis.com/auth/tasks";

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
  const session = createGoogleTasksOAuthSession();
  return {
    session,
    cookies: {
      [GOOGLE_TASKS_STATE_COOKIE]: calendarOAuthStateCookieValue(
        session.state,
        userId
      ),
      [GOOGLE_TASKS_VERIFIER_COOKIE]: session.codeVerifier,
    } as Record<string, string>,
  };
}

function expectCookiesCleared(res: Response) {
  const setCookie = res.headers.get("set-cookie") ?? "";
  for (const name of [
    GOOGLE_TASKS_STATE_COOKIE,
    GOOGLE_TASKS_VERIFIER_COOKIE,
  ]) {
    expect(setCookie).toContain(`${name}=;`);
  }
  expect(setCookie).toContain("Path=/api/task-sync/google");
  expect(setCookie).toContain("Max-Age=0");
}

describe("Google Tasks connect: callback", () => {
  const original = process.env.NEXTAUTH_URL;
  const getToken = jest.fn();

  beforeEach(() => {
    process.env.NEXTAUTH_URL = "https://use.needt.app";
    jest.clearAllMocks();
    getToken.mockResolvedValue({
      tokens: {
        access_token: "at",
        refresh_token: "rt",
        expiry_date: 1,
        scope: `openid https://www.googleapis.com/auth/userinfo.email ${TASKS}`,
      },
    });
    (createGoogleOAuthClient as jest.Mock).mockResolvedValue({
      getToken,
      setCredentials: jest.fn(),
    });
    mockStoreTokens.mockResolvedValue("acct-1");
    db.taskProvider.findFirst.mockResolvedValue(null);
    db.taskProvider.create.mockResolvedValue({ id: "prov-1" });
  });
  afterEach(() => {
    if (original === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = original;
  });

  it("rejects a callback with no state and stores nothing", async () => {
    const { cookies } = boundCookies();
    const res = await call(callbackRequest({ query: { code: "c" }, cookies }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_state" });
    expect(getToken).not.toHaveBeenCalled();
    expect(mockStoreTokens).not.toHaveBeenCalled();
    expectCookiesCleared(res);
  });

  it("rejects state issued to a different user", async () => {
    const { session, cookies } = boundCookies("user-2");
    const res = await call(
      callbackRequest({ query: { code: "c", state: session.state }, cookies })
    );
    expect(res.status).toBe(400);
    expect(mockStoreTokens).not.toHaveBeenCalled();
    expect(db.taskProvider.create).not.toHaveBeenCalled();
  });

  it("rejects a matching state when the PKCE verifier cookie is missing", async () => {
    const { session, cookies } = boundCookies();
    delete cookies[GOOGLE_TASKS_VERIFIER_COOKIE];
    const res = await call(
      callbackRequest({ query: { code: "c", state: session.state }, cookies })
    );
    expect(res.status).toBe(400);
    expect(getToken).not.toHaveBeenCalled();
  });

  it("stores the tokens, creates the provider and sends the person to pick lists", async () => {
    const { session, cookies } = boundCookies();
    const res = await call(
      callbackRequest({ query: { code: "c", state: session.state }, cookies })
    );

    expect(getToken).toHaveBeenCalledWith({
      code: "c",
      codeVerifier: session.codeVerifier,
    });
    expect(createGoogleOAuthClient).toHaveBeenCalledWith({
      redirectUrl: "https://use.needt.app/api/task-sync/google/callback",
    });
    expect(mockStoreTokens).toHaveBeenCalledWith(
      "GOOGLE",
      "me@example.com",
      expect.objectContaining({ accessToken: "at", refreshToken: "rt" }),
      "user-1"
    );
    expect(db.taskProvider.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        type: "GOOGLE",
        accountId: "acct-1",
        syncEnabled: true,
      }),
    });
    expect(res.headers.get("location")).toBe(
      "https://use.needt.app/connections?googleTasks=lists"
    );
    expectCookiesCleared(res);
  });

  it("reconnecting the same account keeps the list imports", async () => {
    db.taskProvider.findFirst.mockResolvedValue({
      id: "prov-1",
      accountId: "acct-1",
    });
    const { session, cookies } = boundCookies();
    await call(
      callbackRequest({ query: { code: "c", state: session.state }, cookies })
    );
    expect(db.taskProvider.create).not.toHaveBeenCalled();
    expect(db.taskListMapping.deleteMany).not.toHaveBeenCalled();
    expect(db.taskProvider.update).toHaveBeenCalledWith({
      where: { id: "prov-1" },
      data: { accountId: "acct-1", enabled: true, error: null },
    });
  });

  it("connecting another Google account drops imports that belong to the old one", async () => {
    db.taskProvider.findFirst.mockResolvedValue({
      id: "prov-1",
      accountId: "acct-old",
    });
    const { session, cookies } = boundCookies();
    await call(
      callbackRequest({ query: { code: "c", state: session.state }, cookies })
    );
    expect(db.taskListMapping.deleteMany).toHaveBeenCalledWith({
      where: { providerId: "prov-1" },
    });
    expect(db.taskProvider.update).toHaveBeenCalledWith({
      where: { id: "prov-1" },
      data: { accountId: "acct-1", enabled: true, error: null },
    });
  });

  it("connects nothing when the person unticked the Tasks permission", async () => {
    getToken.mockResolvedValue({
      tokens: {
        access_token: "at",
        refresh_token: "rt",
        scope: "openid https://www.googleapis.com/auth/userinfo.email",
      },
    });
    const { session, cookies } = boundCookies();
    const res = await call(
      callbackRequest({ query: { code: "c", state: session.state }, cookies })
    );
    expect(res.headers.get("location")).toBe(
      "https://use.needt.app/connections?googleTasks=scope_missing"
    );
    expect(mockStoreTokens).not.toHaveBeenCalled();
    expect(db.taskProvider.create).not.toHaveBeenCalled();
  });

  it("says the consent was denied when Google sends access_denied", async () => {
    const { session, cookies } = boundCookies();
    const res = await call(
      callbackRequest({
        query: { error: "access_denied", state: session.state },
        cookies,
      })
    );
    expect(res.headers.get("location")).toBe(
      "https://use.needt.app/connections?googleTasks=denied"
    );
    expect(getToken).not.toHaveBeenCalled();
    expectCookiesCleared(res);
  });
});
