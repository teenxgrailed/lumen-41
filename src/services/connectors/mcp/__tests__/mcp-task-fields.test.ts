import { NextRequest } from "next/server";

import { POST } from "@/app/api/mcp/route";
import {
  type BearerAuth,
  authenticateBearer,
} from "@/services/connectors/bearer";
import { WorkspaceKind, WorkspaceRole } from "@prisma/client";

import { resolveWorkspaceAccess } from "@/lib/auth/workspace-auth";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/realtime/publish", () => ({
  publishRealtimeEvent: jest.fn(),
  publishRealtimeEventSafe: jest.fn(),
}));
jest.mock("@/services/connectors/bearer", () => ({
  ...jest.requireActual("@/services/connectors/bearer"),
  authenticateBearer: jest.fn(),
}));
jest.mock("@/lib/auth/workspace-auth", () => ({
  ...jest.requireActual("@/lib/auth/workspace-auth"),
  resolveWorkspaceAccess: jest.fn(),
}));
jest.mock("@/lib/auth/email-verification-access", () => ({
  getEmailVerificationStatus: jest
    .fn()
    .mockResolvedValue({ required: false, verified: true }),
}));
jest.mock("@/lib/auth/moodboard-auth", () => ({
  ...jest.requireActual("@/lib/auth/moodboard-auth"),
  resolveMoodboardAccess: jest.fn(),
}));
jest.mock("@/services/connectors/webhooks", () => ({
  sendConnectorWebhook: jest.fn(),
}));
jest.mock("@/services/scheduling/TaskSchedulingService", () => ({
  scheduleAllTasksForUser: jest.fn(),
  scheduleAllTasksForUserDetailed: jest.fn(),
}));
jest.mock("@/services/time-tracking/timeEntries", () => ({
  recomputeTaskActuals: jest.fn(),
}));
jest.mock("@/services/tasks/dependencies", () => ({
  findTaskProjectMoveConflict: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/lib/flexible-hours-guard-server", () => ({
  isPlacementBlocked: jest.fn().mockResolvedValue(false),
}));
jest.mock("@/lib/task-block-push", () => ({
  schedulePushTaskBlock: jest.fn(),
}));
jest.mock("@/services/pages/page-service", () => ({
  ...jest.requireActual("@/services/pages/page-service"),
  createPage: jest.fn(),
  appendPageBlocks: jest.fn(),
}));
jest.mock("@/services/pages/page-write-path", () => ({
  ...jest.requireActual("@/services/pages/page-write-path"),
  writePageBlocks: jest.fn(),
}));
jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/security/rate-limit", () => ({
  enforceRateLimits: jest.fn().mockResolvedValue(null),
  ipRule: jest.fn(),
  accountRule: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    task: { findFirst: jest.fn(), update: jest.fn() },
    tag: { count: jest.fn() },
    workSchedule: { findFirst: jest.fn() },
    project: { findFirst: jest.fn() },
    taskListMapping: { findFirst: jest.fn() },
    calendarFeed: { findFirst: jest.fn(), create: jest.fn() },
    calendarEvent: { create: jest.fn() },
    userSettings: { findUnique: jest.fn() },
    habit: { findFirst: jest.fn() },
    habitCompletion: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    moodboard: { findMany: jest.fn(), findFirst: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const shared = {
  enabled: true,
  workspaceId: "workspace-1",
  workspaceKind: WorkspaceKind.SHARED,
  role: WorkspaceRole.EDITOR,
  dataScope: { mode: "workspace" as const, workspaceId: "workspace-1" },
};

const token: BearerAuth = {
  userId: "user-1",
  kind: "personal",
  scopes: ["needt.read", "needt.write"],
};

async function call(name: string, args: Record<string, unknown>) {
  const response = await POST(
    new NextRequest("http://localhost/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer good-token",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    })
  );
  const body = await response.json();
  return {
    status: response.status,
    isError: body.result?.isError === true,
    payload: body.result ? JSON.parse(body.result.content[0].text) : body,
  };
}

const openTask = {
  id: "task-1",
  title: "Write brief",
  status: "todo",
  isArchived: false,
  isRecurring: false,
  recurrenceRule: null,
  projectId: null,
  workspaceId: "workspace-1",
  assigneeId: "user-1",
  tags: [],
  project: null,
};

