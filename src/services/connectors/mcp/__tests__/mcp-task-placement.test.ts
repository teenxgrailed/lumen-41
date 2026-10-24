import { NextRequest } from "next/server";

import { PATCH as connectTaskPatch } from "@/app/api/connect/tasks/[id]/route";
import { POST } from "@/app/api/mcp/route";
import {
  type BearerAuth,
  authenticateBearer,
} from "@/services/connectors/bearer";
import { listMcpTools } from "@/services/connectors/mcp/tools";
import { parsePlacementStart } from "@/services/tasks/task-placement";
import { WorkspaceKind, WorkspaceRole } from "@prisma/client";

import { resolveWorkspaceAccess } from "@/lib/auth/workspace-auth";
import { isTaskPlacementBlocked } from "@/lib/flexible-hours-guard-server";
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
  isTaskPlacementBlocked: jest.fn().mockResolvedValue(false),
}));
jest.mock("@/lib/task-block-push", () => ({
  schedulePushTaskBlock: jest.fn(),
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
    task: {
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    scheduledBlock: { deleteMany: jest.fn(), create: jest.fn() },
    tag: { count: jest.fn() },
    workSchedule: { findFirst: jest.fn() },
    project: { findFirst: jest.fn() },
    taskListMapping: { findFirst: jest.fn() },
    userSettings: { findUnique: jest.fn() },
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
  estimatedMinutes: 45,
  duration: 45,
  scheduledStart: null,
  scheduledEnd: null,
  scheduleLocked: false,
  isAutoScheduled: true,
  dueDate: null,
  deadline: null,
  tags: [],
  project: null,
};

const written = () => jest.mocked(prisma.task.update).mock.calls[0][0].data;
const frozenBlock = () =>
  jest.mocked(prisma.scheduledBlock.create).mock.calls[0]?.[0].data;

describe("MCP and connector API: place and pin a task", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(authenticateBearer).mockResolvedValue(token);
    jest.mocked(resolveWorkspaceAccess).mockResolvedValue(shared);
    jest.mocked(isTaskPlacementBlocked).mockResolvedValue(false);
    jest
      .mocked(prisma.userSettings.findUnique)
      .mockResolvedValue({ timeZone: "Europe/Berlin" } as never);
    jest.mocked(prisma.task.findFirst).mockResolvedValue(openTask as never);
    jest
      .mocked(prisma.task.update)
      .mockImplementation((async ({ data }: { data: object }) => ({
        ...openTask,
        ...data,
      })) as never);
    jest.mocked(prisma.$transaction).mockResolvedValue([] as never);
  });

  it("lists start, pinned and autoSchedule on both task tools", () => {
    const tools = listMcpTools();
    const update = tools.find((tool) => tool.name === "needt_update_task");
    const create = tools.find((tool) => tool.name === "needt_create_task");
    const props = (tool: typeof update) =>
      Object.keys(
        (tool?.inputSchema as { properties: Record<string, unknown> })
          .properties
      );
    expect(props(update)).toEqual(
      expect.arrayContaining(["start", "pinned", "autoSchedule"])
    );
    expect(props(create)).toEqual(
      expect.arrayContaining(["start", "autoSchedule"])
    );
    expect(update?.description).toContain("pin");
  });

  it("start places the task there, pins it and writes one frozen block", async () => {
    const result = await call("needt_update_task", {
      id: "task-1",
      start: "2026-10-26T14:00:00+01:00",
    });
    expect(result.isError).toBe(false);
    expect(written()).toMatchObject({
      scheduledStart: new Date("2026-10-26T13:00:00.000Z"),
      // 45 minutes: the task's own estimate
      scheduledEnd: new Date("2026-10-26T13:45:00.000Z"),
      scheduleLocked: true,
      isAutoScheduled: false,
      autoScheduled: false,
      // the placed day, in the person's time zone
      dueDate: new Date("2026-10-25T23:00:00.000Z"),
    });
    expect(frozenBlock()).toMatchObject({
      taskId: "task-1",
      userId: "user-1",
      start: new Date("2026-10-26T13:00:00.000Z"),
      end: new Date("2026-10-26T13:45:00.000Z"),
      isFrozen: true,
    });
  });

  it("reads a start without an offset in the person's time zone and uses a new estimate", async () => {
    const result = await call("needt_update_task", {
      id: "task-1",
      start: "2026-07-01T09:30",
      estimatedMinutes: 90,
    });
    expect(result.isError).toBe(false);
    expect(written()).toMatchObject({
      scheduledStart: new Date("2026-07-01T07:30:00.000Z"),
      scheduledEnd: new Date("2026-07-01T09:00:00.000Z"),
      estimatedMinutes: 90,
    });
  });

  it("refuses a blocked-out time and an unreadable start", async () => {
    jest.mocked(isTaskPlacementBlocked).mockResolvedValueOnce(true);
    const blocked = await call("needt_update_task", {
      id: "task-1",
      start: "2026-10-26T14:00:00Z",
    });
    expect(blocked.isError).toBe(true);
    expect(blocked.payload.error).toBe("This time is blocked out");

    const garbled = await call("needt_update_task", {
      id: "task-1",
      start: "next tuesday",
    });
    expect(garbled.isError).toBe(true);
    expect(garbled.payload.error).toMatch(/ISO 8601/);
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it("pinned: true locks the task at the time it has; false hands it back", async () => {
    jest.mocked(prisma.task.findFirst).mockResolvedValue({
      ...openTask,
      scheduledStart: new Date("2026-10-26T08:00:00.000Z"),
      scheduledEnd: new Date("2026-10-26T08:45:00.000Z"),
    } as never);
    await call("needt_update_task", { id: "task-1", pinned: true });
    expect(written()).toEqual(
      expect.objectContaining({ scheduleLocked: true, isAutoScheduled: false })
    );
    expect(written()).not.toHaveProperty("scheduledStart");

    jest.mocked(prisma.task.update).mockClear();
    await call("needt_update_task", { id: "task-1", pinned: false });
    expect(written()).toEqual(
      expect.objectContaining({ scheduleLocked: false, isAutoScheduled: true })
    );
    expect(prisma.scheduledBlock.create).not.toHaveBeenCalled();
  });

  it("pinned: true on a task with no time asks for start", async () => {
    const result = await call("needt_update_task", {
      id: "task-1",
      pinned: true,
    });
    expect(result.isError).toBe(true);
    expect(result.payload.error).toMatch(/start/);
  });

  it("start with pinned: false is refused", async () => {
    const result = await call("needt_update_task", {
      id: "task-1",
      start: "2026-10-26T14:00:00Z",
      pinned: false,
    });
    expect(result.isError).toBe(true);
  });

  it("needt_create_task with start creates the task pinned at that time", async () => {
    jest
      .mocked(prisma.task.create)
      .mockImplementation((async ({ data }: { data: object }) => ({
        id: "task-new",
        ...data,
      })) as never);
    jest.mocked(prisma.task.findFirst).mockResolvedValue(null as never);
    const result = await call("needt_create_task", {
      title: "Call the printer",
      estimatedMinutes: 20,
      start: "2026-10-27T10:00",
    });
    expect(result.isError).toBe(false);
    const data = jest.mocked(prisma.task.create).mock.calls[0][0].data;
    expect(data).toMatchObject({
      scheduledStart: new Date("2026-10-27T09:00:00.000Z"),
      scheduledEnd: new Date("2026-10-27T09:20:00.000Z"),
      scheduleLocked: true,
      isAutoScheduled: false,
      autoScheduled: false,
      dueDate: new Date("2026-10-26T23:00:00.000Z"),
    });
    expect(frozenBlock()).toMatchObject({ taskId: "task-new", isFrozen: true });
  });

  it("needt_create_task with autoSchedule: false leaves it unplaced", async () => {
    jest
      .mocked(prisma.task.create)
      .mockImplementation((async ({ data }: { data: object }) => ({
        id: "task-new",
        ...data,
      })) as never);
    jest.mocked(prisma.task.findFirst).mockResolvedValue(null as never);
    await call("needt_create_task", { title: "Someday", autoSchedule: false });
    const data = jest.mocked(prisma.task.create).mock.calls[0][0].data;
    expect(data).toMatchObject({
      isAutoScheduled: false,
      autoScheduled: false,
      scheduleLocked: false,
    });
    expect(prisma.scheduledBlock.create).not.toHaveBeenCalled();
  });

  describe("PATCH /api/connect/tasks/:id", () => {
    const patch = (body: unknown) =>
      connectTaskPatch(
        new NextRequest("http://localhost/api/connect/tasks/task-1", {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer good-token",
          },
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ id: "task-1" }) }
      );

    it("places and pins through the same service", async () => {
      const response = await patch({ start: "2026-10-26T14:00:00Z" });
      expect(response.status).toBe(200);
      expect(written()).toMatchObject({
        scheduledStart: new Date("2026-10-26T14:00:00.000Z"),
        scheduleLocked: true,
      });
      expect(frozenBlock()).toMatchObject({ isFrozen: true });
    });

    it("needs the needt.write scope", async () => {
      jest
        .mocked(authenticateBearer)
        .mockResolvedValue({ ...token, scopes: ["needt.read"] });
      const response = await patch({ pinned: false });
      expect(response.status).toBe(403);
      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it("refuses fields it does not take", async () => {
      const response = await patch({ scheduleLocked: true });
      expect(response.status).toBe(400);
      expect(prisma.task.update).not.toHaveBeenCalled();
    });
  });
});

describe("parsePlacementStart", () => {
  it("keeps an explicit offset and reads a wall-clock time in the zone", () => {
    expect(
      parsePlacementStart("2026-10-26T14:00:00+01:00", "America/New_York")
    ).toEqual(new Date("2026-10-26T13:00:00.000Z"));
    expect(parsePlacementStart("2026-10-26T14:00", "America/New_York")).toEqual(
      new Date("2026-10-26T18:00:00.000Z")
    );
    expect(parsePlacementStart("2026-10-26", "UTC")).toBeNull();
    expect(parsePlacementStart("soon", "UTC")).toBeNull();
  });
});
