import { WorkspaceRole } from "@prisma/client";

import type { GoalView } from "@/lib/goals";

import { OpError, runOp, undoAction } from "..";
import { createFakePrisma } from "./fake-prisma";
import {
  OWNER_ID,
  WORKSPACE_ID,
  access,
  opts,
  seedTask,
  taskRow,
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
  canUseGoals: jest.fn(),
}));
jest.mock("@/lib/task-block-push", () => ({
  schedulePushTaskBlock: jest.fn(),
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
// eslint-disable-next-line @typescript-eslint/no-require-imports
const entitlements = require("@/lib/entitlements");

let db = mockState.db;

beforeEach(() => {
  jest.clearAllMocks();
  mockState.db = createFakePrisma();
  db = mockState.db;
  entitlements.getPlan.mockResolvedValue("PRO");
  entitlements.canUseGoals.mockResolvedValue({
    allowed: true,
    upgradeRequired: false,
    plan: "PRO",
  });
  workspaceAuth.resolveWorkspaceAccess.mockImplementation(
    async ({ requestedWorkspaceId }: { requestedWorkspaceId?: string }) =>
      access(WorkspaceRole.OWNER, requestedWorkspaceId ?? WORKSPACE_ID)
  );
});

type GoalResult = { goal: GoalView };

const goalRow = (id: string) => db.tables.goal.find((row) => row.id === id)!;

async function createGoal(input: Record<string, unknown>) {
  const run = await runOp<GoalResult>("goal.create", input, opts());
  return { run, goal: run.result.goal };
}

async function readGoal(goalId: string) {
  return (
    await runOp<{
      goal: GoalView;
      subgoals: GoalView[];
      tasks: { id: string; goalId: string | null }[];
      checkIns: { id: string; value: number | null; note: string | null }[];
    }>("goal.get", { goalId }, opts())
  ).result;
}

describe("goal ops", () => {
  it("goal.create is Pro: Free is refused with UPGRADE_REQUIRED", async () => {
    entitlements.canUseGoals.mockResolvedValue({
      allowed: false,
      upgradeRequired: true,
      plan: "FREE",
    });
    const refused = runOp("goal.create", { title: "Run 10k" }, opts());
    await expect(refused).rejects.toBeInstanceOf(OpError);
    await expect(refused).rejects.toMatchObject({ code: "UPGRADE_REQUIRED" });
    // The answer names the plan the account is on, the plan it needs, and where to upgrade.
    await expect(refused).rejects.toMatchObject({
      message: expect.stringMatching(/Pro plan.*FREE.*Settings > Plan/),
      details: { plan: "FREE", requiredPlan: "PRO", feature: "goals" },
    });
    expect(db.tables.goal).toHaveLength(0);
  });

  it("creates a goal with no progress yet, and undo archives it", async () => {
    const { run, goal } = await createGoal({
      title: "Run 10k",
      description: "Feel strong again",
      area: "health",
      deadline: "2026-12-31",
    });
    expect(goal).toMatchObject({
      title: "Run 10k",
      description: "Feel strong again",
      area: "health",
      status: "active",
      checkIn: { enabled: true, weekday: 1, hour: 9, lastAt: null },
      progress: { source: "none", ratio: null, percent: null },
    });
    expect(run.undoable).toBe(true);

    expect((await undoAction(run.actionId!, OWNER_ID)).status).toBe("undone");
    expect(goalRow(goal.id).archivedAt).not.toBeNull();
  });

  it("counts linked tasks, directly and through a linked project", async () => {
    const project = await db.seed("project", {
      name: "Fitness",
      userId: OWNER_ID,
      workspaceId: WORKSPACE_ID,
    });
    const { goal } = await createGoal({
      title: "Run 10k",
      projectIds: [project.id as string],
    });
    const direct = await runOp<{ task: { id: string; goalId: string } }>(
      "task.create",
      { title: "Buy shoes", goalId: goal.id },
      opts()
    );
    expect(direct.result.task.goalId).toBe(goal.id);
    await seedTask(db, { title: "Run 5k", projectId: project.id });
    await seedTask(db, { title: "Unrelated" });

    expect((await readGoal(goal.id)).goal.progress).toMatchObject({
      source: "tasks",
      done: 0,
      total: 2,
      ratio: 0,
    });

    await runOp("task.complete", { taskId: direct.result.task.id }, opts());
    const after = await readGoal(goal.id);
    expect(after.goal.progress).toMatchObject({
      source: "tasks",
      done: 1,
      total: 2,
      percent: 50,
    });
    expect(after.tasks.map((task) => task.id)).toContain(direct.result.task.id);
  });

  it("task.update links and unlinks a goal, refuses an unknown one, and undo restores the link", async () => {
    const { goal } = await createGoal({ title: "Read 12 books" });
    const task = await seedTask(db);
    await expect(
      runOp("task.update", { taskId: task.id, goalId: "nope" }, opts())
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });

    const linked = await runOp(
      "task.update",
      { taskId: task.id, goalId: goal.id },
      opts()
    );
    expect(taskRow(db, task.id).goalId).toBe(goal.id);
    await undoAction(linked.actionId!, OWNER_ID);
    expect(taskRow(db, task.id).goalId ?? null).toBeNull();
  });

  it("manual progress and the weekly check-in, with history, and undo", async () => {
    const { goal } = await createGoal({
      title: "Emergency fund",
      area: "money",
      targetValue: 2500,
      currentValue: 1000,
      unit: "CHF",
    });
    expect(goal.progress).toMatchObject({
      source: "manual",
      percent: 40,
      current: 1000,
      target: 2500,
      unit: "CHF",
    });

    const checked = await runOp<GoalResult>(
      "goal.check_in",
      { goalId: goal.id, value: 2500, note: "Bonus came in" },
      opts()
    );
    expect(checked.result.goal.progress.percent).toBe(100);
    expect(checked.result.goal.checkIn.lastAt).not.toBeNull();
    const history = await readGoal(goal.id);
    expect(history.checkIns).toEqual([
      expect.objectContaining({ value: 2500, note: "Bonus came in" }),
    ]);

    expect((await undoAction(checked.actionId!, OWNER_ID)).status).toBe(
      "undone"
    );
    expect(goalRow(goal.id).currentValue).toBe(1000);
    expect(goalRow(goal.id).lastCheckInAt).toBeNull();
    expect(db.tables.goalCheckIn).toHaveLength(0);
  });

  it("refuses an empty check-in", async () => {
    const { goal } = await createGoal({ title: "Learn German" });
    await expect(
      runOp("goal.check_in", { goalId: goal.id }, opts())
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("rolls subgoals up into the parent unless the parent has its own value", async () => {
    const { goal: parent } = await createGoal({ title: "Get fit" });
    await createGoal({ title: "Run", parentId: parent.id, percent: 50 });
    await createGoal({ title: "Lift", parentId: parent.id, percent: 100 });
    const dropped = await createGoal({
      title: "Swim",
      parentId: parent.id,
      percent: 0,
    });
    await runOp(
      "goal.update",
      { goalId: dropped.goal.id, status: "dropped" },
      opts()
    );

    const read = await readGoal(parent.id);
    expect(read.subgoals).toHaveLength(3);
    expect(read.goal.childIds).toHaveLength(3);
    expect(read.goal.progress).toMatchObject({
      source: "subgoals",
      percent: 75,
    });

    await runOp("goal.update", { goalId: parent.id, percent: 10 }, opts());
    expect((await readGoal(parent.id)).goal.progress).toMatchObject({
      source: "manual",
      percent: 10,
    });
  });

  it("keeps subgoals one level deep", async () => {
    const { goal: parent } = await createGoal({ title: "Get fit" });
    const { goal: child } = await createGoal({
      title: "Run",
      parentId: parent.id,
    });
    await expect(
      createGoal({ title: "Run fast", parentId: child.id })
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const { goal: other } = await createGoal({ title: "Save" });
    await expect(
      runOp("goal.update", { goalId: parent.id, parentId: other.id }, opts())
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("achieved reads as complete; undo of the update puts the status back", async () => {
    const { goal } = await createGoal({ title: "Ship v1", percent: 30 });
    const done = await runOp<GoalResult>(
      "goal.update",
      { goalId: goal.id, status: "achieved" },
      opts()
    );
    expect(done.result.goal.status).toBe("achieved");
    expect(done.result.goal.achievedAt).not.toBeNull();
    expect(done.result.goal.progress.percent).toBe(100);
    await undoAction(done.actionId!, OWNER_ID);
    expect(goalRow(goal.id).status).toBe("active");
    expect(goalRow(goal.id).achievedAt).toBeNull();
  });

  it("goal.update sets linked projects as a whole and undo restores the old set", async () => {
    const a = await db.seed("project", {
      name: "A",
      userId: OWNER_ID,
      workspaceId: WORKSPACE_ID,
    });
    const b = await db.seed("project", {
      name: "B",
      userId: OWNER_ID,
      workspaceId: WORKSPACE_ID,
    });
    const { goal } = await createGoal({
      title: "Launch",
      projectIds: [a.id as string],
    });
    const changed = await runOp<GoalResult>(
      "goal.update",
      { goalId: goal.id, projectIds: [b.id as string] },
      opts()
    );
    expect(changed.result.goal.projectIds).toEqual([b.id]);
    await undoAction(changed.actionId!, OWNER_ID);
    expect(db.tables.goalProject.map((link) => link.projectId)).toEqual([a.id]);
    await expect(
      runOp("goal.update", { goalId: goal.id, projectIds: ["missing"] }, opts())
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("goal.list filters by project and leaves archived goals out", async () => {
    const project = await db.seed("project", {
      name: "Home",
      userId: OWNER_ID,
      workspaceId: WORKSPACE_ID,
    });
    const { goal: linked } = await createGoal({
      title: "Renovate",
      projectIds: [project.id as string],
    });
    const { goal: archived } = await createGoal({ title: "Old" });
    await runOp("goal.archive", { goalId: archived.id }, opts());
    await createGoal({ title: "Other" });

    const byProject = await runOp<{ goals: GoalView[] }>(
      "goal.list",
      { projectId: project.id },
      opts()
    );
    expect(byProject.result.goals.map((goal) => goal.id)).toEqual([linked.id]);
    const all = await runOp<{ goals: GoalView[] }>("goal.list", {}, opts());
    expect(all.result.goals.map((goal) => goal.title)).toEqual([
      "Renovate",
      "Other",
    ]);
  });

  it("is scoped to the workspace and needs an editor to write", async () => {
    const { goal } = await createGoal({ title: "Mine" });
    const elsewhere = {
      userId: OWNER_ID,
      workspace: access(WorkspaceRole.OWNER, "ws-other"),
      actor: "agent" as const,
    };
    await expect(
      runOp("goal.get", { goalId: goal.id }, elsewhere)
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      runOp(
        "goal.update",
        { goalId: goal.id, title: "x" },
        opts(WorkspaceRole.VIEWER)
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      runOp("goal.update", { goalId: goal.id, title: "x" }, elsewhere)
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("keeps the inverse-only ops out of reach", async () => {
    await expect(
      runOp("goal.restore", { goalId: "x", fields: {} }, opts())
    ).rejects.toMatchObject({ code: "OP_NOT_FOUND" });
    await expect(
      runOp("goal.unconvert", { goalId: "x", taskIds: [] }, opts())
    ).rejects.toMatchObject({ code: "OP_NOT_FOUND" });
  });
});

describe("goal.convert_from_task", () => {
  it("turns a task and its subtasks into a goal with linked tasks, and undo puts it all back", async () => {
    const project = await db.seed("project", {
      name: "Money",
      userId: OWNER_ID,
      workspaceId: WORKSPACE_ID,
    });
    const task = await seedTask(db, {
      title: "GOAL: Save 2 500 CHF",
      description: "So a broken laptop is not a crisis",
      dueDate: new Date("2026-12-31T00:00:00.000Z"),
      projectId: project.id,
      priorityLevel: "HIGH",
    });
    await db.seed("taskPart", {
      taskId: task.id,
      title: "Open a savings account",
      done: true,
      position: 1,
    });
    await db.seed("taskPart", {
      taskId: task.id,
      title: "Set a monthly transfer",
      position: 2,
    });

    const run = await runOp<{
      goal: GoalView;
      tasks: { id: string; title: string; status: string; goalId: string }[];
      archivedTaskId: string;
    }>("goal.convert_from_task", { taskId: task.id, area: "money" }, opts());
    const { goal, tasks } = run.result;
    expect(goal).toMatchObject({
      title: "Save 2 500 CHF",
      description: "So a broken laptop is not a crisis",
      deadline: "2026-12-31T00:00:00.000Z",
      area: "money",
      projectIds: [project.id],
      sourceTaskId: task.id,
    });
    expect(tasks.map((row) => [row.title, row.status, row.goalId])).toEqual([
      ["Open a savings account", "completed", goal.id],
      ["Set a monthly transfer", "todo", goal.id],
    ]);
    expect(taskRow(db, task.id).isArchived).toBe(true);
    expect((await readGoal(goal.id)).goal.progress).toMatchObject({
      source: "tasks",
      done: 1,
      total: 2,
    });

    expect((await undoAction(run.actionId!, OWNER_ID)).status).toBe("undone");
    expect(taskRow(db, task.id).isArchived).toBe(false);
    expect(goalRow(goal.id).archivedAt).not.toBeNull();
    for (const created of tasks) {
      expect(taskRow(db, created.id).isArchived).toBe(true);
    }
  });

  it("refuses undo when a new task was changed afterwards", async () => {
    const task = await seedTask(db, { title: "Learn to swim" });
    await db.seed("taskPart", { taskId: task.id, title: "Book a lesson" });
    const run = await runOp<{ tasks: { id: string }[] }>(
      "goal.convert_from_task",
      { taskId: task.id },
      opts()
    );
    await runOp("task.complete", { taskId: run.result.tasks[0].id }, opts());
    const undone = await undoAction(run.actionId!, OWNER_ID);
    expect(undone.status).toBe("undo_conflict");
    expect(taskRow(db, task.id).isArchived).toBe(true);
  });

  it("is Pro", async () => {
    entitlements.canUseGoals.mockResolvedValue({
      allowed: false,
      upgradeRequired: true,
      plan: "FREE",
    });
    const task = await seedTask(db);
    await expect(
      runOp("goal.convert_from_task", { taskId: task.id }, opts())
    ).rejects.toMatchObject({ code: "UPGRADE_REQUIRED" });
    expect(taskRow(db, task.id).isArchived).toBe(false);
  });
});
