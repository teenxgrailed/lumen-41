import { NextRequest } from "next/server";

import { calendarOAuthStateCookieValue } from "@/lib/calendar-oauth";
import { canAddCalendar } from "@/lib/entitlements";

import { GET } from "../route";

jest.mock("@/lib/auth/api-auth", () => ({
  authenticateRequest: async () => ({ userId: "user-1" }),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/entitlements", () => ({ canAddCalendar: jest.fn() }));
jest.mock("@/lib/auth", () => ({
  getOutlookCredentials: async () => ({ clientId: "id", clientSecret: "s" }),
}));
jest.mock("@/lib/outlook-calendar", () => ({
  OutlookCalendarService: jest.fn().mockImplementation(() => ({
    getUserProfile: async () => ({ id: "p", mail: "me@example.com" }),
  })),
}));
const storeTokens = jest.fn();
jest.mock("@/lib/token-manager", () => ({
  TokenManager: { getInstance: () => ({ storeTokens }) },
}));

describe("Outlook calendar OAuth callback at the plan cap", () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    process.env.NEXTAUTH_URL = "http://localhost";
    storeTokens.mockReset();
    global.fetch = jest.fn(async () =>
      Response.json({
        access_token: "a",
        refresh_token: "r",
        expires_in: 3600,
      })
    ) as typeof fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  function request() {
    return new NextRequest(
      "http://localhost/api/calendar/outlook?code=c&state=s",
      {
        headers: {
          cookie: `needt-calendar-oauth-state-outlook=${calendarOAuthStateCookieValue("s", "user-1")}`,
        },
      }
    );
  }

  it("redirects to Settings with limit_reached and stores nothing", async () => {
    jest.mocked(canAddCalendar).mockResolvedValue({ allowed: false } as never);
    const res = await GET(request());
    expect(canAddCalendar).toHaveBeenCalledWith("user-1", {
      provider: "OUTLOOK",
      email: "me@example.com",
    });
    expect(res?.status).toBe(307);
    expect(res?.headers.get("location")).toBe(
      "http://localhost/settings?provider=outlook&calendarError=limit_reached#calendars"
    );
    expect(storeTokens).not.toHaveBeenCalled();
  });

  it("connects a re-authorised account that is already counted", async () => {
    jest.mocked(canAddCalendar).mockResolvedValue({ allowed: true } as never);
    const res = await GET(request());
    expect(res?.headers.get("location")).toContain("calendarSuccess=connected");
    expect(storeTokens).toHaveBeenCalledTimes(1);
  });
});