describe("MCP task fields: priority none, repeat, labels, hours", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(authenticateBearer).mockResolvedValue(token);
    jest.mocked(resolveWorkspaceAccess).mockResolvedValue(shared);
    jest.mocked(prisma.task.findFirst).mockResolvedValue(openTask as never);
    jest.mocked(prisma.task.update).mockImplementation((async ({
      data,
    }: {
      data: object;
    }) => ({
      ...openTask,
      ...data,
    })) as never);
  });

  const written = () => jest.mocked(prisma.task.update).mock.calls[0][0].data;

  it("NONE writes the legacy priority column and leaves the level alone", async () => {
    const result = await call("needt_update_task", {
      id: "task-1",
      priority: "NONE",
    });
    expect(result.isError).toBe(false);
    expect(written()).toMatchObject({ priority: "none" });
    expect(written()).not.toHaveProperty("priorityLevel");
  });

  describe("deadline", () => {
    const old = new Date("2026-10-24T00:00:00.000Z");
    const next = "2026-11-13T00:00:00.000Z";

    it("moves an equal deadline along with the due date", async () => {
      jest.mocked(prisma.task.findFirst).mockResolvedValue({
        ...openTask,
        dueDate: old,
        deadline: new Date(old),
      } as never);
      await call("needt_update_task", { id: "task-1", dueDate: next });
      expect(written()).toMatchObject({
        dueDate: new Date(next),
        deadline: new Date(next),
      });
    });

    it("leaves a deadline that was set apart from the due date", async () => {
      jest.mocked(prisma.task.findFirst).mockResolvedValue({
        ...openTask,
        dueDate: old,
        deadline: new Date("2026-10-30T00:00:00.000Z"),
      } as never);
      await call("needt_update_task", { id: "task-1", dueDate: next });
      expect(written()).not.toHaveProperty("deadline");
    });

    it("sets the deadline on its own", async () => {
      jest.mocked(prisma.task.findFirst).mockResolvedValue({
        ...openTask,
        dueDate: old,
        deadline: new Date(old),
      } as never);
      await call("needt_update_task", { id: "task-1", deadline: next });
      expect(written()).toMatchObject({ deadline: new Date(next) });
      expect(written()).not.toHaveProperty("dueDate");
    });
  });

  it("a real priority ends No priority", async () => {
    await call("needt_update_task", { id: "task-1", priority: "HIGH" });
    expect(written()).toMatchObject({ priorityLevel: "HIGH", priority: null });
  });

  it("writes a repeat rule with the flag, and null stops it", async () => {
    await call("needt_update_task", {
      id: "task-1",
      recurrenceRule: "RRULE:FREQ=WEEKLY;BYDAY=MO,WE",
    });
    expect(written()).toMatchObject({
      recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,WE",
      isRecurring: true,
    });
    jest.mocked(prisma.task.update).mockClear();
    await call("needt_update_task", { id: "task-1", recurrenceRule: null });
    expect(written()).toMatchObject({
      recurrenceRule: null,
      isRecurring: false,
    });
  });

  it("refuses a repeat rule that is not an RRULE", async () => {
    const result = await call("needt_update_task", {
      id: "task-1",
      recurrenceRule: "every other tuesday",
    });
    expect(result.payload).toEqual({
      status: 400,
      error: "Invalid recurrence rule",
    });
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it("sets labels to exactly the ids given, and refuses labels that are not the caller's", async () => {
    jest.mocked(prisma.tag.count).mockResolvedValue(2);
    await call("needt_update_task", { id: "task-1", labelIds: ["a", "b"] });
    expect(written()).toMatchObject({
      tags: { set: [{ id: "a" }, { id: "b" }] },
    });

    jest.mocked(prisma.task.update).mockClear();
    jest.mocked(prisma.tag.count).mockResolvedValue(1);
    const foreign = await call("needt_update_task", {
      id: "task-1",
      labelIds: ["a", "someone-elses"],
    });
    expect(foreign.payload).toEqual({ status: 400, error: "Invalid label" });
    expect(prisma.task.update).not.toHaveBeenCalled();
    expect(jest.mocked(prisma.tag.count).mock.calls[1][0]).toMatchObject({
      where: { userId: "user-1" },
    });
  });

  it("checks hours against the planner's own schedules", async () => {
    jest.mocked(prisma.workSchedule.findFirst).mockResolvedValue(null);
    const foreign = await call("needt_update_task", {
      id: "task-1",
      scheduleId: "theirs",
    });
    expect(foreign.payload).toEqual({
      status: 400,
      error: "Invalid work schedule",
    });
    expect(
      jest.mocked(prisma.workSchedule.findFirst).mock.calls[0][0]
    ).toMatchObject({ where: { id: "theirs", userId: "user-1" } });

    jest
      .mocked(prisma.workSchedule.findFirst)
      .mockResolvedValue({ id: "mine" } as never);
    await call("needt_update_task", { id: "task-1", scheduleId: "mine" });
    expect(written()).toMatchObject({ scheduleId: "mine" });
  });
});
