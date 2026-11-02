import { NextRequest } from "next/server";

import {
  calendarOAuthStateCookie,
  calendarOAuthStateCookieValue,
} from "@/lib/calendar-oauth";
import { canAddCalendar } from "@/lib/entitlements";
import { enqueueCalendarSync } from "@/lib/queue/enqueue";

import { GET } from "../route";

const CALENDARS = [
  { id: "me@example.com", summary: "Needt", backgroundColor: "#4285F4" },
  {
    id: "birthdays#contacts@group.v.calendar.google.com",
    summary: "Дні народження",
  },
  { id: "tasks@group.v.calendar.google.com", summary: "Завдання" },
  {
    id: "en.ch#holiday@group.v.calendar.google.com",
    summary: "Свята у Швейцарії",
  },
];

jest.mock("@/lib/auth/api-auth", () => ({
  authenticateRequest: async () => ({ userId: "user-1" }),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/entitlements", () => ({
  canAddCalendar: jest.fn(async () => ({ allowed: true })),
}));
jest.mock("@/lib/google", () => ({
  createGoogleOAuthClient: jest.fn(async () => ({
    getToken: async () => ({
      tokens: { access_token: "a", refresh_token: "r", expiry_date: 1 },
    }),
    setCredentials: jest.fn(),
  })),
}));
jest.mock("googleapis", () => ({
  google: {
    oauth2: () => ({
      userinfo: { get: async () => ({ data: { email: "me@example.com" } }) },
    }),
    calendar: () => ({
      calendarList: { list: async () => ({ data: { items: CALENDARS } }) },
    }),
  },
}));
jest.mock("@/lib/google-calendar", () => ({
  getGoogleCalendarClient: jest.fn(),
}));
jest.mock("@/lib/google-sync", () => ({ syncGoogleCalendar: jest.fn() }));
jest.mock("@/lib/calendar-webhooks/register", () => ({
  registerCalendarWebhookBestEffort: jest.fn(),
}));
jest.mock("@/lib/token-manager", () => ({
  TokenManager: {
    getInstance: () => ({ storeTokens: jest.fn(async () => "acct-1") }),
  },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    calendarFeed: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: { data: { id: string } }) => data),
      findUnique: jest.fn(),
    },
  },
}));
jest.mock("@/lib/queue/enqueue", () => ({
  isQueueConfigured: () => true,
  enqueueCalendarSync: jest.fn(),
}));

describe("Google Calendar OAuth callback first sync", () => {
  it("enqueues one sync per feed, holiday, birthday and tasks calendars included", async () => {
    process.env.NEXTAUTH_URL = "https://use.needt.app";
    const cookie = calendarOAuthStateCookieValue("state-1", "user-1");
    const request = new NextRequest(
      "http://0.0.0.0:3000/api/calendar/google?code=c&state=state-1",
      {
        headers: { cookie: `${calendarOAuthStateCookie("google")}=${cookie}` },
      }
    );

    const res = await GET(request);

    expect(res?.status).toBe(307);
    expect(res?.headers.get("location")).toContain("calendarSuccess=connected");
    expect(enqueueCalendarSync).toHaveBeenCalledTimes(CALENDARS.length);
  });

  it("sends a capped new account back to Settings with limit_reached and stores nothing", async () => {
    process.env.NEXTAUTH_URL = "https://use.needt.app";
    jest.mocked(canAddCalendar).mockResolvedValueOnce({
      allowed: false,
    } as never);
    const cookie = calendarOAuthStateCookieValue("state-1", "user-1");
    const request = new NextRequest(
      "http://0.0.0.0:3000/api/calendar/google?code=c&state=state-1",
      {
        headers: { cookie: `${calendarOAuthStateCookie("google")}=${cookie}` },
      }
    );
    jest.mocked(enqueueCalendarSync).mockClear();

    const res = await GET(request);

    expect(canAddCalendar).toHaveBeenCalledWith("user-1", {
      provider: "GOOGLE",
      email: "me@example.com",
    });
    expect(res?.status).toBe(307);
    expect(res?.headers.get("location")).toContain(
      "calendarError=limit_reached"
    );
    expect(enqueueCalendarSync).not.toHaveBeenCalled();
  });
});
