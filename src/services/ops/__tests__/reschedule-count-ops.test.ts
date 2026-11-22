import { WorkspaceRole } from "@prisma/client";

import { runOp, undoAction } from "..";
import { createFakePrisma } from "./fake-prisma";
import { OWNER_ID, access, opts, seedTask, taskRow } from "./harness";

/**
 * Always easy start counts ANY move to a LATER day, by the person or an agent:
 * `task.update` and `task.move_to_day` raise `rescheduleCount`; an earlier day,
 * the same day with a new time, and a task with no day before do not. Undo
 * puts the count back.
 */
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

// 26 Oct 2026 is a Monday; Berlin is CET (UTC+1) from 25 Oct.
const placed = (fields: Record<string, unknown> = {}) =>
  seedTask(db, {
    estimatedMinutes: 60,
    duration: 60,
    dueDate: new Date("2026-10-25T23:00:00.000Z"), // 26.10 Berlin
    scheduledStart: new Date("2026-10-26T08:00:00.000Z"),
    scheduledEnd: new Date("2026-10-26T09:00:00.000Z"),
    ...fields,
  });

describe("task.update", () => {
  it("a later due day counts once, and undo puts the count back", async () => {
    const task = await placed({ scheduledStart: null, scheduledEnd: null });
    const result = await runOp(
      "task.update",
      { taskId: task.id, dueDate: "2026-10-28T00:00:00.000Z" },
      opts()
    );
    expect(taskRow(db, task.id).rescheduleCount).toBe(1);

    await undoAction(result.actionId!, OWNER_ID);
    expect(taskRow(db, task.id).rescheduleCount).toBe(0);
  });

  it("an earlier due day does not count", async () => {
    const task = await placed({ scheduledStart: null, scheduledEnd: null });
    await runOp(
      "task.update",
      { taskId: task.id, dueDate: "2026-10-24T00:00:00.000Z" },
      opts()
    );
    expect(taskRow(db, task.id).rescheduleCount).toBe(0);
  });

  it("placing by hand on a later day counts; a new time on the same day does not", async () => {
    const task = await placed();
    await runOp(
      "task.update",
      { taskId: task.id, start: "2026-10-26T15:00" },
      opts()
    );
    expect(taskRow(db, task.id).rescheduleCount).toBe(0);

    await runOp(
      "task.update",
      { taskId: task.id, start: "2026-10-29T10:00" },
      opts()
    );
    expect(taskRow(db, task.id).rescheduleCount).toBe(1);
  });

  it("a task that had no day before is not postponed by getting one", async () => {
    const task = await placed({
      dueDate: null,
      scheduledStart: null,
      scheduledEnd: null,
    });
    await runOp(
      "task.update",
      { taskId: task.id, dueDate: "2026-10-28T00:00:00.000Z" },
      opts()
    );
    expect(taskRow(db, task.id).rescheduleCount).toBe(0);
  });

  it("an edit that moves nothing leaves the count alone", async () => {
    const task = await placed();
    await runOp("task.update", { taskId: task.id, title: "Renamed" }, opts());
    expect(taskRow(db, task.id).rescheduleCount).toBe(0);
  });
});

describe("the task view", () => {
  it("returns the entry next to the title, null when there is none", async () => {
    const task = await placed({ entry: "Open the file" });
    const result = await runOp<{
      task: { title: string; entry: string | null };
    }>("task.update", { taskId: task.id, title: "Renamed" }, opts());
    expect(result.result.task).toMatchObject({
      title: "Renamed",
      entry: "Open the file",
    });
    const bare = await placed();
    const again = await runOp<{ task: { entry: string | null } }>(
      "task.update",
      { taskId: bare.id, title: "Other" },
      opts()
    );
    expect(again.result.task.entry).toBeNull();
  });
});

describe("task.move_to_day", () => {
  it("a later day counts and an earlier day does not", async () => {
    const task = await placed();
    const later = await runOp(
      "task.move_to_day",
      { taskId: task.id, date: "2026-10-28" },
      opts()
    );
    expect(taskRow(db, task.id).rescheduleCount).toBe(1);

    await runOp(
      "task.move_to_day",
      { taskId: task.id, date: "2026-10-27" },
      opts()
    );
    expect(taskRow(db, task.id).rescheduleCount).toBe(1);
    expect(later.undoable).toBe(true);
  });

  it("an unplaced task given a later due day counts", async () => {
    const task = await placed({ scheduledStart: null, scheduledEnd: null });
    const result = await runOp(
      "task.move_to_day",
      { taskId: task.id, date: "2026-10-30" },
      opts()
    );
    expect(taskRow(db, task.id).rescheduleCount).toBe(1);
    await undoAction(result.actionId!, OWNER_ID);
    expect(taskRow(db, task.id).rescheduleCount).toBe(0);
  });
});
