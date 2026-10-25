import { WorkspaceRole } from "@prisma/client";

import { isTaskPlacementBlocked } from "@/lib/flexible-hours-guard-server";

import { runOp, undoAction } from "..";
import { createFakePrisma } from "./fake-prisma";
import { OWNER_ID, access, opts, seedTask, taskRow } from "./harness";

const mockState = { db: createFakePrisma() };

jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockState.db.client;
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock("@/lib/realtime/publish", () => ({
  publishRealtimeEvent: jest.fn(),
}));
jest.mock("@/lib/task-block-push", () => ({
  schedulePushTaskBlock: jest.fn(),
}));
jest.mock("@/lib/entitlements", () => ({
  getPlan: jest.fn().mockResolvedValue("FREE"),
}));
jest.mock("@/lib/flexible-hours-guard-server", () => ({
  isPlacementBlocked: jest.fn().mockResolvedValue(false),
  isTaskPlacementBlocked: jest.fn().mockResolvedValue(false),
}));
jest.mock("@/services/connectors/webhooks", () => ({
  sendConnectorWebhook: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/services/time-tracking/timeEntries", () => ({
  recomputeTaskActuals: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/services/scheduling/TaskSchedulingService", () => ({
  scheduleAllTasksForUser: jest.fn(),
  scheduleAllTasksForUserDetailed: jest.fn(),
}));

