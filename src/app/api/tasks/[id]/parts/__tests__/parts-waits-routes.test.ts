import { NextRequest } from "next/server";

import {
  DELETE as deletePart,
  PATCH as patchPart,
} from "@/app/api/tasks/[id]/parts/[partId]/route";
import {
  POST as addPart,
  GET as listParts,
} from "@/app/api/tasks/[id]/parts/route";
import { PATCH as patchWait } from "@/app/api/tasks/[id]/waits/[waitId]/route";
import { POST as openWait } from "@/app/api/tasks/[id]/waits/route";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    task: { findFirst: jest.fn() },
    taskPart: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    taskWait: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    workspaceMember: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const authenticate = authenticateRequest as jest.Mock;
const db = prisma as unknown as {
  task: { findFirst: jest.Mock };
  taskPart: Record<string, jest.Mock>;
  taskWait: Record<string, jest.Mock>;
  workspaceMember: { findUnique: jest.Mock };
  $transaction: jest.Mock;
};

/* One task, in workspace A. */
const TASK = { id: "task-1", workspaceId: "ws-a" };

function signIn(workspaceId: string) {
  authenticate.mockResolvedValue({
    userId: `user-${workspaceId}`,
    workspace: {
      enabled: true,
      workspaceId,
      workspaceKind: "TEAM",
      role: "OWNER",
      dataScope: { mode: "workspace", workspaceId },
    },
  });
}

const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/tasks/task-1/x", {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const ctx = <P extends object>(p: P) => ({
  params: Promise.resolve({ id: TASK.id, ...p }),
});

beforeEach(() => {
  jest.clearAllMocks();
  db.task.findFirst.mockImplementation(
    async ({ where }: { where: { id: string; workspaceId?: string } }) =>
      where.id === TASK.id && where.workspaceId === TASK.workspaceId
        ? { id: TASK.id }
        : null
  );
  db.taskPart.findFirst.mockResolvedValue({ id: "part-1" });
  db.taskWait.findFirst.mockResolvedValue({ id: "wait-1" });
});

describe("task parts and waits routes", () => {
  describe("another workspace's task is a 404 and nothing is written", () => {
    beforeEach(() => signIn("ws-b"));

    it.each([
      ["GET parts", () => listParts(req("GET"), ctx({}))],
      ["POST part", () => addPart(req("POST", { title: "x" }), ctx({}))],
      [
        "PATCH part",
        () =>
          patchPart(req("PATCH", { done: true }), ctx({ partId: "part-1" })),
      ],
      [
        "DELETE part",
        () => deletePart(req("DELETE"), ctx({ partId: "part-1" })),
      ],
      [
        "POST wait",
        () => openWait(req("POST", { on: "user-ws-b", for: "files" }), ctx({})),
      ],
      [
        "PATCH wait",
        () =>
          patchWait(
            req("PATCH", { resolved: true }),
            ctx({ waitId: "wait-1" })
          ),
      ],
    ])("%s", async (_name, call) => {
      const res = await call();
      expect(res.status).toBe(404);
      expect(db.task.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TASK.id, workspaceId: "ws-b" },
        })
      );
      expect(db.taskPart.create).not.toHaveBeenCalled();
      expect(db.taskPart.update).not.toHaveBeenCalled();
      expect(db.taskPart.delete).not.toHaveBeenCalled();
      expect(db.taskWait.create).not.toHaveBeenCalled();
      expect(db.taskWait.update).not.toHaveBeenCalled();
      expect(db.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("in the task's own workspace", () => {
    beforeEach(() => signIn("ws-a"));

    it("adds a part after the last one", async () => {
      db.taskPart.findFirst.mockResolvedValueOnce({ position: 2048 });
      db.taskPart.create.mockImplementation(async ({ data }) => ({
        id: "part-2",
        ...data,
      }));
      const res = await addPart(req("POST", { title: " Print " }), ctx({}));
      expect(res.status).toBe(201);
      expect(db.taskPart.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            taskId: TASK.id,
            title: "Print",
            done: false,
            position: 3072,
          },
        })
      );
    });

    it("404s a part that belongs to another task", async () => {
      db.taskPart.findFirst.mockResolvedValueOnce(null);
      const res = await patchPart(
        req("PATCH", { done: true }),
        ctx({ partId: "elsewhere" })
      );
      expect(res.status).toBe(404);
      expect(db.taskPart.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "elsewhere", taskId: TASK.id } })
      );
      expect(db.taskPart.update).not.toHaveBeenCalled();
    });

    it("rejects an empty part patch", async () => {
      const res = await patchPart(req("PATCH", {}), ctx({ partId: "part-1" }));
      expect(res.status).toBe(400);
    });

    it("will not wait on someone outside the workspace", async () => {
      db.workspaceMember.findUnique.mockResolvedValue(null);
      const res = await openWait(
        req("POST", { on: "stranger", for: "files" }),
        ctx({})
      );
      expect(res.status).toBe(400);
      expect(db.$transaction).not.toHaveBeenCalled();
    });

    it("opening a wait resolves the open one in the same transaction", async () => {
      db.workspaceMember.findUnique.mockResolvedValue({ id: "m" });
      db.$transaction.mockResolvedValue([{ count: 1 }, { id: "wait-2" }]);
      const res = await openWait(
        req("POST", { on: "anna", for: "the sign-off" }),
        ctx({})
      );
      expect(res.status).toBe(201);
      expect(db.taskWait.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { taskId: TASK.id, resolvedAt: null },
        })
      );
      expect(db.taskWait.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            taskId: TASK.id,
            waitingOnUserId: "anna",
            reason: "the sign-off",
          },
        })
      );
    });
  });
});
