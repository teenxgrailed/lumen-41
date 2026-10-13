import { prisma } from "@/lib/prisma";

import {
  appendSubtasks,
  checkBlocker,
  normalizeSubtasks,
  partsCreateData,
  setSubtaskDone,
} from "../subtasks";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    task: { findFirst: jest.fn() },
    taskPart: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

const workspace = {
  workspaceId: "w1",
  workspaceKind: "PERSONAL",
  role: "OWNER",
  dataScope: { mode: "personal" },
} as never;
const auth = { userId: "u1", workspace };
const db = prisma as unknown as {
  task: { findFirst: jest.Mock };
  taskPart: Record<"findFirst" | "create" | "update" | "count", jest.Mock>;
  $transaction: jest.Mock;
};

beforeEach(() => jest.resetAllMocks());

describe("subtask drafts", () => {
  it("keeps the order, trims, and defaults done to false", () => {
    expect(
      normalizeSubtasks([" a ", { title: "b ", done: true }, "c"])
    ).toEqual([
      { title: "a", done: false },
      { title: "b", done: true },
      { title: "c", done: false },
    ]);
    expect(normalizeSubtasks(undefined)).toEqual([]);
  });

  it("numbers nested-create parts from the start position", () => {
    expect(partsCreateData(normalizeSubtasks(["a", "b"]), 3)).toEqual({
      create: [
        { title: "a", done: false, position: 3 },
        { title: "b", done: false, position: 4 },
      ],
    });
    expect(partsCreateData([])).toBeUndefined();
  });
});

describe("checkBlocker", () => {
  it("refuses a task that waits on itself", async () => {
    expect(await checkBlocker(auth, "t1", "t1")).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it("refuses a blocker that is not a live task in the workspace", async () => {
    db.task.findFirst.mockResolvedValueOnce(null);
    expect(await checkBlocker(auth, "nope")).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it("refuses a loop through the chain above the blocker", async () => {
    db.task.findFirst
      .mockResolvedValueOnce({ id: "b", dependsOnId: "c" })
      .mockResolvedValueOnce({ dependsOnId: "a" });
    expect(await checkBlocker(auth, "b", "a")).toMatchObject({
      ok: false,
      status: 409,
    });
  });

  it("accepts a blocker with no loop, and any live blocker on create", async () => {
    db.task.findFirst
      .mockResolvedValueOnce({ id: "b", dependsOnId: "c" })
      .mockResolvedValueOnce({ dependsOnId: null });
    expect(await checkBlocker(auth, "b", "a")).toEqual({ ok: true });
    db.task.findFirst.mockResolvedValueOnce({ id: "b", dependsOnId: null });
    expect(await checkBlocker(auth, "b")).toEqual({ ok: true });
  });
});

describe("appendSubtasks", () => {
  it("adds after the last position, in order", async () => {
    db.task.findFirst.mockResolvedValue({
      id: "t1",
      isArchived: false,
      _count: { parts: 2 },
    });
    db.taskPart.findFirst.mockResolvedValue({ position: 4 });
    db.taskPart.create.mockImplementation(({ data }) => data);
    db.$transaction.mockImplementation(async (ops) => ops);
    const result = await appendSubtasks({
      ...auth,
      taskId: "t1",
      subtasks: normalizeSubtasks(["a", "b"]),
    });
    expect(result.ok).toBe(true);
    expect(db.taskPart.create.mock.calls.map(([a]) => a.data.position)).toEqual(
      [5, 6]
    );
  });

  it("refuses an archived task and a task that would pass 30", async () => {
    db.task.findFirst.mockResolvedValueOnce({
      id: "t1",
      isArchived: true,
      _count: { parts: 0 },
    });
    expect(
      await appendSubtasks({ ...auth, taskId: "t1", subtasks: [] })
    ).toMatchObject({ ok: false, status: 409 });
    db.task.findFirst.mockResolvedValueOnce({
      id: "t1",
      isArchived: false,
      _count: { parts: 29 },
    });
    expect(
      await appendSubtasks({
        ...auth,
        taskId: "t1",
        subtasks: normalizeSubtasks(["a", "b"]),
      })
    ).toMatchObject({ ok: false, status: 400 });
  });
});

describe("setSubtaskDone", () => {
  it("reports allDone when no subtask is left, and never closes the task", async () => {
    db.taskPart.findFirst.mockResolvedValue({ id: "s1" });
    db.taskPart.update.mockResolvedValue({ id: "s1", done: true });
    db.taskPart.count.mockResolvedValue(0);
    const result = await setSubtaskDone({
      ...auth,
      taskId: "t1",
      subtaskId: "s1",
      done: true,
    });
    expect(result).toMatchObject({ ok: true, open: 0, allDone: true });
    expect(db.task.findFirst).not.toHaveBeenCalled();
  });

  it("404s a subtask of another task", async () => {
    db.taskPart.findFirst.mockResolvedValue(null);
    expect(
      await setSubtaskDone({
        ...auth,
        taskId: "t1",
        subtaskId: "x",
        done: true,
      })
    ).toMatchObject({ ok: false, status: 404 });
  });
});
