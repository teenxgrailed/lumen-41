import { NextRequest } from "next/server";

import { GET } from "@/app/api/accounts/route";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: { connectedAccount: { findMany: jest.fn() } },
}));

const findMany = prisma.connectedAccount.findMany as unknown as jest.Mock;

describe("GET /api/accounts", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (authenticateRequest as jest.Mock).mockResolvedValue({ userId: "u1" });
  });

  it("flags an account whose calendars all fail, and never sends the error text", async () => {
    findMany.mockResolvedValue([
      {
        id: "a1",
        provider: "GOOGLE",
        email: "me@example.com",
        caldavUrl: null,
        calendars: [
          { id: "c1", name: "Main", enabled: true, error: "invalid_grant" },
        ],
      },
      {
        id: "a2",
        provider: "OUTLOOK",
        email: "me@work.com",
        caldavUrl: null,
        calendars: [
          { id: "c2", name: "Work", enabled: true, error: null },
          { id: "c3", name: "Team", enabled: true, error: "timeout" },
        ],
      },
    ]);
    const res = await GET(new NextRequest("http://localhost/api/accounts"));
    if (!res) throw new Error("the route sent no response");
    const body = await res.json();
    expect(body[0].needsReconnect).toBe(true);
    expect(body[1].needsReconnect).toBe(false);
    expect(body[0].calendars).toEqual([{ id: "c1", name: "Main" }]);
    expect(JSON.stringify(body)).not.toContain("invalid_grant");
  });

  it("flags a failing calendar on an otherwise healthy account and reports the last sync", async () => {
    const lastSync = new Date("2026-10-14T05:00:00.000Z");
    findMany.mockResolvedValue([
      {
        id: "a1",
        provider: "CALDAV",
        email: "me@example.com",
        caldavUrl: null,
        calendars: [
          { id: "c1", name: "A", enabled: true, error: null, lastSync },
          { id: "c2", name: "B", enabled: true, error: "403", lastSync: null },
        ],
      },
    ]);
    const res = await GET(new NextRequest("http://localhost/api/accounts"));
    if (!res) throw new Error("the route sent no response");
    const [account] = await res.json();
    expect(account.needsReconnect).toBe(false);
    expect(account.syncFailing).toBe(true);
    expect(account.lastSync).toBe(lastSync.toISOString());
    expect(JSON.stringify(account)).not.toContain("403");
  });
});
