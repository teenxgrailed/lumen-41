/**
 * A second tick on a repeating task that was already completed today: the
 * shared service (MCP needt_complete_task / needt_update_task) leaves the task
 * alone and says so, instead of answering as if it had been completed.
 */
import type { WorkspaceAccess } from "@/lib/auth/workspace-auth";

import { updateTaskFields } from "../task-update";

const taskFindFirst = jest.fn();
const taskUpdate = jest.fn();
const endFocus = jest.fn();
const schedule = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    task: {
      findFirst: (...a: unknown[]) => taskFindFirst(...a),
      update: (...a: unknown[]) => taskUpdate(...a),
      upsert: jest.fn(),
    },
    taskListMapping: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(),
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/auth/workspace-auth", () => ({
  workspaceDataScopeWhere: () => ({ userId: "u1" }),
}));
jest.mock("@/lib/task-block-push", () => ({
  schedulePushTaskBlock: jest.fn(),
}));
jest.mock("@/lib/task-sync/task-change-tracker", () => ({
  ChangeType: {},
  TaskChangeTracker: jest.fn(),
}));
jest.mock("@/services/connectors/webhooks", () => ({
  sendConnectorWebhook: jest.fn(),
}));
jest.mock("@/services/pages/page-service", () => ({ getPage: jest.fn() }));
jest.mock("@/services/scheduling/TaskSchedulingService", () => ({
  scheduleAllTasksForUser: (...a: unknown[]) => schedule(...a),
}));
jest.mock("@/services/tasks/dependencies", () => ({
  findTaskProjectMoveConflict: jest.fn(),
}));
jest.mock("@/services/tasks/subtasks", () => ({ checkBlocker: jest.fn() }));
jest.mock("@/services/tasks/task-fields", () => ({
  checkLabelsAndHours: jest.fn().mockResolvedValue({ ok: true }),
  parseRepeatRule: jest.fn(),
}));
jest.mock("@/services/time-tracking/timeEntries", () => ({
  recomputeTaskActuals: jest.fn(),
}));
jest.mock("@/services/focus/completion-ends-focus", () => ({
  endFocusForCompletedTask: (...a: unknown[]) => endFocus(...a),
}));

const workspace = {
  workspaceId: "w1",
  dataScope: { mode: "personal" },
} as unknown as WorkspaceAccess;

// "Review budget", every month on the 1st. Ticked on 30 Oct, so the series
// already sits on 1 Nov and the 30 Oct occurrence is its own completed row.
const series = {
  id: "t1",
  title: "Review budget",
  status: "todo",
  isArchived: false,
  isRecurring: true,
  recurrenceRule: "FREQ=MONTHLY;BYMONTHDAY=1",
  dueDate: new Date("2026-11-01T00:00:00.000Z"),
  startDate: null,
  scheduledStart: null,
  scheduledEnd: null,
  lastCompletedDate: new Date("2026-10-30T18:23:00.000Z"),
  workspaceId: "w1",
  assigneeId: null,
  project: null,
  tags: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
  jest.setSystemTime(new Date("2026-10-30T20:00:00.000Z"));
  taskFindFirst.mockResolvedValue(series);
  taskUpdate.mockImplementation(async ({ data }) => ({ ...series, ...data }));
});

afterEach(() => jest.useRealTimers());

describe("ticking a repeating task a second time on the same day", () => {
  it("tells the caller it was already done and when it is next due", async () => {
    const result = await updateTaskFields({
      userId: "u1",
      workspace,
      taskId: "t1",
      patch: { status: "completed" as never },
    });
    expect(result).toMatchObject({
      ok: true,
      changed: false,
      recurringAlreadyDone: { nextDueDate: "2026-11-01" },
    });
  });

  it("writes nothing and does not burn the next occurrence", async () => {
    await updateTaskFields({
      userId: "u1",
      workspace,
      taskId: "t1",
      patch: { status: "completed" as never },
    });
    expect(taskUpdate).not.toHaveBeenCalled();
    expect(endFocus).not.toHaveBeenCalled();
  });

  it("still saves the other fields of the same request, and still says it", async () => {
    const result = await updateTaskFields({
      userId: "u1",
      workspace,
      taskId: "t1",
      patch: { status: "completed" as never, title: "Review budget v2" },
    });
    expect(taskUpdate).toHaveBeenCalledTimes(1);
    expect(taskUpdate.mock.calls[0][0].data).toMatchObject({
      title: "Review budget v2",
    });
    expect(taskUpdate.mock.calls[0][0].data).not.toHaveProperty("status");
    expect(result).toMatchObject({
      ok: true,
      changed: true,
      recurringAlreadyDone: { nextDueDate: "2026-11-01" },
    });
  });
});
