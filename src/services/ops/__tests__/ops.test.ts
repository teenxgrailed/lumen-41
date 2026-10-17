import { scheduleAllTasksForUser } from "@/services/scheduling/TaskSchedulingService";
import { WorkspaceRole } from "@prisma/client";

import { getMailMessage } from "@/lib/mail-db";

import {
  OpError,
  listOps,
  runOp,
  startAgentRun,
  undoAction,
  undoRun,
} from "..";
import { createFakePrisma } from "./fake-prisma";
import {
  OTHER_ID,
  OWNER_ID,
  WORKSPACE_ID,
  access,
  opts,
  seedTask,
  taskRow,
  touchRow,
} from "./harness";

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
jest.mock("@/services/connectors/webhooks", () => ({
  sendConnectorWebhook: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/services/time-tracking/timeEntries", () => ({
  recomputeTaskActuals: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/mail-db", () => ({ getMailMessage: jest.fn() }));
jest.mock("@/lib/entitlements", () => ({
  getPlan: jest.fn().mockResolvedValue("FREE"),
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

beforeEach(() => {
  jest.clearAllMocks();
  mockState.db = createFakePrisma();
  db = mockState.db;
  workspaceAuth.resolveWorkspaceAccess.mockImplementation(
    async ({ requestedWorkspaceId }: { requestedWorkspaceId?: string }) =>
      access(WorkspaceRole.OWNER, requestedWorkspaceId ?? WORKSPACE_ID)
  );
});

function action(id: string | null) {
  return db.tables.agentAction.find((row) => row.id === id)!;
}

describe("reversible ops: the stored inverse restores the prior state", () => {
  it("task.create is undone by archiving the new task", async () => {
    const created = await runOp<{ task: { id: string } }>(
      "task.create",
      { title: "Call the bank", estimateMinutes: 30, priority: "HIGH" },
      opts()
    );
    expect(created.undoable).toBe(true);
    expect(action(created.actionId).inverse).toEqual({
      op: "task.archive",
      input: { taskId: created.result.task.id },
    });

    const undone = await undoAction(created.actionId!, OWNER_ID);
    expect(undone.status).toBe("undone");
    expect(taskRow(db, created.result.task.id).isArchived).toBe(true);
    expect(action(created.actionId).status).toBe("undone");
  });

  it("task.update writes every previous value back, tags and deadline included", async () => {
    const project = await db.seed("project", {
      workspaceId: WORKSPACE_ID,
      name: "P",
    });
    const tagA = await db.seed("tag", { userId: OWNER_ID, name: "a" });
    const tagB = await db.seed("tag", { userId: OWNER_ID, name: "b" });
    const due = new Date("2026-10-20T00:00:00.000Z");
    const task = await seedTask(db, {
      description: "old notes",
      dueDate: due,
      deadline: due,
      priorityLevel: "LOW",
      estimatedMinutes: 30,
      duration: 30,
      tags: [{ id: tagA.id }],
    });

    const result = await runOp(
      "task.update",
      {
        taskId: task.id,
        title: "Renamed",
        notes: null,
        dueDate: "2026-11-01",
        priority: "URGENT",
        projectId: project.id,
        tagIds: [tagB.id],
        estimateMinutes: 90,
      },
      opts()
    );
    expect(taskRow(db, task.id)).toMatchObject({
      title: "Renamed",
      description: null,
      priorityLevel: "URGENT",
      projectId: project.id,
      estimatedMinutes: 90,
      tags: [{ id: tagB.id }],
    });

    expect((await undoAction(result.actionId!, OWNER_ID)).status).toBe(
      "undone"
    );
    const restored = taskRow(db, task.id);
    expect(restored).toMatchObject({
      title: "Write report",
      description: "old notes",
      priorityLevel: "LOW",
      projectId: null,
      estimatedMinutes: 30,
      duration: 30,
      tags: [{ id: tagA.id }],
    });
    expect((restored.dueDate as Date).toISOString()).toBe(due.toISOString());
    expect((restored.deadline as Date).toISOString()).toBe(due.toISOString());
  });

  it("task.complete is undone back to the previous open status", async () => {
    const task = await seedTask(db, { status: "in_progress" });
    const done = await runOp("task.complete", { taskId: task.id }, opts());
    expect(taskRow(db, task.id).status).toBe("completed");
    expect(taskRow(db, task.id).completedAt).toBeInstanceOf(Date);

    await undoAction(done.actionId!, OWNER_ID);
    expect(taskRow(db, task.id)).toMatchObject({
      status: "in_progress",
      completedAt: null,
    });
  });

  it("task.complete on a series records the occurrence and moves the same task to its next date; undo puts it back", async () => {
    const due = new Date("2026-10-12T00:00:00.000Z");
    const task = await seedTask(db, {
      isRecurring: true,
      recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,WE",
      dueDate: due,
      scheduledStart: new Date("2026-10-12T09:00:00.000Z"),
      scheduledEnd: new Date("2026-10-12T10:00:00.000Z"),
    });
    jest.useFakeTimers({ now: new Date("2026-10-12T08:00:00.000Z") });
    try {
      const done = await runOp<{ task: { status: string; dueDate: string } }>(
        "task.complete",
        { taskId: task.id },
        opts()
      );
      expect(done.undoable).toBe(true);
      expect(done.result.task).toMatchObject({
        status: "todo",
        dueDate: "2026-10-14T00:00:00.000Z",
      });
      const row = taskRow(db, task.id);
      expect(row.completedAt).toBeNull();
      expect((row.scheduledStart as Date).toISOString()).toBe(
        "2026-10-14T09:00:00.000Z"
      );
      const finished = db.tables.task.filter(
        (r) => r.recurrenceMasterId === task.id
      );
      expect(finished).toHaveLength(1);
      expect(finished[0]).toMatchObject({ status: "completed" });

      await undoAction(done.actionId!, OWNER_ID);
      expect(
        db.tables.task.filter((r) => r.recurrenceMasterId === task.id)
      ).toHaveLength(0);
      const back = taskRow(db, task.id);
      expect((back.dueDate as Date).toISOString()).toBe(due.toISOString());
      expect((back.scheduledStart as Date).toISOString()).toBe(
        "2026-10-12T09:00:00.000Z"
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it("task.uncomplete is undone back to completed with the original timestamp", async () => {
    const completedAt = new Date("2026-10-02T09:00:00.000Z");
    const task = await seedTask(db, { status: "completed", completedAt });
    const reopened = await runOp(
      "task.uncomplete",
      { taskId: task.id },
      opts()
    );
    expect(taskRow(db, task.id)).toMatchObject({
      status: "todo",
      completedAt: null,
    });

    await undoAction(reopened.actionId!, OWNER_ID);
    expect(taskRow(db, task.id).status).toBe("completed");
    expect((taskRow(db, task.id).completedAt as Date).toISOString()).toBe(
      completedAt.toISOString()
    );
  });

  it("task.archive is undone with its placement and blocks", async () => {
    const start = new Date("2026-10-05T09:00:00.000Z");
    const end = new Date("2026-10-05T10:00:00.000Z");
    const task = await seedTask(db, {
      scheduledStart: start,
      scheduledEnd: end,
      scheduleLocked: true,
    });
    await db.seed("scheduledBlock", {
      taskId: task.id,
      userId: OWNER_ID,
      start,
      end,
      chunkIndex: 0,
      chunkCount: 1,
      isFrozen: true,
    });

    const archived = await runOp("task.archive", { taskId: task.id }, opts());
    expect(taskRow(db, task.id)).toMatchObject({
      isArchived: true,
      scheduledStart: null,
    });
    expect(db.tables.scheduledBlock).toHaveLength(0);

    await undoAction(archived.actionId!, OWNER_ID);
    expect(taskRow(db, task.id)).toMatchObject({
      isArchived: false,
      archivedAt: null,
      scheduleLocked: true,
    });
    expect((taskRow(db, task.id).scheduledStart as Date).toISOString()).toBe(
      start.toISOString()
    );
    expect(db.tables.scheduledBlock).toEqual([
      expect.objectContaining({ taskId: task.id, isFrozen: true, start }),
    ]);
  });

  it("task.unarchive is undone by archiving again", async () => {
    const task = await seedTask(db, {
      isArchived: true,
      archivedAt: new Date(),
    });
    const restored = await runOp("task.unarchive", { taskId: task.id }, opts());
    expect(taskRow(db, task.id).isArchived).toBe(false);
    await undoAction(restored.actionId!, OWNER_ID);
    expect(taskRow(db, task.id).isArchived).toBe(true);
  });

  it("task.move_to_day keeps the wall-clock time in the user's zone, and undo restores dates and blocks", async () => {
    await db.seed("userSettings", {
      userId: OWNER_ID,
      timeZone: "Europe/Berlin",
    });
    // 09:00 Berlin (CEST, UTC+2) on 5 October.
    const start = new Date("2026-10-05T07:00:00.000Z");
    const end = new Date("2026-10-05T08:00:00.000Z");
    const task = await seedTask(db, {
      scheduledStart: start,
      scheduledEnd: end,
    });
    await db.seed("scheduledBlock", {
      taskId: task.id,
      userId: OWNER_ID,
      start,
      end,
      chunkIndex: 0,
      chunkCount: 1,
      isFrozen: false,
    });

    // 30 October is after the switch to CET (UTC+1): 09:00 Berlin = 08:00Z.
    const moved = await runOp(
      "task.move_to_day",
      { taskId: task.id, date: "2026-10-30" },
      opts()
    );
    expect((taskRow(db, task.id).scheduledStart as Date).toISOString()).toBe(
      "2026-10-30T08:00:00.000Z"
    );
    expect((db.tables.scheduledBlock[0].start as Date).toISOString()).toBe(
      "2026-10-30T08:00:00.000Z"
    );

    await undoAction(moved.actionId!, OWNER_ID);
    expect((taskRow(db, task.id).scheduledStart as Date).toISOString()).toBe(
      start.toISOString()
    );
    expect((taskRow(db, task.id).scheduledEnd as Date).toISOString()).toBe(
      end.toISOString()
    );
    expect((db.tables.scheduledBlock[0].start as Date).toISOString()).toBe(
      start.toISOString()
    );
  });

  it("task.move_to_day gives an unplaced task that day as its due date, and undo clears it", async () => {
    await db.seed("userSettings", {
      userId: OWNER_ID,
      timeZone: "America/New_York",
    });
    const task = await seedTask(db);
    const moved = await runOp(
      "task.move_to_day",
      { taskId: task.id, date: "2026-10-14" },
      opts()
    );
    expect((taskRow(db, task.id).dueDate as Date).toISOString()).toBe(
      "2026-10-14T04:00:00.000Z"
    );
    await undoAction(moved.actionId!, OWNER_ID);
    expect(taskRow(db, task.id).dueDate).toBeNull();
  });

  it("schedule.auto is undone by restoring only the tasks it moved, with their blocks", async () => {
    const moved = await seedTask(db, {
      title: "Moved",
      scheduledStart: new Date("2026-10-05T09:00:00.000Z"),
      scheduledEnd: new Date("2026-10-05T10:00:00.000Z"),
    });
    await db.seed("scheduledBlock", {
      taskId: moved.id,
      userId: OWNER_ID,
      start: new Date("2026-10-05T09:00:00.000Z"),
      end: new Date("2026-10-05T10:00:00.000Z"),
      chunkIndex: 0,
      chunkCount: 1,
      isFrozen: false,
    });
    const untouched = await seedTask(db, { title: "Untouched" });

    jest.mocked(scheduleAllTasksForUser).mockImplementation(async () => {
      const client = db.client as {
        task: { update: (args: unknown) => Promise<unknown> };
        scheduledBlock: {
          deleteMany: (args: unknown) => Promise<unknown>;
          create: (args: unknown) => Promise<unknown>;
        };
      };
      await client.task.update({
        where: { id: moved.id },
        data: {
          scheduledStart: new Date("2026-10-06T13:00:00.000Z"),
          scheduledEnd: new Date("2026-10-06T14:00:00.000Z"),
        },
      });
      await client.scheduledBlock.deleteMany({ where: { taskId: moved.id } });
      await client.scheduledBlock.create({
        data: {
          taskId: moved.id,
          userId: OWNER_ID,
          start: new Date("2026-10-06T13:00:00.000Z"),
          end: new Date("2026-10-06T14:00:00.000Z"),
          chunkIndex: 0,
          chunkCount: 1,
          isFrozen: false,
        },
      });
      return [];
    });

    const run = await runOp<{ changedTaskIds: string[] }>(
      "schedule.auto",
      {},
      opts()
    );
    expect(run.result.changedTaskIds).toEqual([moved.id]);
    expect(
      (action(run.actionId).targetVersions as { model: string; id: string }[])
        .filter((row) => row.model === "task")
        .map((row) => row.id)
    ).toEqual([moved.id]);

    expect((await undoAction(run.actionId!, OWNER_ID)).status).toBe("undone");
    expect((taskRow(db, moved.id).scheduledStart as Date).toISOString()).toBe(
      "2026-10-05T09:00:00.000Z"
    );
    expect(
      db.tables.scheduledBlock.map((block) =>
        (block.start as Date).toISOString()
      )
    ).toEqual(["2026-10-05T09:00:00.000Z"]);
    expect(taskRow(db, untouched.id).updatedAt).toEqual(untouched.updatedAt);
  });

  it("project.create is undone by archiving; project.archive by restoring the status", async () => {
    const created = await runOp<{ project: { id: string } }>(
      "project.create",
      { name: "Launch" },
      opts()
    );
    const projectId = created.result.project.id;
    await undoAction(created.actionId!, OWNER_ID);
    expect(db.tables.project[0].status).toBe("archived");

    await touchRow(db, "project", projectId, { status: "active" });
    const archived = await runOp("project.archive", { projectId }, opts());
    expect(db.tables.project[0].status).toBe("archived");
    await undoAction(archived.actionId!, OWNER_ID);
    expect(db.tables.project[0].status).toBe("active");
  });

  it("mail.to_task creates a follow-up task and undo archives it", async () => {
    jest.mocked(getMailMessage).mockResolvedValue({
      id: "msg-1",
      subject: "Invoice",
      fromName: "Ana",
      fromAddress: "ana@example.com",
      snippet: "Please pay",
    } as never);
    const created = await runOp<{ task: { id: string; title: string } }>(
      "mail.to_task",
      { messageId: "msg-1" },
      opts()
    );
    expect(created.result.task.title).toBe("Follow up: Invoice");
    expect(taskRow(db, created.result.task.id).source).toBe("mail");
    await undoAction(created.actionId!, OWNER_ID);
    expect(taskRow(db, created.result.task.id).isArchived).toBe(true);
  });

  it("mail.to_task reports a message the user cannot see as not found", async () => {
    jest.mocked(getMailMessage).mockResolvedValue(null);
    await expect(
      runOp("mail.to_task", { messageId: "nope" }, opts())
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  });

  it("habit.log is undone by clearing the day; logging an already-logged day stores no inverse", async () => {
    const habit = await db.seed("habit", {
      userId: OWNER_ID,
      workspaceId: WORKSPACE_ID,
      title: "Run",
      archivedAt: null,
      isActive: true,
    });
    const logged = await runOp(
      "habit.log",
      { habitId: habit.id, date: "2026-10-10" },
      opts()
    );
    expect(db.tables.habitCompletion).toHaveLength(1);

    const again = await runOp(
      "habit.log",
      { habitId: habit.id, date: "2026-10-10" },
      opts()
    );
    expect(again.undoable).toBe(false);

    await undoAction(logged.actionId!, OWNER_ID);
    expect(db.tables.habitCompletion).toHaveLength(0);
  });
});

describe("read ops", () => {
  it("task.list, task.get and schedule.get_day read only the workspace", async () => {
    await db.seed("userSettings", { userId: OWNER_ID, timeZone: "UTC" });
    const mine = await seedTask(db, {
      title: "Mine",
      scheduledStart: new Date("2026-10-12T09:00:00.000Z"),
      scheduledEnd: new Date("2026-10-12T10:00:00.000Z"),
    });
    await seedTask(db, { title: "Elsewhere", workspaceId: "ws-other" });

    const list = await runOp<{ tasks: { id: string }[] }>(
      "task.list",
      {},
      opts()
    );
    expect(list.result.tasks.map((task) => task.id)).toEqual([mine.id]);
    expect(list.actionId).toBeNull();

    const one = await runOp<{ task: { title: string } }>(
      "task.get",
      { taskId: mine.id },
      opts()
    );
    expect(one.result.task.title).toBe("Mine");

    const day = await runOp<{ tasks: { id: string }[] }>(
      "schedule.get_day",
      { date: "2026-10-12" },
      opts()
    );
    expect(day.result.tasks.map((task) => task.id)).toEqual([mine.id]);
    expect(db.tables.agentAction).toHaveLength(0);
  });
});

describe("undo conflicts", () => {
  it("marks undo_conflict and does not overwrite a row changed after the action", async () => {
    const task = await seedTask(db);
    const updated = await runOp(
      "task.update",
      { taskId: task.id, title: "Agent title" },
      opts()
    );
    await touchRow(db, "task", task.id, { title: "Person typed this" });

    const result = await undoAction(updated.actionId!, OWNER_ID);
    expect(result).toMatchObject({
      status: "undo_conflict",
      conflicts: [
        expect.objectContaining({
          model: "task",
          id: task.id,
          reason: "changed",
        }),
      ],
    });
    expect(taskRow(db, task.id).title).toBe("Person typed this");
    expect(action(updated.actionId).status).toBe("undo_conflict");
  });

  it("reports a deleted row as a conflict", async () => {
    const task = await seedTask(db);
    const updated = await runOp(
      "task.update",
      { taskId: task.id, title: "Agent title" },
      opts()
    );
    db.tables.task = [];
    const result = await undoAction(updated.actionId!, OWNER_ID);
    expect(result).toMatchObject({
      status: "undo_conflict",
      conflicts: [expect.objectContaining({ reason: "deleted" })],
    });
  });
});

describe("run undo", () => {
  it("undoes a run newest first without tripping over its own restores", async () => {
    const run = await startAgentRun({
      userId: OWNER_ID,
      workspaceId: WORKSPACE_ID,
      actor: "agent",
      source: "chat",
    });
    const options = { ...opts(), runId: run.id };
    const created = await runOp<{ task: { id: string } }>(
      "task.create",
      { title: "Draft" },
      options
    );
    const taskId = created.result.task.id;
    await runOp("task.update", { taskId, title: "Final" }, options);
    await runOp("task.complete", { taskId }, options);

    const result = await undoRun(run.id, OWNER_ID);
    expect(result.status).toBe("undone");
    expect(result.results.map((entry) => [entry.op, entry.status])).toEqual([
      ["task.complete", "undone"],
      ["task.update", "undone"],
      ["task.create", "undone"],
    ]);
    expect(taskRow(db, taskId)).toMatchObject({
      title: "Draft",
      status: "todo",
      isArchived: true,
    });
    expect(db.tables.agentRun[0].status).toBe("undone");
  });

  it("stops at the first conflict and leaves older actions applied", async () => {
    const run = await startAgentRun({
      userId: OWNER_ID,
      workspaceId: WORKSPACE_ID,
      actor: "agent",
      source: "chat",
    });
    const options = { ...opts(), runId: run.id };
    const first = await seedTask(db, { title: "First" });
    const second = await seedTask(db, { title: "Second" });
    const older = await runOp(
      "task.update",
      { taskId: first.id, title: "A" },
      options
    );
    await runOp("task.update", { taskId: second.id, title: "B" }, options);
    await touchRow(db, "task", second.id, { title: "Changed by a person" });

    const result = await undoRun(run.id, OWNER_ID);
    expect(result.status).toBe("partial");
    expect(result.results).toEqual([
      expect.objectContaining({ status: "undo_conflict" }),
    ]);
    expect(result.remaining).toEqual([older.actionId]);
    expect(taskRow(db, first.id).title).toBe("A");
  });
});

describe("access", () => {
  it("refuses writes for a VIEWER and still allows reads", async () => {
    const task = await seedTask(db);
    await expect(
      runOp(
        "task.update",
        { taskId: task.id, title: "x" },
        opts(WorkspaceRole.VIEWER)
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(taskRow(db, task.id).title).toBe("Write report");
    await expect(
      runOp("task.list", {}, opts(WorkspaceRole.VIEWER))
    ).resolves.toMatchObject({ op: "task.list" });
  });

  it("refuses undo when the user is now only a VIEWER of the action's workspace", async () => {
    const created = await runOp("task.create", { title: "x" }, opts());
    workspaceAuth.resolveWorkspaceAccess.mockRejectedValue(
      new workspaceAuth.WorkspaceAuthorizationError(
        "The requested workspace role is required.",
        403,
        "WORKSPACE_ROLE_REQUIRED"
      )
    );
    await expect(undoAction(created.actionId!, OWNER_ID)).rejects.toMatchObject(
      {
        code: "FORBIDDEN",
      }
    );
    expect(action(created.actionId).status).toBe("applied");
  });

  it("treats another user's action or run as not found", async () => {
    const run = await startAgentRun({
      userId: OWNER_ID,
      workspaceId: WORKSPACE_ID,
      actor: "agent",
      source: "chat",
    });
    const created = await runOp(
      "task.create",
      { title: "x" },
      { ...opts(), runId: run.id }
    );
    await expect(undoAction(created.actionId!, OTHER_ID)).rejects.toMatchObject(
      {
        code: "NOT_FOUND",
        status: 404,
      }
    );
    await expect(undoRun(run.id, OTHER_ID)).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
    expect(action(created.actionId).status).toBe("applied");
  });

  it("does not let a task id from another workspace through", async () => {
    const foreign = await seedTask(db, { workspaceId: "ws-other" });
    await expect(
      runOp("task.archive", { taskId: foreign.id }, opts())
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(taskRow(db, foreign.id).isArchived).toBe(false);
  });
});

describe("input validation", () => {
  it("rejects unknown fields (strict schemas)", async () => {
    const task = await seedTask(db);
    const error = await runOp(
      "task.update",
      { taskId: task.id, title: "x", status: "completed" },
      opts()
    ).catch((caught) => caught);
    expect(error).toBeInstanceOf(OpError);
    expect(error).toMatchObject({ code: "INVALID_INPUT", status: 400 });
    expect(taskRow(db, task.id).title).toBe("Write report");
  });

  it("rejects an update with nothing to change and malformed dates", async () => {
    const task = await seedTask(db);
    await expect(
      runOp("task.update", { taskId: task.id }, opts())
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      runOp("task.move_to_day", { taskId: task.id, date: "tomorrow" }, opts())
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("does not expose inverse-only ops", async () => {
    const task = await seedTask(db);
    await expect(
      runOp("task.restore", { taskId: task.id, fields: { title: "x" } }, opts())
    ).rejects.toMatchObject({ code: "OP_NOT_FOUND", status: 404 });
    const names = listOps().map((op) => op.name);
    expect(names).not.toContain("task.restore");
    expect(names).not.toContain("schedule.restore");
    expect(names).toEqual(
      expect.arrayContaining([
        "task.create",
        "task.update",
        "task.complete",
        "task.uncomplete",
        "task.archive",
        "task.unarchive",
        "task.move_to_day",
        "schedule.auto",
        "schedule.get_day",
        "project.create",
        "project.archive",
        "mail.to_task",
        "habit.log",
        "habit.unlog",
        "task.list",
        "task.get",
      ])
    );
    const create = listOps().find((op) => op.name === "task.create")!;
    expect(create.input).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["title"],
    });
  });

  it("rolls back the write when the action log insert fails", async () => {
    const task = await seedTask(db);
    const agentAction = db.client.agentAction as {
      create: jest.Mock | unknown;
    };
    const original = (agentAction as { create: unknown }).create;
    (agentAction as { create: unknown }).create = jest
      .fn()
      .mockRejectedValue(new Error("db down"));
    await expect(
      runOp("task.update", { taskId: task.id, title: "x" }, opts())
    ).rejects.toThrow("db down");
    (agentAction as { create: unknown }).create = original;
    expect(taskRow(db, task.id).title).toBe("Write report");
  });
});
