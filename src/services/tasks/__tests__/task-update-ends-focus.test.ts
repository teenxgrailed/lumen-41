/**
 * The shared completion service (MCP needt_complete_task / needt_update_task):
 * marking a task done hands it to the focus service, ticking it back does not,
 * and `fullTime` is a writable field.
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
    },
    taskListMapping: { findFirst: jest.fn().mockResolvedValue(null) },
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

const open = {
  id: "t1",
  title: "Report",
  status: "todo",
  isArchived: false,
  isRecurring: false,
  recurrenceRule: null,
  workspaceId: "w1",
  assigneeId: null,
  project: null,
  tags: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  taskFindFirst.mockResolvedValue(open);
  taskUpdate.mockImplementation(async ({ data }) => ({ ...open, ...data }));
});

describe("completing a task through the shared service", () => {
  it("hands the done task to the focus service, before the scheduler run", async () => {
    const order: string[] = [];
    endFocus.mockImplementation(async () => order.push("focus"));
    schedule.mockImplementation(async () => order.push("schedule"));
    await updateTaskFields({
      userId: "u1",
      workspace,
      taskId: "t1",
      patch: { status: "completed" as never },
    });
    expect(endFocus).toHaveBeenCalledWith({
      userId: "u1",
      task: expect.objectContaining({ id: "t1", status: "completed" }),
    });
    expect(order).toEqual(["focus", "schedule"]);
  });

  it("does not end a focus when the task is reopened or merely edited", async () => {
    await updateTaskFields({
      userId: "u1",
      workspace,
      taskId: "t1",
      patch: { title: "Report v2" },
    });
    taskFindFirst.mockResolvedValue({ ...open, status: "completed" });
    await updateTaskFields({
      userId: "u1",
      workspace,
      taskId: "t1",
      patch: { status: "todo" as never },
    });
    expect(endFocus).not.toHaveBeenCalled();
  });

  it("writes fullTime, including null for auto", async () => {
    await updateTaskFields({
      userId: "u1",
      workspace,
      taskId: "t1",
      patch: { fullTime: true },
    });
    expect(taskUpdate.mock.calls[0][0].data).toMatchObject({ fullTime: true });
    await updateTaskFields({
      userId: "u1",
      workspace,
      taskId: "t1",
      patch: { fullTime: null },
    });
    expect(taskUpdate.mock.calls[1][0].data).toMatchObject({ fullTime: null });
  });
});
