import { WorkspaceRole } from "@prisma/client";

import type { ChartView } from "@/lib/charts";

import { OpError, runOp, undoAction } from "..";
import { createFakePrisma } from "./fake-prisma";
import { OWNER_ID, WORKSPACE_ID, access, opts, seedTask } from "./harness";

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

const NOW = new Date("2026-11-12T12:00:00.000Z");
let db = mockState.db;

beforeAll(() => {
  jest.useFakeTimers({
    now: NOW,
    doNotFake: [
      "nextTick",
      "setImmediate",
      "setTimeout",
      "setInterval",
      "clearTimeout",
      "clearInterval",
      "queueMicrotask",
    ],
  });
});
afterAll(() => jest.useRealTimers());

beforeEach(() => {
  jest.clearAllMocks();
  mockState.db = createFakePrisma();
  db = mockState.db;
  workspaceAuth.resolveWorkspaceAccess.mockImplementation(
    async ({ requestedWorkspaceId }: { requestedWorkspaceId?: string }) =>
      access(WorkspaceRole.OWNER, requestedWorkspaceId ?? WORKSPACE_ID)
  );
});

type One = { chart: ChartView };

async function seedProject(name = "Launch") {
  return (await db.seed("project", {
    name,
    userId: OWNER_ID,
    workspaceId: WORKSPACE_ID,
  })) as { id: string };
}

const create = (input: Record<string, unknown>) =>
  runOp<One>("chart.create", input, opts());

describe("chart ops", () => {
  it("adds a progress chart to a project that counts only its tasks", async () => {
    const project = await seedProject();
    const other = await seedProject("Other");
    await seedTask(db, {
      projectId: project.id,
      createdAt: new Date("2026-11-01T09:00:00Z"),
      status: "completed",
      completedAt: new Date("2026-11-10T09:00:00Z"),
    });
    await seedTask(db, {
      projectId: project.id,
      createdAt: new Date("2026-11-05T09:00:00Z"),
    });
    await seedTask(db, { projectId: other.id });

    const run = await create({
      metric: "task_progress",
      projectId: project.id,
      rangeDays: 14,
    });
    const chart = run.result.chart;
    expect(chart).toMatchObject({
      title: "Progress",
      metric: "task_progress",
      style: "line",
      rangeDays: 14,
      projectId: project.id,
    });
    expect(chart.series?.points).toHaveLength(14);
    expect(chart.series?.points.at(-1)).toEqual({
      day: "2026-11-12",
      value: 1,
      total: 2,
    });
    expect(chart.series?.points.find((p) => p.day === "2026-11-09")).toEqual({
      day: "2026-11-09",
      value: 0,
      total: 2,
    });
    expect(chart.series?.summary).toMatchObject({
      done: 1,
      total: 2,
      percent: 50,
    });
    expect(run.actionId).toBeTruthy();
  });

  it("a Home chart counts the whole workspace; habit streak per habit", async () => {
    const habit = (await db.seed("habit", {
      title: "German",
      userId: OWNER_ID,
      workspaceId: WORKSPACE_ID,
      archivedAt: null,
    })) as { id: string };
    for (const day of ["2026-11-10", "2026-11-11", "2026-11-12"]) {
      await db.seed("habitCompletion", {
        habitId: habit.id,
        date: new Date(`${day}T00:00:00Z`),
      });
    }
    const run = await create({ metric: "habit_streak", habitId: habit.id });
    expect(run.result.chart).toMatchObject({
      title: "German",
      style: "bar",
      projectId: null,
      habitId: habit.id,
    });
    expect(run.result.chart.series?.summary).toMatchObject({
      current: 3,
      best: 3,
    });
    const home = await runOp<{ charts: ChartView[] }>(
      "chart.list",
      { home: true },
      opts()
    );
    expect(home.result.charts.map((c) => c.id)).toEqual([run.result.chart.id]);
  });

  it("time spent sums finished time entries of the project's tasks", async () => {
    const project = await seedProject();
    const task = await seedTask(db, { projectId: project.id });
    await db.seed("timeEntry", {
      taskId: task.id,
      startedAt: new Date("2026-11-12T08:00:00Z"),
      endedAt: new Date("2026-11-12T09:30:00Z"),
    });
    await db.seed("timeEntry", {
      taskId: task.id,
      startedAt: new Date("2026-11-12T10:00:00Z"),
      endedAt: null,
    });
    const run = await create({
      metric: "time_spent",
      projectId: project.id,
      rangeDays: 7,
    });
    expect(run.result.chart.series?.points.at(-1)?.value).toBe(90);
    expect(run.result.chart.series?.summary).toMatchObject({
      totalMinutes: 90,
    });
  });

  it("refuses an unknown project, a foreign habit and a habit on another metric", async () => {
    await expect(
      create({ metric: "task_progress", projectId: "nope" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      create({ metric: "habit_streak", habitId: "nope" })
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      create({ metric: "time_spent", habitId: "h" })
    ).rejects.toBeInstanceOf(OpError);
    await expect(
      create({ metric: "time_spent", rangeDays: 12 })
    ).rejects.toBeInstanceOf(OpError);
  });

  it("updates, and undo writes the previous values back", async () => {
    const { result } = await create({ metric: "time_spent" });
    const updated = await runOp<One>(
      "chart.update",
      {
        chartId: result.chart.id,
        title: "Deep work",
        style: "line",
        rangeDays: 90,
      },
      opts()
    );
    expect(updated.result.chart).toMatchObject({
      title: "Deep work",
      style: "line",
      rangeDays: 90,
    });
    expect((await undoAction(updated.actionId!, OWNER_ID)).status).toBe(
      "undone"
    );
    const row = db.tables.chart[0];
    expect(row).toMatchObject({
      title: "Time spent",
      style: "bar",
      rangeDays: 30,
    });
  });

  it("create's undo removes the block", async () => {
    const { actionId } = await create({ metric: "task_progress" });
    expect((await undoAction(actionId!, OWNER_ID)).status).toBe("undone");
    expect(db.tables.chart[0].archivedAt).toBeInstanceOf(Date);
  });

  it("delete hides the block and undo brings it back", async () => {
    const { result } = await create({ metric: "task_progress" });
    const removed = await runOp(
      "chart.delete",
      { chartId: result.chart.id },
      opts()
    );
    const list = () =>
      runOp<{ charts: ChartView[] }>("chart.list", {}, opts()).then(
        (r) => r.result.charts.length
      );
    expect(await list()).toBe(0);
    await undoAction(removed.actionId!, OWNER_ID);
    expect(await list()).toBe(1);
  });

  it("does not read another workspace's chart", async () => {
    const { result } = await create({ metric: "task_progress" });
    db.tables.chart[0].workspaceId = "ws-2";
    await expect(
      runOp("chart.get", { chartId: result.chart.id }, opts())
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
