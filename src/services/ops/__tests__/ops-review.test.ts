import { scheduleAllTasksForUser } from "@/services/scheduling/TaskSchedulingService";
import { WorkspaceRole } from "@prisma/client";

import { logger } from "@/lib/logger";

import { runOp, startAgentRun, undoAction } from "..";
import { pruneAgentActionLog } from "../retention";
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

type Delegate = Record<string, (args: unknown) => Promise<unknown>>;
let db = mockState.db;
const model = (name: string) => db.client[name] as Delegate;

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

async function newRun() {
  return startAgentRun({
    userId: OWNER_ID,
    workspaceId: WORKSPACE_ID,
    actor: "agent",
    source: "chat",
  });
}

/** Simulates the scheduler moving one task and recreating its block. */
function schedulerMoves(taskId: string) {
  jest.mocked(scheduleAllTasksForUser).mockImplementation(async () => {
    await model("task").update({
      where: { id: taskId },
      data: {
        scheduledStart: new Date("2026-10-06T13:00:00.000Z"),
        scheduledEnd: new Date("2026-10-06T14:00:00.000Z"),
      },
    });
    await model("scheduledBlock").deleteMany({ where: { taskId } });
    await model("scheduledBlock").create({
      data: {
        taskId,
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
}

describe("undo version chain", () => {
  it("does not let a later undo mask an edit that landed between two actions", async () => {
    const run = await newRun();
    const task = await seedTask(db);
    const a = await runOp(
      "task.update",
      { taskId: task.id, title: "A" },
      { ...opts(), runId: run.id }
    );
    await touchRow(db, "task", task.id, { title: "Person" });
    const b = await runOp(
      "task.update",
      { taskId: task.id, title: "B" },
      { ...opts(), runId: run.id }
    );

    expect((await undoAction(b.actionId!, OWNER_ID)).status).toBe("undone");
    expect(taskRow(db, task.id).title).toBe("Person");

    const result = await undoAction(a.actionId!, OWNER_ID);
    expect(result).toMatchObject({
      status: "undo_conflict",
      conflicts: [expect.objectContaining({ id: task.id, reason: "changed" })],
    });
    expect(taskRow(db, task.id).title).toBe("Person");
  });

  it("only follows the chain inside one run", async () => {
    const task = await seedTask(db);
    const a = await runOp(
      "task.update",
      { taskId: task.id, title: "A" },
      opts()
    );
    const b = await runOp(
      "task.update",
      { taskId: task.id, title: "B" },
      opts()
    );
    await undoAction(b.actionId!, OWNER_ID);
    expect((await undoAction(a.actionId!, OWNER_ID)).status).toBe(
      "undo_conflict"
    );
  });

  it("records the version each op found next to the one it left", async () => {
    const task = await seedTask(db);
    const updated = await runOp(
      "task.update",
      { taskId: task.id, title: "A" },
      opts()
    );
    expect(action(updated.actionId).targetVersions).toEqual([
      {
        model: "task",
        id: task.id,
        beforeUpdatedAt: task.updatedAt.toISOString(),
        updatedAt: (taskRow(db, task.id).updatedAt as Date).toISOString(),
      },
    ]);
  });
});

describe("concurrent undo", () => {
  it("applies the inverse once when the same action is undone twice at the same time", async () => {
    const task = await seedTask(db);
    const updated = await runOp(
      "task.update",
      { taskId: task.id, title: "Agent" },
      opts()
    );

    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const delegate = model("task");
    const findFirst = delegate.findFirst;
    let gated = false;
    delegate.findFirst = async (args) => {
      if (!gated) {
        gated = true;
        await gate;
      }
      return findFirst(args);
    };
    const update = delegate.update;
    let restores = 0;
    delegate.update = async (args) => {
      restores += 1;
      return update(args);
    };

    // Both read the action while it is still "applied"; whichever claims
    // first stalls inside its inverse until the gate opens.
    const both = Promise.all([
      undoAction(updated.actionId!, OWNER_ID),
      undoAction(updated.actionId!, OWNER_ID),
    ]);
    for (let tick = 0; tick < 20; tick += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    release();
    const statuses = (await both).map((result) => result.status).sort();

    expect(statuses).toEqual(["already_undone", "undone"]);
    expect(restores).toBe(1);
    expect(taskRow(db, task.id).title).toBe("Write report");
    expect(action(updated.actionId).status).toBe("undone");
  });
});

describe("schedule.auto", () => {
  it("returns a structured 500 and logs the snapshot when the log row cannot be written", async () => {
    const task = await seedTask(db, {
      scheduledStart: new Date("2026-10-05T09:00:00.000Z"),
      scheduledEnd: new Date("2026-10-05T10:00:00.000Z"),
    });
    schedulerMoves(task.id);
    model("agentAction").create = jest
      .fn()
      .mockRejectedValue(new Error("db down"));

    await expect(runOp("schedule.auto", {}, opts())).rejects.toMatchObject({
      code: "APPLIED_NOT_UNDOABLE",
      status: 500,
    });
    expect(logger.error).toHaveBeenCalledWith(
      "Op applied but its action log row could not be written",
      expect.objectContaining({
        op: "schedule.auto",
        before: expect.stringContaining(task.id),
      }),
      expect.any(String)
    );
  });

  it("versions the blocks it wrote, so a block-only edit afterwards is a conflict", async () => {
    const task = await seedTask(db);
    schedulerMoves(task.id);
    const run = await runOp("schedule.auto", {}, opts());
    const block = db.tables.scheduledBlock[0];
    await model("scheduledBlock").update({
      where: { id: block.id },
      data: { end: new Date("2026-10-06T15:00:00.000Z") },
    });

    const result = await undoAction(run.actionId!, OWNER_ID);
    expect(result).toMatchObject({
      status: "undo_conflict",
      conflicts: [expect.objectContaining({ model: "scheduledBlock" })],
    });
  });

  it("keeps `before` small: ids and times, not the snapshot the inverse holds", async () => {
    const task = await seedTask(db);
    schedulerMoves(task.id);
    const run = await runOp("schedule.auto", {}, opts());
    expect(action(run.actionId).before).toEqual({
      tasks: [{ id: task.id, scheduledStart: null, scheduledEnd: null }],
    });
  });
});

describe("retention", () => {
  it("deletes actions 30 days past their undo window and runs left empty", async () => {
    const now = new Date("2026-12-31T00:00:00.000Z");
    const oldRun = await newRun();
    const keptRun = await newRun();
    db.tables.agentRun.forEach((run) => {
      run.createdAt = new Date("2026-10-01T00:00:00.000Z");
    });
    await db.seed("agentAction", {
      runId: oldRun.id,
      userId: OWNER_ID,
      workspaceId: WORKSPACE_ID,
      op: "task.update",
      undoableUntil: new Date("2026-11-20T00:00:00.000Z"),
    });
    const recent = await db.seed("agentAction", {
      runId: keptRun.id,
      userId: OWNER_ID,
      workspaceId: WORKSPACE_ID,
      op: "task.update",
      undoableUntil: new Date("2026-12-10T00:00:00.000Z"),
    });
    const noWindow = await db.seed("agentAction", {
      userId: OWNER_ID,
      workspaceId: WORKSPACE_ID,
      op: "habit.log",
      undoableUntil: null,
    });
    noWindow.createdAt = new Date("2026-11-01T00:00:00.000Z");
    db.tables.agentAction.find((row) => row.id === noWindow.id)!.createdAt =
      noWindow.createdAt;

    const result = await pruneAgentActionLog(now);
    expect(result).toEqual({ actions: 2, runs: 1 });
    expect(db.tables.agentAction.map((row) => row.id)).toEqual([recent.id]);
    expect(db.tables.agentRun.map((row) => row.id)).toEqual([keptRun.id]);
  });
});

describe("parity with the UI routes", () => {
  it("task.create adds the plan's default reminders and sanitizes notes", async () => {
    const created = await runOp<{ task: { id: string } }>(
      "task.create",
      { title: "Plan", notes: "  just text  " },
      opts()
    );
    expect(taskRow(db, created.result.task.id).description).toBe("just text");
    expect(db.tables.taskReminder).toEqual([
      expect.objectContaining({
        taskId: created.result.task.id,
        userId: OWNER_ID,
        kind: "BEFORE_START",
        offsetMinutes: 10,
      }),
    ]);
    expect(taskRow(db, created.result.task.id)).toMatchObject({
      isAutoScheduled: true,
      autoScheduled: false,
    });
  });

  it.each([
    ["task.update", { title: "x" }],
    ["task.complete", {}],
    ["task.move_to_day", { date: "2026-10-20" }],
  ])("%s refuses a task in an archived project with 409", async (op, extra) => {
    const project = await db.seed("project", {
      workspaceId: WORKSPACE_ID,
      name: "Old",
      status: "archived",
    });
    const task = await seedTask(db, { projectId: project.id });
    await expect(
      runOp(op, { taskId: task.id, ...extra }, opts())
    ).rejects.toMatchObject({ code: "PROJECT_ARCHIVED", status: 409 });
    expect(db.tables.agentAction).toHaveLength(0);
  });

  it("task.archive removes only the scheduling user's blocks, and undo puts them back", async () => {
    const task = await seedTask(db);
    for (const userId of [OWNER_ID, OTHER_ID]) {
      await db.seed("scheduledBlock", {
        taskId: task.id,
        userId,
        start: new Date("2026-10-05T09:00:00.000Z"),
        end: new Date("2026-10-05T10:00:00.000Z"),
        chunkIndex: userId === OWNER_ID ? 0 : 1,
        chunkCount: 2,
        isFrozen: false,
      });
    }
    const archived = await runOp("task.archive", { taskId: task.id }, opts());
    expect(db.tables.scheduledBlock.map((block) => block.userId)).toEqual([
      OTHER_ID,
    ]);
    await undoAction(archived.actionId!, OWNER_ID);
    expect(
      db.tables.scheduledBlock.map((block) => block.userId).sort()
    ).toEqual([OWNER_ID, OTHER_ID].sort());
  });

  it("habit.log rejects impossible and future days", async () => {
    const habit = await db.seed("habit", {
      userId: OWNER_ID,
      workspaceId: WORKSPACE_ID,
      title: "Run",
      archivedAt: null,
      isActive: true,
    });
    await expect(
      runOp("habit.log", { habitId: habit.id, date: "2026-02-30" }, opts())
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      runOp("habit.log", { habitId: habit.id, date: "2999-01-01" }, opts())
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(db.tables.habitCompletion).toHaveLength(0);
  });
});
