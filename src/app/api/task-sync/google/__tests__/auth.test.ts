import { NextRequest } from "next/server";

import { createHash } from "node:crypto";

import { calendarOAuthStateCookieValue } from "@/lib/calendar-oauth";
import {
  GOOGLE_CALENDAR_SCOPES,
  GOOGLE_TASKS_SCOPES,
} from "@/lib/google-oauth-scopes";
import {
  GOOGLE_TASKS_STATE_COOKIE,
  GOOGLE_TASKS_VERIFIER_COOKIE,
} from "@/lib/task-sync/google-oauth-state";

import { GET } from "../auth/route";

// The handler may return undefined in the type (auth.response), never at runtime here.
async function call(request: NextRequest) {
  const res = await GET(request);
  if (!res) throw new Error("handler returned no response");
  return res;
}

const mockRedirectUrls: (string | undefined)[] = [];
const mockCredentials = {
  clientId: "client-id",
  clientSecret: "client-secret",
};

jest.mock("@/lib/auth/api-auth", () => ({
  authenticateRequest: async () => ({ userId: "user-1" }),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/auth", () => ({
  getGoogleCredentials: async () => mockCredentials,
}));
jest.mock("@/lib/google", () => ({
  createGoogleOAuthClient: async (options?: { redirectUrl?: string }) => {
    mockRedirectUrls.push(options?.redirectUrl);
    return {
      generateAuthUrl: (params: Record<string, unknown>) => {
        const query = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
          query.set(
            key,
            Array.isArray(value) ? value.join(" ") : String(value)
          );
        }
        return `https://accounts.example/auth?${query}`;
      },
    };
  },
}));

describe("Google Tasks connect: consent start", () => {
  const original = process.env.NEXTAUTH_URL;
  beforeEach(() => {
    process.env.NEXTAUTH_URL = "https://use.needt.app";
    mockRedirectUrls.length = 0;
    mockCredentials.clientId = "client-id";
    mockCredentials.clientSecret = "client-secret";
  });
  afterEach(() => {
    if (original === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = original;
  });

  it("asks for the Tasks scope (and the account email) and no calendar or mail scope", async () => {
    const res = await call(
      new NextRequest("http://0.0.0.0:3000/api/task-sync/google/auth")
    );
    const location = new URL(res.headers.get("location") ?? "");
    const scopes = (location.searchParams.get("scope") ?? "").split(" ");

    expect(scopes).toEqual([
      ...GOOGLE_TASKS_SCOPES,
      "https://www.googleapis.com/auth/userinfo.email",
    ]);
    expect(scopes).toContain("https://www.googleapis.com/auth/tasks");
    for (const scope of scopes) {
      expect(scope).not.toContain("/auth/calendar");
      expect(scope).not.toContain("gmail");
    }
    // The email scope is the one the calendar consent already lists.
    expect(GOOGLE_CALENDAR_SCOPES).toContain(
      "https://www.googleapis.com/auth/userinfo.email"
    );
  });

  it("is an incremental, offline consent that returns to its own callback", async () => {
    const res = await call(
      new NextRequest("http://0.0.0.0:3000/api/task-sync/google/auth")
    );
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.searchParams.get("include_granted_scopes")).toBe("true");
    expect(location.searchParams.get("access_type")).toBe("offline");
    expect(location.searchParams.get("prompt")).toBe("consent");
    expect(mockRedirectUrls).toEqual([
      "https://use.needt.app/api/task-sync/google/callback",
    ]);
  });

  it("sends state and an S256 challenge, and binds both to cookies", async () => {
    const res = await call(
      new NextRequest("http://0.0.0.0:3000/api/task-sync/google/auth")
    );
    const location = new URL(res.headers.get("location") ?? "");
    const state = location.searchParams.get("state");
    const challenge = location.searchParams.get("code_challenge");
    expect(state).toMatch(/^[a-f0-9]{64}$/);
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Path=/api/task-sync/google");
    expect(setCookie).toContain("SameSite=lax");

    expect(res.cookies.get(GOOGLE_TASKS_STATE_COOKIE)?.value).toBe(
      calendarOAuthStateCookieValue(state!, "user-1")
    );
    const verifier = res.cookies.get(GOOGLE_TASKS_VERIFIER_COOKIE)?.value;
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(
      createHash("sha256")
        .update(verifier as string)
        .digest("base64url")
    ).toBe(challenge);
  });

  it("says so, and sets no cookie, when the server has no Google client", async () => {
    mockCredentials.clientSecret = "";
    const res = await call(
      new NextRequest("http://0.0.0.0:3000/api/task-sync/google/auth")
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "Google Tasks isn't available yet.",
    });
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});
