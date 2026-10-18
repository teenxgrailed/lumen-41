import { NextRequest } from "next/server";

import { DELETE, GET, PUT } from "@/app/api/highlight/route";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    dailyHighlight: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    task: { findFirst: jest.fn() },
  },
}));

const authenticate = authenticateRequest as jest.Mock;
const db = prisma as unknown as {
  dailyHighlight: Record<"findUnique" | "upsert" | "deleteMany", jest.Mock>;
  task: { findFirst: jest.Mock };
};

const req = (method: string, url: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const row = (trashedAt: Date | null = null) => ({
  date: "2026-10-18",
  taskId: "t1",
  task: {
    id: "t1",
    title: "Ship the report",
    status: "todo",
    dueDate: null,
    estimatedMinutes: 45,
    trashedAt,
  },
});

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

describe("GET /api/highlight", () => {
  it("returns the day's highlight, scoped to the user and workspace", async () => {
    db.dailyHighlight.findUnique.mockResolvedValue(row());
    const res = await GET(req("GET", "/api/highlight?date=2026-10-18"));
    const json = await res?.json();
    expect(json.highlight).toMatchObject({
      date: "2026-10-18",
      taskId: "t1",
      task: { title: "Ship the report", estimatedMinutes: 45 },
    });
    expect(db.dailyHighlight.findUnique.mock.calls[0][0].where).toEqual({
      userId_workspaceId_date: {
        userId: "u1",
        workspaceId: "w1",
        date: "2026-10-18",
      },
    });
  });

  it("is null when none is set or its task went to Trash", async () => {
    db.dailyHighlight.findUnique.mockResolvedValue(null);
    expect(
      (await (await GET(req("GET", "/api/highlight?date=2026-10-18")))?.json())
        .highlight
    ).toBeNull();
    db.dailyHighlight.findUnique.mockResolvedValue(row(new Date()));
    expect(
      (await (await GET(req("GET", "/api/highlight?date=2026-10-18")))?.json())
        .highlight
    ).toBeNull();
  });

  it("needs a real day", async () => {
    expect((await GET(req("GET", "/api/highlight?date=today")))?.status).toBe(
      400
    );
    expect((await GET(req("GET", "/api/highlight")))?.status).toBe(400);
  });
});

describe("PUT /api/highlight", () => {
  it("sets the highlight for a task the person owns", async () => {
    db.task.findFirst.mockResolvedValue({ id: "t1" });
    db.dailyHighlight.upsert.mockResolvedValue(row());
    const res = await PUT(
      req("PUT", "/api/highlight", { date: "2026-10-18", taskId: "t1" })
    );
    expect(res?.status).toBe(200);
    expect(db.task.findFirst.mock.calls[0][0].where).toMatchObject({
      id: "t1",
      trashedAt: null,
      workspaceId: "w1",
    });
    expect(db.dailyHighlight.upsert.mock.calls[0][0]).toMatchObject({
      create: {
        userId: "u1",
        workspaceId: "w1",
        date: "2026-10-18",
        taskId: "t1",
      },
      update: { taskId: "t1" },
    });
  });

  it("refuses a task outside the scope", async () => {
    db.task.findFirst.mockResolvedValue(null);
    const res = await PUT(
      req("PUT", "/api/highlight", { date: "2026-10-18", taskId: "other" })
    );
    expect(res?.status).toBe(404);
    expect(db.dailyHighlight.upsert).not.toHaveBeenCalled();
  });

  it("validates its input", async () => {
    expect(
      (await PUT(req("PUT", "/api/highlight", { date: "x", taskId: "t1" })))
        ?.status
    ).toBe(400);
    expect(
      (await PUT(req("PUT", "/api/highlight", { date: "2026-10-18" })))?.status
    ).toBe(400);
  });
});

describe("DELETE /api/highlight", () => {
  it("clears the day, and is safe to repeat", async () => {
    db.dailyHighlight.deleteMany.mockResolvedValue({ count: 0 });
    const res = await DELETE(req("DELETE", "/api/highlight?date=2026-10-18"));
    expect(res?.status).toBe(200);
    expect(db.dailyHighlight.deleteMany).toHaveBeenCalledWith({
      where: { userId: "u1", workspaceId: "w1", date: "2026-10-18" },
    });
  });
});
