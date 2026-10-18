import { NextRequest } from "next/server";

import { GET } from "@/app/api/stats/route";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    userSettings: { findUnique: jest.fn() },
    task: { findMany: jest.fn() },
    focusSession: { findMany: jest.fn() },
    project: { findMany: jest.fn() },
  },
}));

const authenticate = authenticateRequest as jest.Mock;
const db = prisma as unknown as Record<
  "userSettings" | "task" | "focusSession" | "project",
  Record<string, jest.Mock>
>;

const call = (qs = "") =>
  GET(new NextRequest(`http://localhost/api/stats${qs}`)) as Promise<Response>;

beforeEach(() => {
  jest.clearAllMocks();
  authenticate.mockResolvedValue({
    userId: "u1",
    workspace: {
      workspaceId: "w1",
      dataScope: { mode: "workspace", workspaceId: "w1" },
    },
  });
  db.userSettings.findUnique.mockResolvedValue({ timeZone: "UTC" });
  db.task.findMany.mockResolvedValue([]);
  db.focusSession.findMany.mockResolvedValue([]);
  db.project.findMany.mockResolvedValue([]);
});

describe("GET /api/stats", () => {
  it("answers a week by default: 7 days ending today", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.range).toBe("week");
    expect(json.days).toHaveLength(7);
    expect(json.focusMinutes).toBeNull();
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("answers a month as 30 days", async () => {
    const json = await (await call("?range=month")).json();
    expect(json.range).toBe("month");
    expect(json.days).toHaveLength(30);
  });

  it("refuses another range", async () => {
    expect((await call("?range=year")).status).toBe(400);
  });

  it("reads only closed, live tasks in the user's and workspace's scope", async () => {
    await call();
    const where = db.task.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      workspaceId: "w1",
      status: "completed",
      trashedAt: null,
    });
    expect(where.completedAt.gte).toBeInstanceOf(Date);
    expect(db.focusSession.findMany.mock.calls[0][0].where).toMatchObject({
      userId: "u1",
    });
  });

  it("names the projects of what was closed", async () => {
    const now = new Date();
    db.task.findMany.mockResolvedValue([{ completedAt: now, projectId: "p1" }]);
    db.project.findMany.mockResolvedValue([
      { id: "p1", name: "Launch", color: null },
    ]);
    const json = await (await call()).json();
    expect(json.total).toBe(1);
    expect(json.byProject[0]).toMatchObject({ name: "Launch", done: 1 });
    expect(db.project.findMany.mock.calls[0][0].where).toEqual({
      id: { in: ["p1"] },
    });
  });
});