jest.mock("@/lib/auth/workspace-auth", () => {
  const actual = jest.requireActual("@/lib/auth/workspace-auth");
  return { ...actual, resolveWorkspaceAccess: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const workspaceAuth = require("@/lib/auth/workspace-auth");

let db = mockState.db;

beforeEach(async () => {
  jest.clearAllMocks();
  (isTaskPlacementBlocked as jest.Mock).mockResolvedValue(false);
  mockState.db = createFakePrisma();
  db = mockState.db;
  workspaceAuth.resolveWorkspaceAccess.mockImplementation(
    async ({ requestedWorkspaceId }: { requestedWorkspaceId?: string }) =>
      access(WorkspaceRole.OWNER, requestedWorkspaceId)
  );
  await db.seed("userSettings", {
    userId: OWNER_ID,
    timeZone: "Europe/Berlin",
  });
});

function blocksOf(taskId: string) {
  return db.tables.scheduledBlock
    .filter((row) => row.taskId === taskId)
    .sort((a, b) => Number(a.chunkIndex) - Number(b.chunkIndex));
}

/** A task the scheduler placed on two unfrozen chunks, due a day earlier. */
async function seedScheduledTask(fields: Record<string, unknown> = {}) {
  const task = await seedTask(db, {
    estimatedMinutes: 60,
    duration: 60,
    status: "todo",
    priorityLevel: "MEDIUM",
    dueDate: new Date("2026-10-27T22:00:00.000Z"),
    scheduledStart: new Date("2026-10-26T08:00:00.000Z"),
    scheduledEnd: new Date("2026-10-26T09:00:00.000Z"),
    scheduleLocked: false,
    isAutoScheduled: true,
    autoScheduled: true,
    scheduleScore: 0.73,
    ...fields,
  });
  for (const [index, hour] of [8, 10].entries()) {
    await db.seed("scheduledBlock", {
      taskId: task.id,
      userId: OWNER_ID,
      start: new Date(`2026-10-26T${String(hour).padStart(2, "0")}:00:00.000Z`),
      end: new Date(
        `2026-10-26T${String(hour + 1).padStart(2, "0")}:00:00.000Z`
      ),
      chunkIndex: index,
      chunkCount: 2,
      isFrozen: false,
    });
  }
  return task;
}

type TaskResult = { task: { id: string; scheduledStart: string | null } };

describe("task.update: placement through the ops API", () => {
  it("places and pins a task at a wall-clock time, and undo restores the exact previous placement", async () => {
    const task = await seedScheduledTask();
    const before = { ...taskRow(db, task.id) };
    const blocksBefore = blocksOf(task.id).map((row) => ({ ...row }));

    // 14:00 in Berlin on 28 Oct (CET, UTC+1) is 13:00Z.
    const result = await runOp<TaskResult>(
      "task.update",
      { taskId: task.id, start: "2026-10-28T14:00" },
      opts()
    );
    expect(result.undoable).toBe(true);
    expect(taskRow(db, task.id)).toMatchObject({
      scheduledStart: new Date("2026-10-28T13:00:00.000Z"),
      scheduledEnd: new Date("2026-10-28T14:00:00.000Z"),
      scheduleLocked: true,
      isAutoScheduled: false,
      autoScheduled: false,
      scheduleScore: null,
      // The placed day becomes the due day (Berlin midnight).
      dueDate: new Date("2026-10-27T23:00:00.000Z"),
    });
    expect(blocksOf(task.id)).toEqual([
      expect.objectContaining({
        userId: OWNER_ID,
        start: new Date("2026-10-28T13:00:00.000Z"),
        end: new Date("2026-10-28T14:00:00.000Z"),
        chunkIndex: 0,
        chunkCount: 1,
        isFrozen: true,
      }),
    ]);

    await undoAction(result.actionId!, OWNER_ID);
    expect(taskRow(db, task.id)).toMatchObject({
      scheduledStart: before.scheduledStart,
      scheduledEnd: before.scheduledEnd,
      scheduleLocked: false,
      isAutoScheduled: true,
      autoScheduled: true,
      scheduleScore: 0.73,
      dueDate: before.dueDate,
    });
    expect(blocksOf(task.id)).toEqual(
      blocksBefore.map((row) =>
        expect.objectContaining({
          start: row.start,
          end: row.end,
          chunkIndex: row.chunkIndex,
          chunkCount: 2,
          isFrozen: false,
        })
      )
    );
  });

  it("reads an ISO time with an offset as that instant and uses the estimate for its length", async () => {
    const task = await seedScheduledTask({ estimatedMinutes: 90 });
    await runOp(
      "task.update",
      { taskId: task.id, start: "2026-10-28T09:30:00+02:00" },
      opts()
    );
    expect(taskRow(db, task.id)).toMatchObject({
      scheduledStart: new Date("2026-10-28T07:30:00.000Z"),
      scheduledEnd: new Date("2026-10-28T09:00:00.000Z"),
    });
  });

  it("an explicit dueDate in the same call beats the placed day, and undo restores it", async () => {
    const task = await seedScheduledTask();
    const dueBefore = taskRow(db, task.id).dueDate;
    const result = await runOp(
      "task.update",
      {
        taskId: task.id,
        start: "2026-10-28T14:00",
        dueDate: "2026-11-02T00:00:00.000Z",
      },
      opts()
    );
    expect(taskRow(db, task.id).dueDate).toEqual(
      new Date("2026-11-02T00:00:00.000Z")
    );
    await undoAction(result.actionId!, OWNER_ID);
    expect(taskRow(db, task.id).dueDate).toEqual(dueBefore);
  });

  it("pins a task where it is, and undo unpins it", async () => {
    const task = await seedScheduledTask();
    const blocksBefore = blocksOf(task.id).map((row) => ({ ...row }));
    const result = await runOp(
      "task.update",
      { taskId: task.id, pinned: true },
      opts()
    );
    expect(taskRow(db, task.id)).toMatchObject({
      scheduleLocked: true,
      isAutoScheduled: false,
      scheduledStart: new Date("2026-10-26T08:00:00.000Z"),
    });
    // The blocks it has stay as they are.
    expect(blocksOf(task.id)).toHaveLength(blocksBefore.length);

    await undoAction(result.actionId!, OWNER_ID);
    expect(taskRow(db, task.id)).toMatchObject({
      scheduleLocked: false,
      isAutoScheduled: true,
    });
  });

  it("unpins a pinned task back to the scheduler, and undo pins it again", async () => {
    const task = await seedScheduledTask({
      scheduleLocked: true,
      isAutoScheduled: false,
      autoScheduled: false,
    });
    const result = await runOp(
      "task.update",
      { taskId: task.id, pinned: false },
      opts()
    );
    expect(taskRow(db, task.id)).toMatchObject({
      scheduleLocked: false,
      isAutoScheduled: true,
    });

    await undoAction(result.actionId!, OWNER_ID);
    expect(taskRow(db, task.id)).toMatchObject({
      scheduleLocked: true,
      isAutoScheduled: false,
      autoScheduled: false,
    });
  });

  it("autoSchedule: false takes a task out of the scheduler, and undo puts it back in", async () => {
    const task = await seedScheduledTask();
    const result = await runOp(
      "task.update",
      { taskId: task.id, autoSchedule: false },
      opts()
    );
    expect(taskRow(db, task.id)).toMatchObject({
      isAutoScheduled: false,
      autoScheduled: false,
      scheduleLocked: false,
    });
    await undoAction(result.actionId!, OWNER_ID);
    expect(taskRow(db, task.id)).toMatchObject({
      isAutoScheduled: true,
      autoScheduled: true,
    });
  });

  it("refuses a blocked-out time and changes nothing", async () => {
    const task = await seedScheduledTask();
    const before = { ...taskRow(db, task.id) };
    (isTaskPlacementBlocked as jest.Mock).mockResolvedValueOnce(true);

    await expect(
      runOp(
        "task.update",
        { taskId: task.id, start: "2026-10-28T14:00" },
        opts()
      )
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: "This time is blocked out",
    });
    expect(isTaskPlacementBlocked).toHaveBeenCalledWith(
      OWNER_ID,
      new Date("2026-10-28T13:00:00.000Z"),
      new Date("2026-10-28T14:00:00.000Z")
    );
    expect(taskRow(db, task.id)).toMatchObject({
      scheduledStart: before.scheduledStart,
      scheduleLocked: false,
      isAutoScheduled: true,
    });
    expect(blocksOf(task.id).every((row) => row.isFrozen === false)).toBe(true);
    expect(db.tables.agentAction).toHaveLength(0);
  });

  it("refuses pinning a task that has no time, and start together with pinned: false", async () => {
    const task = await seedTask(db, { estimatedMinutes: 30 });
    await expect(
      runOp("task.update", { taskId: task.id, pinned: true }, opts())
    ).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
    await expect(
      runOp(
        "task.update",
        { taskId: task.id, start: "2026-10-28T14:00", pinned: false },
        opts()
      )
    ).rejects.toMatchObject({ code: "INVALID_INPUT", status: 400 });
    await expect(
      runOp("task.update", { taskId: task.id, start: "tomorrow" }, opts())
    ).rejects.toMatchObject({ code: "INVALID_INPUT", status: 400 });
  });

  it("refuses placing a task nobody is assigned to", async () => {
    const task = await seedTask(db, { assigneeId: null });
    await expect(
      runOp(
        "task.update",
        { taskId: task.id, start: "2026-10-28T14:00" },
        opts()
      )
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: "Assign the task before scheduling it",
    });
  });

  it("keeps the scope checks: a viewer cannot place, an archived or other workspace task is refused", async () => {
    const task = await seedScheduledTask();
    await expect(
      runOp(
        "task.update",
        { taskId: task.id, start: "2026-10-28T14:00" },
        opts(WorkspaceRole.VIEWER)
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });

    const foreign = await seedTask(db, {
      workspaceId: "ws-other",
      userId: "x",
    });
    await expect(
      runOp("task.update", { taskId: foreign.id, pinned: true }, opts())
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const archived = await seedTask(db, { isArchived: true });
    await expect(
      runOp("task.update", { taskId: archived.id, pinned: true }, opts())
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("is also reachable alongside other fields in one undoable step", async () => {
    const task = await seedScheduledTask();
    const result = await runOp(
      "task.update",
      { taskId: task.id, title: "Renamed", start: "2026-10-28T14:00" },
      opts()
    );
    expect(taskRow(db, task.id).title).toBe("Renamed");
    await undoAction(result.actionId!, OWNER_ID);
    expect(taskRow(db, task.id)).toMatchObject({
      title: "Write report",
      scheduleLocked: false,
    });
  });
});

describe("task.create: start and autoSchedule", () => {
  it("places and pins a new task, and undo archives it and releases its block", async () => {
    const result = await runOp<TaskResult>(
      "task.create",
      {
        title: "Call the bank",
        estimateMinutes: 45,
        start: "2026-10-28T14:00",
      },
      opts()
    );
    const id = result.result.task.id;
    expect(result.result.task.scheduledStart).toBe("2026-10-28T13:00:00.000Z");
    expect(taskRow(db, id)).toMatchObject({
      scheduledStart: new Date("2026-10-28T13:00:00.000Z"),
      scheduledEnd: new Date("2026-10-28T13:45:00.000Z"),
      scheduleLocked: true,
      isAutoScheduled: false,
      autoScheduled: false,
      dueDate: new Date("2026-10-27T23:00:00.000Z"),
    });
    expect(blocksOf(id)).toEqual([
      expect.objectContaining({ isFrozen: true, chunkCount: 1 }),
    ]);

    await undoAction(result.actionId!, OWNER_ID);
    expect(taskRow(db, id)).toMatchObject({
      isArchived: true,
      scheduledStart: null,
      scheduleLocked: false,
    });
    expect(blocksOf(id)).toHaveLength(0);
  });

  it("without start nothing is placed and autoSchedule still defaults to true", async () => {
    const result = await runOp<TaskResult>(
      "task.create",
      { title: "Plain" },
      opts()
    );
    const id = result.result.task.id;
    expect(taskRow(db, id)).toMatchObject({
      isAutoScheduled: true,
      autoScheduled: false,
      scheduleLocked: false,
    });
    expect(taskRow(db, id).scheduledStart ?? null).toBeNull();
    expect(blocksOf(id)).toHaveLength(0);

    const off = await runOp<TaskResult>(
      "task.create",
      { title: "Manual", autoSchedule: false },
      opts()
    );
    expect(taskRow(db, off.result.task.id).isAutoScheduled).toBe(false);
  });

  it("start with autoSchedule: true keeps the scheduler on for the pinned task", async () => {
    const result = await runOp<TaskResult>(
      "task.create",
      {
        title: "Pinned but auto",
        start: "2026-10-28T14:00",
        autoSchedule: true,
      },
      opts()
    );
    expect(taskRow(db, result.result.task.id)).toMatchObject({
      scheduleLocked: true,
      isAutoScheduled: true,
    });
  });

  it("refuses a blocked-out start and creates no task", async () => {
    (isTaskPlacementBlocked as jest.Mock).mockResolvedValueOnce(true);
    await expect(
      runOp("task.create", { title: "Nope", start: "2026-10-28T14:00" }, opts())
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: "This time is blocked out",
    });
    expect(db.tables.task).toHaveLength(0);
    expect(db.tables.scheduledBlock).toHaveLength(0);
  });
});
