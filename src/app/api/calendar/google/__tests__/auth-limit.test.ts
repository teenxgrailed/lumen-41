import { NextRequest } from "next/server";

import { canAddCalendar } from "@/lib/entitlements";

import { GET } from "../auth/route";

jest.mock("@/lib/auth/api-auth", () => ({
  authenticateRequest: async () => ({ userId: "user-1" }),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/entitlements", () => ({ canAddCalendar: jest.fn() }));
jest.mock("@/lib/google", () => ({ createGoogleOAuthClient: jest.fn() }));

describe("Google calendar OAuth start at the plan cap", () => {
  it("redirects to Settings with limit_reached instead of answering 403 JSON", async () => {
    process.env.NEXTAUTH_URL = "http://localhost";
    jest.mocked(canAddCalendar).mockResolvedValue({
      allowed: false,
      limit: 1,
      used: 1,
      remaining: 0,
      upgradeRequired: true,
      plan: "FREE",
    });
    const res = await GET(
      new NextRequest("http://localhost/api/calendar/google/auth")
    );
    expect(canAddCalendar).toHaveBeenCalledWith("user-1", {
      provider: "GOOGLE",
    });
    expect(res?.status).toBe(307);
    expect(res?.headers.get("location")).toBe(
      "http://localhost/settings?provider=google&calendarError=limit_reached#calendars"
    );
  });
});
