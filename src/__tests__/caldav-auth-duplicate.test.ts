import { POST } from "@/app/api/calendar/caldav/auth/route";
import * as caldavUtils from "@/app/api/calendar/caldav/utils";
import { Prisma } from "@prisma/client";

import * as apiAuth from "@/lib/auth/api-auth";
import * as entitlements from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";
import {
  decryptSecret,
  isEncryptedSecret,
} from "@/lib/security/secret-encryption";

jest.mock("@/lib/auth/api-auth");
jest.mock("@/lib/entitlements");
jest.mock("@/lib/prisma", () => ({
  prisma: {
    connectedAccount: {
      create: jest.fn(),
    },
  },
}));
jest.mock("@/app/api/calendar/caldav/utils", () => ({
  createCalDAVClient: jest.fn(),
  fetchCalDAVCalendars: jest.fn(),
  formatAbsoluteUrl: jest.fn((serverUrl: string) => serverUrl),
  handleFastmailPath: jest.fn(() => undefined),
  loginToCalDAVServer: jest.fn(),
  normalizeCalDAVServerUrl: jest.fn((url: string) => url),
}));
const mockAddFeeds = jest.fn();
jest.mock("@/lib/caldav-feeds", () => ({
  addCalDAVFeeds: (...a: unknown[]) => mockAddFeeds(...a),
}));
jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockPrisma = prisma as unknown as {
  connectedAccount: { create: jest.Mock };
};

function makeRequest(body: Record<string, unknown>) {
  return {
    json: async () => body,
  } as unknown as Parameters<typeof POST>[0];
}

describe("CalDAV auth route - duplicate server handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAddFeeds.mockResolvedValue({ added: ["f1", "f2"] });
    (apiAuth.authenticateRequest as jest.Mock).mockResolvedValue({
      userId: "user-1",
    });
    (entitlements.canAddCalendar as jest.Mock).mockResolvedValue({
      allowed: true,
      limit: 1,
      used: 0,
      remaining: 1,
      upgradeRequired: false,
      plan: "FREE",
    });
    (caldavUtils.loginToCalDAVServer as jest.Mock).mockResolvedValue(true);
  });

  it("returns 409 with a clear message when the same server is already connected (P2002)", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed on the fields: (userId,provider,email,caldavUrl)",
      { code: "P2002", clientVersion: "6.3.1" }
    );
    mockPrisma.connectedAccount.create.mockRejectedValue(p2002);

    const res = await POST(
      makeRequest({
        serverUrl: "https://server-a.example.com",
        username: "FOO",
        password: "secret",
      })
    );

    if (!res) throw new Error("expected a response");
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(JSON.stringify(json).toLowerCase()).toContain("already connected");
    expect(JSON.stringify(json).toLowerCase()).not.toContain(
      "check your credentials"
    );
  });

  it("creates the account successfully when there is no duplicate", async () => {
    mockPrisma.connectedAccount.create.mockResolvedValue({ id: "acc-1" });

    const res = await POST(
      makeRequest({
        serverUrl: "https://server-b.example.com",
        username: "FOO",
        password: "secret",
      })
    );

    if (!res) throw new Error("expected a response");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, accountId: "acc-1", feeds: 2 });
    // the account's calendars are added and synced right away
    expect(mockAddFeeds).toHaveBeenCalledWith({ id: "acc-1" }, "user-1");
  });

  it("stays connected when adding the calendars fails", async () => {
    mockPrisma.connectedAccount.create.mockResolvedValue({ id: "acc-1" });
    mockAddFeeds.mockRejectedValueOnce(new Error("503"));

    const res = await POST(
      makeRequest({
        serverUrl: "https://server-b.example.com",
        username: "FOO",
        password: "secret",
      })
    );

    if (!res) throw new Error("expected a response");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      accountId: "acc-1",
      feeds: 0,
    });
  });

  it("stores the CalDAV password encrypted, never as plaintext", async () => {
    mockPrisma.connectedAccount.create.mockResolvedValue({ id: "acc-2" });

    await POST(
      makeRequest({
        serverUrl: "https://server-c.example.com",
        username: "FOO",
        password: "app-specific-password",
      })
    );

    const { data } = mockPrisma.connectedAccount.create.mock.calls[0][0];
    expect(data.accessToken).not.toContain("app-specific-password");
    expect(isEncryptedSecret(data.accessToken)).toBe(true);
    expect(decryptSecret(data.accessToken)).toBe("app-specific-password");
  });
});
