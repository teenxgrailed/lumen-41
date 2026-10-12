import { NextRequest } from "next/server";

import { GET } from "@/app/api/habits/history/route";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/auth/workspace-auth", () => ({
  workspaceDataScopeWhere: () => ({ workspaceId: "ws-1" }),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    userSettings: { findUnique: jest.fn() },
    habit: { findMany: jest.fn() },
  },
}));

const db = prisma as unknown as {
  userSettings: { findUnique: jest.Mock };
  habit: { findMany: jest.Mock };
};
const auth = authenticateRequest as jest.Mock;

const get = async (query = "") => {
  const res = await GET(
    new NextRequest(`http://localhost/api/habits/history${query}`)
  );
  if (!res) throw new Error("the route sent no response");
  return res;
};

describe("GET /api/habits/history", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    auth.mockResolvedValue({
      userId: "u1",
      workspace: { workspaceId: "ws-1" },
    });
    db.userSettings.findUnique.mockResolvedValue({ timeZone: "UTC" });
  });

  it("answers the auth failure as is", async () => {
    auth.mockResolvedValue({ response: new Response(null, { status: 401 }) });
    expect((await get()).status).toBe(401);
    expect(db.habit.findMany).not.toHaveBeenCalled();
  });

  it("sends each habit's last 124 days as 1 / 0, ending on today, and never caches", async () => {
    db.habit.findMany.mockResolvedValue([{ id: "h1", completions: [] }]);
    const res = await get();
    const body = await res.json();
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(body.days).toBe(124);
    expect(body.habits).toHaveLength(1);
    expect(body.habits[0].done).toHaveLength(124);
    expect(body.habits[0].done.every((d: number) => d === 0)).toBe(true);
  });

  it("marks the kept dates, asks only for the caller's own active habits since the window start", async () => {
    const today = newDate().toISOString().slice(0, 10);
    db.habit.findMany.mockResolvedValue([
      {
        id: "h1",
        completions: [{ date: newDate(`${today}T00:00:00.000Z`) }],
      },
    ]);
    const body = await (await get("?days=30")).json();
    expect(body.habits[0].done).toHaveLength(30);
    expect(body.habits[0].done[29]).toBe(1);
    expect(body.habits[0].done.slice(0, 29).every((d: number) => d === 0)).toBe(
      true
    );
    const where = db.habit.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      workspaceId: "ws-1",
      userId: "u1",
      archivedAt: null,
      isActive: true,
    });
  });

  it("caps a long ask and falls back on nonsense", async () => {
    db.habit.findMany.mockResolvedValue([{ id: "h1", completions: [] }]);
    expect((await (await get("?days=99999")).json()).days).toBe(400);
    expect((await (await get("?days=abc")).json()).days).toBe(124);
    expect((await (await get("?days=-5")).json()).days).toBe(124);
  });
});
