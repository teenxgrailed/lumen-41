import { NextRequest } from "next/server";

import * as route from "@/app/api/week-focus/route";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    weekFocus: { findUnique: jest.fn(), upsert: jest.fn() },
    task: { count: jest.fn() },
    project: { count: jest.fn() },
  },
}));

const GET = (r: NextRequest) => route.GET(r) as Promise<Response>;
const PUT = (r: NextRequest) => route.PUT(r) as Promise<Response>;

const authenticate = authenticateRequest as jest.Mock;
const db = prisma as unknown as {
  weekFocus: Record<"findUnique" | "upsert", jest.Mock>;
  task: { count: jest.Mock };
  project: { count: jest.Mock };
};

const req = (method: string, url: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const row = {
  weekStart: "2026-10-26",
  focuses: [
    { title: "Ship the landing", taskId: "t1" },
    "German",
    { title: "Resale", projectId: "p1" },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  authenticate.mockResolvedValue({
    userId: "u1",
    workspace: {
      workspaceId: "w1",
      dataScope: { mode: "workspace", workspaceId: "w1" },
    },
  });
});

describe("GET /api/week-focus", () => {
  it("returns the week's focuses, scoped to the user and workspace", async () => {
    db.weekFocus.findUnique.mockResolvedValue(row);
    const res = await GET(req("GET", "/api/week-focus?weekStart=2026-10-26"));
    expect((await res.json()).weekFocus).toEqual({
      weekStart: "2026-10-26",
      focuses: [
        { title: "Ship the landing", taskId: "t1", projectId: null },
        { title: "German", taskId: null, projectId: null },
        { title: "Resale", taskId: null, projectId: "p1" },
      ],
    });
    expect(db.weekFocus.findUnique.mock.calls[0][0].where).toEqual({
      userId_workspaceId_weekStart: {
        userId: "u1",
        workspaceId: "w1",
        weekStart: "2026-10-26",
      },
    });
  });

  it("is null when none was picked, and needs a real day", async () => {
    db.weekFocus.findUnique.mockResolvedValue(null);
    const res = await GET(req("GET", "/api/week-focus?weekStart=2026-10-26"));
    expect((await res.json()).weekFocus).toBeNull();
    expect((await GET(req("GET", "/api/week-focus?weekStart=x"))).status).toBe(
      400
    );
  });
});

describe("PUT /api/week-focus", () => {
  const put = (b: unknown) => PUT(req("PUT", "/api/week-focus", b));

  it("replaces the week's focuses and checks the tasks it names", async () => {
    db.task.count.mockResolvedValue(1);
    db.weekFocus.upsert.mockResolvedValue(row);
    const res = await put({
      weekStart: "2026-10-26",
      focuses: [
        { title: "Ship the landing", taskId: "t1" },
        { title: "German" },
      ],
    });
    expect(res.status).toBe(200);
    expect(db.task.count.mock.calls[0][0].where).toMatchObject({
      id: { in: ["t1"] },
      trashedAt: null,
      workspaceId: "w1",
    });
    expect(db.weekFocus.upsert.mock.calls[0][0]).toMatchObject({
      create: { userId: "u1", workspaceId: "w1", weekStart: "2026-10-26" },
      update: {
        focuses: [
          { title: "Ship the landing", taskId: "t1" },
          { title: "German", taskId: null },
        ],
      },
    });
  });

  it("checks a project it names and stores the reference", async () => {
    db.project.count.mockResolvedValue(1);
    db.weekFocus.upsert.mockResolvedValue(row);
    const res = await put({
      weekStart: "2026-10-26",
      focuses: [{ title: "Resale", projectId: "p1" }],
    });
    expect(res.status).toBe(200);
    expect(db.project.count.mock.calls[0][0].where).toEqual({
      id: { in: ["p1"] },
      workspaceId: "w1",
    });
    expect(db.weekFocus.upsert.mock.calls[0][0].update).toEqual({
      focuses: [{ title: "Resale", taskId: null, projectId: "p1" }],
    });
    db.project.count.mockResolvedValue(0);
    const bad = await put({
      weekStart: "2026-10-26",
      focuses: [{ title: "x", projectId: "other" }],
    });
    expect(bad.status).toBe(404);
  });

  it("refuses a task outside the scope", async () => {
    db.task.count.mockResolvedValue(0);
    const res = await put({
      weekStart: "2026-10-26",
      focuses: [{ title: "x", taskId: "other" }],
    });
    expect(res.status).toBe(404);
    expect(db.weekFocus.upsert).not.toHaveBeenCalled();
  });

  it("validates its input", async () => {
    expect(
      (await put({ weekStart: "x", focuses: [{ title: "a" }] })).status
    ).toBe(400);
    expect((await put({ weekStart: "2026-10-26", focuses: [] })).status).toBe(
      400
    );
    const four = ["a", "b", "c", "d"].map((title) => ({ title }));
    expect((await put({ weekStart: "2026-10-26", focuses: four })).status).toBe(
      400
    );
  });
});
