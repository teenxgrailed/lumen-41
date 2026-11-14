import { NextRequest } from "next/server";

import { GET, PUT } from "@/app/api/tasks/[id]/count/route";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/realtime/publish", () => ({
  publishRealtimeEventSafe: jest.fn(),
}));
jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    task: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    taskPart: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

type Part = { id: string; title: string; done: boolean; position: number };

const db = prisma as unknown as {
  task: { findFirst: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  taskPart: Record<string, jest.Mock>;
  $transaction: jest.Mock;
};

/* An in-memory part table for one task, behind the mocked Prisma calls. */
let rows: Part[] = [];
let seq = 0;

beforeEach(() => {
  jest.clearAllMocks();
  seq = 0;
  (authenticateRequest as jest.Mock).mockResolvedValue({
    userId: "user-1",
    workspace: {
      enabled: true,
      workspaceId: "ws-a",
      workspaceKind: "TEAM",
      role: "OWNER",
      dataScope: { mode: "workspace", workspaceId: "ws-a" },
    },
  });
  db.task.findFirst.mockImplementation(
    async ({ where }: { where: { id: string } }) =>
      where.id === "task-1" ? { id: "task-1" } : null
  );
  db.task.findUnique.mockResolvedValue({ isArchived: false, trashedAt: null });
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn(prisma)
  );
  db.taskPart.findMany.mockImplementation(async () =>
    [...rows].sort((a, b) => a.position - b.position)
  );
  db.taskPart.deleteMany.mockImplementation(
    async ({ where }: { where: { id: { in: string[] } } }) => {
      rows = rows.filter((r) => !where.id.in.includes(r.id));
    }
  );
  db.taskPart.update.mockImplementation(
    async ({
      where,
      data,
    }: {
      where: { id: string };
      data: { done: boolean };
    }) => {
      rows = rows.map((r) => (r.id === where.id ? { ...r, ...data } : r));
      return { id: where.id };
    }
  );
  db.taskPart.create.mockImplementation(
    async ({ data }: { data: Omit<Part, "id"> }) => {
      const row = { id: `new-${++seq}`, ...data };
      rows.push(row);
      return { id: row.id };
    }
  );
});

const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/tasks/task-1/count", {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const ctx = (id = "task-1") => ({ params: Promise.resolve({ id }) });

describe("plan 11 T-1: /api/tasks/:id/count", () => {
  it("makes a task a 0/3 counter out of unnamed parts", async () => {
    rows = [];
    const res = await PUT(req("PUT", { target: 3 }), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.target).toBe(3);
    expect(body.done).toBe(0);
    expect(rows.map((r) => r.title)).toEqual(["", "", ""]);
  });

  it("ticks in order and keeps the ids that stay", async () => {
    rows = [
      { id: "a", title: "", done: false, position: 1024 },
      { id: "b", title: "", done: false, position: 2048 },
      { id: "c", title: "", done: false, position: 3072 },
    ];
    const res = await PUT(req("PUT", { target: 2, done: 1 }), ctx());
    expect(res.status).toBe(200);
    expect(rows).toEqual([
      { id: "a", title: "", done: true, position: 1024 },
      { id: "b", title: "", done: false, position: 2048 },
    ]);
  });

  it("keeps the ticks already made when only the target changes", async () => {
    rows = [{ id: "a", title: "", done: true, position: 1024 }];
    await PUT(req("PUT", { target: 2 }), ctx());
    expect(rows.map((r) => r.done)).toEqual([true, false]);
  });

  it("refuses a task with named subtasks", async () => {
    rows = [{ id: "a", title: "Photograph it", done: false, position: 1 }];
    const res = await PUT(req("PUT", { target: 3 }), ctx());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("NAMED_PARTS");
    expect(db.taskPart.create).not.toHaveBeenCalled();
  });

  it("rejects done above target and counts past the limit", async () => {
    expect((await PUT(req("PUT", { target: 2, done: 3 }), ctx())).status).toBe(
      400
    );
    expect((await PUT(req("PUT", { target: 1000 }), ctx())).status).toBe(400);
  });

  it("refuses an archived task", async () => {
    db.task.findUnique.mockResolvedValue({ isArchived: true, trashedAt: null });
    expect((await PUT(req("PUT", { target: 2 }), ctx())).status).toBe(409);
  });

  it("is 404 for a task the caller cannot see", async () => {
    expect((await PUT(req("PUT", { target: 1 }), ctx("other"))).status).toBe(
      404
    );
  });

  it("reads the counter back", async () => {
    rows = [
      { id: "a", title: "", done: true, position: 1 },
      { id: "b", title: "", done: false, position: 2 },
    ];
    const res = await GET(req("GET"), ctx());
    expect(await res.json()).toEqual({ counter: true, target: 2, done: 1 });
  });
});
