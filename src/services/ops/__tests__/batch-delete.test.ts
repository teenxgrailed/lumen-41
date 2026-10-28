import { getPage, updatePage } from "@/services/pages/page-service";
import { WorkspaceRole } from "@prisma/client";

import { runOp, undoAction } from "..";
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
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/realtime/publish", () => ({
  publishRealtimeEvent: jest.fn(),
}));
jest.mock("@/lib/entitlements", () => ({
  getPlan: jest.fn().mockResolvedValue("PRO"),
  canUseGoals: jest
    .fn()
    .mockResolvedValue({ allowed: true, upgradeRequired: false, plan: "PRO" }),
}));
jest.mock("@/lib/task-block-push", () => ({
  schedulePushTaskBlock: jest.fn(),
}));
jest.mock("@/services/scheduling/TaskSchedulingService", () => ({
  scheduleAllTasksForUser: jest.fn(),
  scheduleAllTasksForUserDetailed: jest.fn(),
}));
jest.mock("@/services/connectors/webhooks", () => ({
  sendConnectorWebhook: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/services/time-tracking/timeEntries", () => ({
  recomputeTaskActuals: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/services/pages/page-service", () => ({
  appendPageBlocks: jest.fn(),
  createPage: jest.fn(),
  getPage: jest.fn(),
  updatePage: jest.fn(),
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

type Deleted = {
  deleted: {
    type: string;
    id: string;
    title?: string;
    alreadyDeleted?: true;
  }[];
  failed: { type: string; id: string; code: string; error: string }[];
  counts: { deleted: number; failed: number };
};

const row = (table: string, id: string) =>
  db.tables[table].find((candidate) => candidate.id === id)!;

async function seedProject(fields: Record<string, unknown> = {}) {
  return db.seed("project", {
    name: "Inbox",
    userId: OWNER_ID,
    workspaceId: WORKSPACE_ID,
    ...fields,
  });
}

async function seedHabit(fields: Record<string, unknown> = {}) {
  return db.seed("habit", {
    title: "Stretch",
    userId: OWNER_ID,
    workspaceId: WORKSPACE_ID,
    isActive: true,
    ...fields,
  });
}

async function deleteItems(items: { type: string; id: string }[]) {
  return runOp<Deleted>("item.delete", { items }, opts());
}

describe("item.delete", () => {
  it("moves tasks to Trash, releases their time, and one undo brings them all back", async () => {
    const start = new Date("2026-10-20T09:00:00.000Z");
    const end = new Date("2026-10-20T10:00:00.000Z");
    const a = await seedTask(db, {
      title: "A",
      scheduledStart: start,
      scheduledEnd: end,
      scheduleLocked: true,
      isAutoScheduled: true,
    });
    const b = await seedTask(db, { title: "B" });
    await db.seed("scheduledBlock", {
      taskId: a.id,
      userId: OWNER_ID,
      start,
      end,
      chunkIndex: 0,
      chunkCount: 1,
      isFrozen: true,
    });

    const run = await deleteItems([
      { type: "task", id: a.id },
      { type: "task", id: b.id },
    ]);

    expect(run.result.counts).toEqual({ deleted: 2, failed: 0 });
    expect(run.result.deleted.map((item) => item.title)).toEqual(["A", "B"]);
    expect(run.actionId).toEqual(expect.any(String));
    expect(run.undoable).toBe(true);
    expect(taskRow(db, a.id).trashedAt).toBeInstanceOf(Date);
    expect(taskRow(db, a.id).scheduledStart).toBeNull();
    // The flag stays: a restore from the app clears only trashedAt, and the
    // scheduler skips trashed tasks by trashedAt.
    expect(taskRow(db, a.id).isAutoScheduled).toBe(true);
    expect(db.tables.scheduledBlock).toHaveLength(0);
    // Trash, not the archive: the row is still there for Restore.
    expect(taskRow(db, a.id).isArchived).toBe(false);

    const undone = await undoAction(run.actionId!, OWNER_ID);
    expect(undone.status).toBe("undone");
    expect(taskRow(db, a.id).trashedAt).toBeNull();
    expect(taskRow(db, b.id).trashedAt).toBeNull();
    expect(taskRow(db, a.id).isAutoScheduled).toBe(true);
    expect((taskRow(db, a.id).scheduledStart as Date).toISOString()).toBe(
      start.toISOString()
    );
    expect(db.tables.scheduledBlock).toHaveLength(1);
  });

  it("task.list no longer shows a trashed task", async () => {
    const task = await seedTask(db, { title: "Gone" });
    await seedTask(db, { title: "Stays" });
    await deleteItems([{ type: "task", id: task.id }]);
    const list = await runOp<{ tasks: { title: string }[] }>(
      "task.list",
      { status: "all" },
      opts()
    );
    expect(list.result.tasks.map((t) => t.title)).toEqual(["Stays"]);
  });

  it("deletes every kind: project and habit archived, goal archived, event hidden, page trashed", async () => {
    const project = await seedProject();
    const habit = await seedHabit();
    const goal = (
      await runOp<{ goal: { id: string } }>(
        "goal.create",
        { title: "Run 10k" },
        opts()
      )
    ).result.goal;
    const feed = await db.seed("calendarFeed", {
      userId: OWNER_ID,
      type: "LOCAL",
      enabled: true,
    });
    const event = await db.seed("calendarEvent", {
      feedId: feed.id,
      title: "Dentist",
      start: new Date("2026-10-20T09:00:00.000Z"),
      end: new Date("2026-10-20T10:00:00.000Z"),
    });
    const page = await db.seed("page", { title: "Notes" });
    jest.mocked(getPage).mockResolvedValue(page as never);
    jest.mocked(updatePage).mockResolvedValue(page as never);

    const run = await deleteItems([
      { type: "project", id: project.id },
      { type: "habit", id: habit.id },
      { type: "goal", id: goal.id },
      { type: "event", id: event.id },
      { type: "page", id: page.id },
    ]);

    expect(run.result.counts).toEqual({ deleted: 5, failed: 0 });
    expect(row("project", project.id).status).toBe("archived");
    expect(row("habit", habit.id).archivedAt).toBeInstanceOf(Date);
    expect(row("habit", habit.id).isActive).toBe(false);
    expect(row("goal", goal.id).archivedAt).toBeInstanceOf(Date);
    expect(row("calendarEvent", event.id).archivedAt).toBeInstanceOf(Date);
    expect(jest.mocked(updatePage)).toHaveBeenCalledWith(
      expect.objectContaining({ ai: true }),
      page.id,
      { trashed: true }
    );

    expect((await undoAction(run.actionId!, OWNER_ID)).status).toBe("undone");
    expect(row("project", project.id).status).toBe("active");
    expect(row("habit", habit.id).archivedAt).toBeNull();
    expect(row("habit", habit.id).isActive).toBe(true);
    expect(row("goal", goal.id).archivedAt).toBeNull();
    expect(row("calendarEvent", event.id).archivedAt).toBeNull();
    expect(jest.mocked(updatePage)).toHaveBeenLastCalledWith(
      expect.anything(),
      page.id,
      { trashed: false }
    );
  });

  it("cannot delete another person's or another workspace's objects", async () => {
    const foreignTask = await seedTask(db, {
      title: "Theirs",
      userId: OTHER_ID,
      assigneeId: OTHER_ID,
      workspaceId: "ws-2",
    });
    const foreignProject = await seedProject({
      userId: OTHER_ID,
      workspaceId: "ws-2",
    });
    const foreignHabit = await seedHabit({
      userId: OTHER_ID,
      workspaceId: "ws-2",
    });
    const foreignFeed = await db.seed("calendarFeed", {
      userId: OTHER_ID,
      type: "LOCAL",
      enabled: true,
    });
    const foreignEvent = await db.seed("calendarEvent", {
      feedId: foreignFeed.id,
      title: "Private",
      start: new Date("2026-10-20T09:00:00.000Z"),
      end: new Date("2026-10-20T10:00:00.000Z"),
    });
    const foreignGoal = await db.seed("goal", {
      title: "Theirs",
      userId: OTHER_ID,
      workspaceId: "ws-2",
    });
    // The page layer refuses what the caller cannot reach (and Private trees to AI).
    jest.mocked(getPage).mockResolvedValue(null);
    const mine = await seedTask(db, { title: "Mine" });

    const run = await deleteItems([
      { type: "task", id: foreignTask.id },
      { type: "project", id: foreignProject.id },
      { type: "habit", id: foreignHabit.id },
      { type: "event", id: foreignEvent.id },
      { type: "goal", id: foreignGoal.id },
      { type: "page", id: "page-private" },
      { type: "task", id: mine.id },
    ]);

    expect(run.result.counts).toEqual({ deleted: 1, failed: 6 });
    expect(run.result.failed.map((item) => item.code)).toEqual(
      Array(6).fill("NOT_FOUND")
    );
    expect(taskRow(db, foreignTask.id).trashedAt ?? null).toBeNull();
    expect(row("project", foreignProject.id).status).toBe("active");
    expect(row("habit", foreignHabit.id).archivedAt ?? null).toBeNull();
    expect(row("calendarEvent", foreignEvent.id).archivedAt).toBeNull();
    expect(row("goal", foreignGoal.id).archivedAt ?? null).toBeNull();
    expect(jest.mocked(updatePage)).not.toHaveBeenCalled();
    expect(taskRow(db, mine.id).trashedAt).toBeInstanceOf(Date);
  });

  it("does not follow a workspace id the caller is not a member of", async () => {
    const task = await seedTask(db, { workspaceId: "ws-2" });
    // Same user, but the call resolves to ws-1: ws-2's task is out of scope.
    const run = await deleteItems([{ type: "task", id: task.id }]);
    expect(run.result.failed).toHaveLength(1);
    expect(taskRow(db, task.id).trashedAt ?? null).toBeNull();
  });

  it("refuses a synced provider event, a viewer, and tells a repeat apart", async () => {
    const feed = await db.seed("calendarFeed", {
      userId: OWNER_ID,
      type: "GOOGLE",
      enabled: true,
    });
    const synced = await db.seed("calendarEvent", {
      feedId: feed.id,
      title: "Synced",
      start: new Date("2026-10-20T09:00:00.000Z"),
      end: new Date("2026-10-20T10:00:00.000Z"),
    });
    const task = await seedTask(db);

    const first = await deleteItems([
      { type: "event", id: synced.id },
      { type: "task", id: task.id },
      { type: "task", id: task.id },
    ]);
    expect(first.result.failed).toEqual([
      expect.objectContaining({ id: synced.id, code: "UNSUPPORTED" }),
    ]);
    // The duplicate id in one call is deleted once.
    expect(first.result.counts).toEqual({ deleted: 1, failed: 1 });
    expect(row("calendarEvent", synced.id).archivedAt).toBeNull();

    const again = await deleteItems([{ type: "task", id: task.id }]);
    expect(again.result.deleted[0]).toMatchObject({ alreadyDeleted: true });
    expect(again.undoable).toBe(false);

    await expect(
      runOp(
        "item.delete",
        { items: [{ type: "task", id: task.id }] },
        opts(WorkspaceRole.VIEWER)
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("takes at most 100 items", async () => {
    const items = Array.from({ length: 101 }, (_, index) => ({
      type: "task",
      id: `t-${index}`,
    }));
    await expect(runOp("item.delete", { items }, opts())).rejects.toMatchObject(
      { code: "INVALID_INPUT" }
    );
  });

  it("refuses to undo over an edit made after the delete", async () => {
    const task = await seedTask(db);
    const run = await deleteItems([{ type: "task", id: task.id }]);
    await touchRow(db, "task", task.id, { title: "Edited since" });
    const undone = await undoAction(run.actionId!, OWNER_ID);
    expect(undone.status).toBe("undo_conflict");
    expect(taskRow(db, task.id).trashedAt).toBeInstanceOf(Date);
  });
});

describe("batch.run", () => {
  it("updates many tasks as one action and one undo", async () => {
    const tasks = await Promise.all(
      ["A", "B", "C"].map((title) => seedTask(db, { title }))
    );
    const run = await runOp<{
      applied: number;
      failed: number;
      results: { ok: boolean; result: { title: string } }[];
    }>(
      "batch.run",
      {
        operations: tasks.map((task, index) => ({
          op: "task.update",
          input: { taskId: task.id, title: `New ${index}` },
        })),
      },
      opts()
    );
    expect(run.result).toMatchObject({ applied: 3, failed: 0 });
    expect(tasks.map((task) => taskRow(db, task.id).title)).toEqual([
      "New 0",
      "New 1",
      "New 2",
    ]);
    expect(db.tables.agentAction).toHaveLength(1);

    expect((await undoAction(run.actionId!, OWNER_ID)).status).toBe("undone");
    expect(tasks.map((task) => taskRow(db, task.id).title)).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  it("undoes two changes to the same task in the right order", async () => {
    const task = await seedTask(db, { title: "First" });
    const run = await runOp(
      "batch.run",
      {
        operations: [
          { op: "task.update", input: { taskId: task.id, title: "Second" } },
          { op: "task.update", input: { taskId: task.id, title: "Third" } },
          { op: "task.complete", input: { taskId: task.id } },
        ],
      },
      opts()
    );
    expect(taskRow(db, task.id).title).toBe("Third");
    expect(taskRow(db, task.id).status).toBe("completed");
    expect((await undoAction(run.actionId!, OWNER_ID)).status).toBe("undone");
    expect(taskRow(db, task.id).title).toBe("First");
    expect(taskRow(db, task.id).status).toBe("todo");
  });

  it("aborts the whole batch at the first failure and changes nothing", async () => {
    const task = await seedTask(db, { title: "Keep" });
    await expect(
      runOp(
        "batch.run",
        {
          operations: [
            { op: "task.update", input: { taskId: task.id, title: "Changed" } },
            { op: "task.update", input: { taskId: "nope", title: "x" } },
          ],
        },
        opts()
      )
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: expect.stringContaining("Step 2"),
    });
    expect(taskRow(db, task.id).title).toBe("Keep");
    expect(db.tables.agentAction).toHaveLength(0);
  });

  it("with onError skip applies what works and lists the rest", async () => {
    const task = await seedTask(db, { title: "Keep" });
    const run = await runOp<{
      applied: number;
      failed: number;
      results: { ok: boolean; code?: string }[];
    }>(
      "batch.run",
      {
        onError: "skip",
        operations: [
          { op: "task.update", input: { taskId: task.id, title: "Changed" } },
          { op: "task.update", input: { taskId: "nope", title: "x" } },
          { op: "no.such_op", input: {} },
        ],
      },
      opts()
    );
    expect(run.result).toMatchObject({ applied: 1, failed: 2 });
    expect(run.result.results.map((r) => r.code)).toEqual([
      undefined,
      "NOT_FOUND",
      "OP_NOT_FOUND",
    ]);
    expect(taskRow(db, task.id).title).toBe("Changed");
  });

  it("refuses operations that are not reversible writes, are internal, or nest", async () => {
    const task = await seedTask(db);
    for (const op of [
      "task.list",
      "task.restore",
      "batch.run",
      "item.delete",
      "mail.to_task",
    ]) {
      await expect(
        runOp(
          "batch.run",
          { operations: [{ op, input: { taskId: task.id } }] },
          opts()
        )
      ).rejects.toMatchObject({
        code: expect.stringMatching(/INVALID_INPUT|OP_NOT_FOUND/),
      });
    }
  });

  it("stays inside the workspace: another person's task is not found", async () => {
    const foreign = await seedTask(db, {
      userId: OTHER_ID,
      assigneeId: OTHER_ID,
      workspaceId: "ws-2",
      title: "Theirs",
    });
    await expect(
      runOp(
        "batch.run",
        {
          operations: [
            {
              op: "task.update",
              input: { taskId: foreign.id, title: "Mine now" },
            },
          ],
        },
        opts()
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(taskRow(db, foreign.id).title).toBe("Theirs");
  });

  it("takes at most 100 operations", async () => {
    const operations = Array.from({ length: 101 }, () => ({
      op: "task.complete",
      input: { taskId: "x" },
    }));
    await expect(
      runOp("batch.run", { operations }, opts())
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});

describe("project.update", () => {
  it("renames, recolours and archives, and undo writes the old values back", async () => {
    const project = await seedProject({ name: "Old", color: "#111111" });
    const run = await runOp<{ project: { name: string }; changed: boolean }>(
      "project.update",
      { projectId: project.id, name: "New", color: "#222222", archived: true },
      opts()
    );
    expect(run.result.changed).toBe(true);
    expect(row("project", project.id)).toMatchObject({
      name: "New",
      color: "#222222",
      status: "archived",
    });

    expect((await undoAction(run.actionId!, OWNER_ID)).status).toBe("undone");
    expect(row("project", project.id)).toMatchObject({
      name: "Old",
      color: "#111111",
      status: "active",
    });
  });

  it("is a no-op when nothing differs, and refuses an empty change", async () => {
    const project = await seedProject({ name: "Same" });
    const run = await runOp<{ changed: boolean }>(
      "project.update",
      { projectId: project.id, name: "Same" },
      opts()
    );
    expect(run.result.changed).toBe(false);
    expect(run.undoable).toBe(false);
    await expect(
      runOp("project.update", { projectId: project.id }, opts())
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("does not touch another workspace's project", async () => {
    const foreign = await seedProject({
      workspaceId: "ws-2",
      userId: OTHER_ID,
    });
    await expect(
      runOp(
        "project.update",
        { projectId: foreign.id, name: "Hijacked" },
        opts()
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
