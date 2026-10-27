import { NextRequest } from "next/server";

import { POST } from "@/app/api/mcp/route";
import {
  AssistantMemoryError,
  clearAgentMemories,
  forgetForUser,
  isLearningEnabled,
  listAgentMemories,
  rememberFromAssistant,
  updateMemoryForUser,
} from "@/services/ai/memory";
import {
  type BearerAuth,
  authenticateBearer,
} from "@/services/connectors/bearer";
import { sendConnectorWebhook } from "@/services/connectors/webhooks";
import { appendPageBlocks, createPage } from "@/services/pages/page-service";
import {
  PageCollaborationActiveError,
  writePageBlocks,
} from "@/services/pages/page-write-path";
import { scheduleAllTasksForUser } from "@/services/scheduling/TaskSchedulingService";
import { recomputeTaskActuals } from "@/services/time-tracking/timeEntries";
import { WorkspaceKind, WorkspaceRole } from "@prisma/client";

import { resolveMoodboardAccess } from "@/lib/auth/moodboard-auth";
import {
  WorkspaceAuthorizationError,
  resolveWorkspaceAccess,
} from "@/lib/auth/workspace-auth";
import { isPlacementBlocked } from "@/lib/flexible-hours-guard-server";
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
jest.mock("@/services/ai/memory", () => ({
  ...jest.requireActual("@/services/ai/memory"),
  clearAgentMemories: jest.fn(),
  forgetForUser: jest.fn(),
  isLearningEnabled: jest.fn(),
  listAgentMemories: jest.fn(),
  rememberFromAssistant: jest.fn(),
  updateMemoryForUser: jest.fn(),
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
const personalWorkspace = {
  ...shared,
  workspaceId: "personal-1",
  workspaceKind: WorkspaceKind.PERSONAL,
  dataScope: { mode: "workspace" as const, workspaceId: "personal-1" },
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

describe("MCP write tools", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(authenticateBearer).mockResolvedValue(token);
    jest.mocked(resolveWorkspaceAccess).mockResolvedValue(shared);
    jest
      .mocked(prisma.$transaction)
      .mockImplementation(((run: (client: typeof prisma) => unknown) =>
        run(prisma)) as never);
    jest.mocked(prisma.task.update).mockImplementation((async ({
      data,
    }: {
      data: object;
    }) => ({
      ...openTask,
      ...data,
    })) as never);
  });

  describe("needt_update_task", () => {
    it("writes only the whitelisted fields, in the caller's workspace, then reschedules", async () => {
      jest.mocked(prisma.task.findFirst).mockResolvedValue(openTask as never);
      const result = await call("needt_update_task", {
        id: "task-1",
        title: "  Write the brief ",
        dueDate: "2026-10-20T09:00:00.000Z",
        estimatedMinutes: 45,
        priority: "HIGH",
        energy: "LOW",
      });
      expect(result.isError).toBe(false);
      expect(jest.mocked(prisma.task.findFirst).mock.calls[0][0]).toMatchObject(
        { where: { id: "task-1", workspaceId: "workspace-1" } }
      );
      const { data } = jest.mocked(prisma.task.update).mock.calls[0][0];
      expect(data).toMatchObject({
        title: "Write the brief",
        estimatedMinutes: 45,
        duration: 45,
        priorityLevel: "HIGH",
        energyRequired: "LOW",
        activities: {
          create: { workspaceId: "workspace-1", action: "UPDATED" },
        },
      });
      expect((data as { dueDate: Date }).dueDate.toISOString()).toBe(
        "2026-10-20T09:00:00.000Z"
      );
      expect(scheduleAllTasksForUser).toHaveBeenCalledWith("user-1", {
        workspaceId: "workspace-1",
      });
    });

    it("refuses fields outside the whitelist", async () => {
      const result = await call("needt_update_task", {
        id: "task-1",
        userId: "someone-else",
      });
      expect(result.isError).toBe(true);
      expect(result.payload.error).toBe("Invalid arguments");
      expect(prisma.task.findFirst).not.toHaveBeenCalled();
    });

    it("does not find a task outside the workspace and refuses archived tasks", async () => {
      jest.mocked(prisma.task.findFirst).mockResolvedValueOnce(null);
      const missing = await call("needt_update_task", {
        id: "elsewhere",
        title: "x",
      });
      expect(missing.payload).toEqual({ status: 404, error: "Task not found" });

      jest
        .mocked(prisma.task.findFirst)
        .mockResolvedValueOnce({ ...openTask, isArchived: true } as never);
      const archived = await call("needt_update_task", {
        id: "task-1",
        title: "x",
      });
      expect(archived.payload.status).toBe(409);
      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it("refuses a project from another workspace", async () => {
      jest.mocked(prisma.task.findFirst).mockResolvedValue(openTask as never);
      jest.mocked(prisma.project.findFirst).mockResolvedValue(null);
      const result = await call("needt_update_task", {
        id: "task-1",
        projectId: "project-elsewhere",
      });
      expect(result.payload).toEqual({
        status: 400,
        error: "Invalid workspace project",
      });
      expect(
        jest.mocked(prisma.project.findFirst).mock.calls[0][0]
      ).toMatchObject({
        where: { id: "project-elsewhere", workspaceId: "workspace-1" },
      });
    });

    it("keeps an OAuth grant inside its workspace", async () => {
      jest
        .mocked(authenticateBearer)
        .mockResolvedValue({ ...token, kind: "oauth", workspaceId: "ws-1" });
      const result = await call("needt_update_task", {
        id: "task-1",
        title: "x",
        workspaceId: "ws-2",
      });
      expect(result.payload.error.error).toContain("another workspace");
      expect(prisma.task.findFirst).not.toHaveBeenCalled();
    });

    it("needs the write scope", async () => {
      jest
        .mocked(authenticateBearer)
        .mockResolvedValue({ ...token, scopes: ["needt.read"] });
      const result = await call("needt_update_task", {
        id: "task-1",
        title: "x",
      });
      expect(result.status).toBe(403);
    });
  });

  describe("needt_complete_task", () => {
    it("completes the task and sends task.completed", async () => {
      jest.mocked(prisma.task.findFirst).mockResolvedValue(openTask as never);
      const result = await call("needt_complete_task", { id: "task-1" });
      expect(result.payload.changed).toBe(true);
      const { data } = jest.mocked(prisma.task.update).mock.calls[0][0];
      expect(data).toMatchObject({ status: "completed" });
      expect((data as { completedAt: Date }).completedAt).toBeInstanceOf(Date);
      expect(recomputeTaskActuals).toHaveBeenCalledWith("task-1");
      expect(sendConnectorWebhook).toHaveBeenCalledWith(
        expect.objectContaining({ event: "task.completed" })
      );
    });

    it("is idempotent for a task that is already done", async () => {
      jest
        .mocked(prisma.task.findFirst)
        .mockResolvedValue({ ...openTask, status: "completed" } as never);
      const result = await call("needt_complete_task", { id: "task-1" });
      expect(result.isError).toBe(false);
      expect(result.payload.changed).toBe(false);
      expect(prisma.task.update).not.toHaveBeenCalled();
      expect(sendConnectorWebhook).not.toHaveBeenCalled();
    });

    it("reopens with done: false and clears completedAt", async () => {
      jest
        .mocked(prisma.task.findFirst)
        .mockResolvedValue({ ...openTask, status: "completed" } as never);
      await call("needt_complete_task", { id: "task-1", done: false });
      expect(
        jest.mocked(prisma.task.update).mock.calls[0][0].data
      ).toMatchObject({ status: "todo", completedAt: null });
      expect(sendConnectorWebhook).not.toHaveBeenCalled();
    });

    it("refuses a viewer", async () => {
      jest
        .mocked(resolveWorkspaceAccess)
        .mockImplementation(async ({ requiredRole }) => {
          if (requiredRole === WorkspaceRole.EDITOR) {
            throw new WorkspaceAuthorizationError(
              "Editor access required.",
              403,
              "WORKSPACE_ACCESS_DENIED"
            );
          }
          return { ...shared, role: WorkspaceRole.VIEWER };
        });
      const result = await call("needt_complete_task", { id: "task-1" });
      expect(result.isError).toBe(true);
      expect(result.payload.status).toBe(403);
      expect(prisma.task.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("needt_create_event", () => {
    const args = {
      title: "Dentist",
      start: "2026-10-20T09:00:00.000Z",
      end: "2026-10-20T10:00:00.000Z",
    };

    it("creates the event in the first Needt calendar", async () => {
      jest.mocked(resolveWorkspaceAccess).mockResolvedValue(personalWorkspace);
      jest
        .mocked(prisma.calendarFeed.findFirst)
        .mockResolvedValue({ id: "feed-local", type: "LOCAL" } as never);
      jest
        .mocked(prisma.calendarEvent.create)
        .mockResolvedValue({ id: "event-1" } as never);
      const result = await call("needt_create_event", args);
      expect(result.payload).toEqual({ id: "event-1" });
      expect(
        jest.mocked(prisma.calendarFeed.findFirst).mock.calls[0][0]
      ).toMatchObject({ where: { userId: "user-1", type: "LOCAL" } });
      expect(
        jest.mocked(prisma.calendarEvent.create).mock.calls[0][0].data
      ).toMatchObject({ feedId: "feed-local", title: "Dentist" });
    });

    it("works in the personal workspace only", async () => {
      const result = await call("needt_create_event", args);
      expect(result.payload.status).toBe(403);
      expect(prisma.calendarEvent.create).not.toHaveBeenCalled();
    });

    it("refuses provider calendars, inverted ranges and blocked hours", async () => {
      jest.mocked(resolveWorkspaceAccess).mockResolvedValue(personalWorkspace);
      jest
        .mocked(prisma.calendarFeed.findFirst)
        .mockResolvedValue({ id: "feed-google", type: "GOOGLE" } as never);
      const provider = await call("needt_create_event", {
        ...args,
        feedId: "feed-google",
      });
      expect(provider.payload.status).toBe(400);

      const inverted = await call("needt_create_event", {
        ...args,
        end: "2026-10-20T08:00:00.000Z",
      });
      expect(inverted.payload.error).toContain("after its start");

      jest
        .mocked(prisma.calendarFeed.findFirst)
        .mockResolvedValue({ id: "feed-local", type: "LOCAL" } as never);
      jest.mocked(isPlacementBlocked).mockResolvedValueOnce(true);
      const blocked = await call("needt_create_event", args);
      expect(blocked.payload.status).toBe(409);
      expect(prisma.calendarEvent.create).not.toHaveBeenCalled();
    });
  });

  describe("needt_create_page", () => {
    it("creates the page in the workspace and writes the body as blocks", async () => {
      jest.mocked(createPage).mockResolvedValue({
        id: "page-1",
        title: "Notes",
        parentId: null,
        contentRevision: 0,
        blocks: [{ id: "empty" }],
      } as never);
      jest.mocked(writePageBlocks).mockResolvedValue({
        id: "page-1",
        title: "Notes",
        parentId: null,
        contentRevision: 1,
        blocks: [{}, {}],
      } as never);
      const result = await call("needt_create_page", {
        title: "Notes",
        body: "# Plan\n- one",
      });
      expect(result.payload).toMatchObject({
        id: "page-1",
        contentRevision: 1,
        appendedBlocks: 2,
      });
      const [actor, input] = jest.mocked(createPage).mock.calls[0];
      expect(actor).toMatchObject({
        userId: "user-1",
        workspace: { workspaceId: "workspace-1" },
      });
      expect(input).toMatchObject({ title: "Notes", parentId: null });
      const [, pageId, blocks, , , revision] =
        jest.mocked(writePageBlocks).mock.calls[0];
      expect(pageId).toBe("page-1");
      expect(revision).toBe(0);
      expect(blocks.map((block) => block.type)).toEqual([
        "HEADING_1",
        "BULLETED_LIST",
      ]);
    });

    it("refuses a parent the caller cannot edit", async () => {
      jest
        .mocked(createPage)
        .mockRejectedValue(new Error("Parent page not found"));
      const result = await call("needt_create_page", {
        title: "Child",
        parentId: "page-elsewhere",
      });
      expect(result.payload).toEqual({
        status: 404,
        error: "Parent page not found",
      });
    });
  });

  describe("needt_append_page", () => {
    it("appends the text through the page write path", async () => {
      jest.mocked(appendPageBlocks).mockResolvedValue({
        id: "page-1",
        title: "Notes",
        parentId: null,
        contentRevision: 4,
        blocks: [{}, {}, {}],
      } as never);
      const result = await call("needt_append_page", {
        id: "page-1",
        text: "one\ntwo",
        format: "plain",
      });
      expect(result.payload).toMatchObject({
        blockCount: 3,
        appendedBlocks: 2,
      });
      const [actor, pageId, blocks] =
        jest.mocked(appendPageBlocks).mock.calls[0];
      expect(actor).toMatchObject({
        workspace: { workspaceId: "workspace-1" },
      });
      expect(pageId).toBe("page-1");
      expect(blocks).toHaveLength(2);
    });

    it("refuses a page the caller cannot edit, or one open live", async () => {
      jest.mocked(appendPageBlocks).mockResolvedValueOnce(null);
      const denied = await call("needt_append_page", {
        id: "page-x",
        text: "hi",
      });
      expect(denied.payload.status).toBe(404);

      jest
        .mocked(appendPageBlocks)
        .mockRejectedValueOnce(new PageCollaborationActiveError());
      const live = await call("needt_append_page", {
        id: "page-1",
        text: "hi",
      });
      expect(live.payload.status).toBe(409);
    });
  });

  describe("needt_log_habit", () => {
    beforeEach(() => {
      jest
        .mocked(prisma.userSettings.findUnique)
        .mockResolvedValue({ timeZone: "UTC" } as never);
    });

    it("marks the habit kept for a past day in the caller's workspace", async () => {
      jest
        .mocked(prisma.habit.findFirst)
        .mockResolvedValue({ id: "habit-1" } as never);
      const result = await call("needt_log_habit", {
        id: "habit-1",
        date: "2026-01-05",
      });
      expect(result.payload).toEqual({
        habitId: "habit-1",
        date: "2026-01-05",
        kept: true,
      });
      expect(
        jest.mocked(prisma.habit.findFirst).mock.calls[0][0]
      ).toMatchObject({
        where: { id: "habit-1", workspaceId: "workspace-1", userId: "user-1" },
      });
      expect(
        jest.mocked(prisma.habitCompletion.upsert).mock.calls[0][0]
      ).toMatchObject({
        create: {
          habitId: "habit-1",
          date: new Date("2026-01-05T00:00:00.000Z"),
        },
      });
    });

    it("unmarks with kept: false", async () => {
      jest
        .mocked(prisma.habit.findFirst)
        .mockResolvedValue({ id: "habit-1" } as never);
      await call("needt_log_habit", { id: "habit-1", kept: false });
      expect(prisma.habitCompletion.deleteMany).toHaveBeenCalled();
      expect(prisma.habitCompletion.upsert).not.toHaveBeenCalled();
    });

    it("refuses future days and habits outside the workspace", async () => {
      const future = await call("needt_log_habit", {
        id: "habit-1",
        date: "2999-01-01",
      });
      expect(future.payload.status).toBe(400);
      expect(prisma.habitCompletion.upsert).not.toHaveBeenCalled();

      jest.mocked(prisma.habit.findFirst).mockResolvedValue(null);
      const missing = await call("needt_log_habit", { id: "habit-x" });
      expect(missing.payload).toEqual({
        status: 404,
        error: "Habit not found",
      });
    });
  });

  describe("memories", () => {
    const memory = {
      id: "m1",
      kind: "preference",
      content: "No meetings before 10",
      source: "chat",
      sourceKey: "hidden",
      weight: 1,
      createdAt: new Date("2026-10-01T00:00:00Z"),
      updatedAt: new Date("2026-10-02T00:00:00Z"),
    };

    it("lists the lines and whether learning is on, without internals", async () => {
      jest.mocked(isLearningEnabled).mockResolvedValue(false);
      jest.mocked(listAgentMemories).mockResolvedValue([memory] as never);
      const result = await call("needt_list_memories", {});
      expect(result.isError).toBe(false);
      expect(result.payload.enabled).toBe(false);
      expect(result.payload.memories).toEqual([
        {
          id: "m1",
          kind: "preference",
          content: "No meetings before 10",
          source: "chat",
          createdAt: "2026-10-01T00:00:00.000Z",
          updatedAt: "2026-10-02T00:00:00.000Z",
        },
      ]);
      expect(listAgentMemories).toHaveBeenCalledWith("user-1", "workspace-1");
    });

    it("edits a line, and answers 404 for one that is not theirs", async () => {
      jest.mocked(updateMemoryForUser).mockResolvedValue(memory as never);
      const ok = await call("needt_update_memory", {
        id: "m1",
        content: "No meetings before 11",
      });
      expect(ok.payload.memory.id).toBe("m1");
      expect(updateMemoryForUser).toHaveBeenCalledWith(
        "user-1",
        "workspace-1",
        "m1",
        { content: "No meetings before 11", kind: undefined }
      );
      jest.mocked(updateMemoryForUser).mockResolvedValue(null);
      const missing = await call("needt_update_memory", {
        id: "x",
        content: "Something else",
      });
      expect(missing.payload).toEqual({
        status: 404,
        error: "Memory not found",
      });
    });

    it("forgets one line; forgetting all needs confirm", async () => {
      jest.mocked(forgetForUser).mockResolvedValue(true);
      const one = await call("needt_forget_memory", { id: "m1" });
      expect(one.payload).toEqual({ deleted: 1 });

      const refused = await call("needt_forget_memory", { all: true });
      expect(refused.payload.status).toBe(400);
      expect(clearAgentMemories).not.toHaveBeenCalled();

      jest.mocked(clearAgentMemories).mockResolvedValue({ count: 3 });
      const all = await call("needt_forget_memory", {
        all: true,
        confirm: true,
      });
      expect(all.payload).toEqual({ deleted: 3 });
      expect(clearAgentMemories).toHaveBeenCalledWith("user-1", "workspace-1");
    });

    it("saves a line through needt_remember and maps the errors", async () => {
      jest.mocked(rememberFromAssistant).mockResolvedValue({
        memory: { ...memory, source: "assistant" },
        updated: true,
      } as never);
      const ok = await call("needt_remember", {
        content: "No meetings before 10",
      });
      expect(ok.isError).toBe(false);
      expect(ok.payload).toEqual({
        id: "m1",
        kind: "preference",
        content: "No meetings before 10",
        source: "assistant",
        createdAt: "2026-10-01T00:00:00.000Z",
        updated: true,
      });
      expect(rememberFromAssistant).toHaveBeenCalledWith(
        "user-1",
        "workspace-1",
        { content: "No meetings before 10", kind: "preference" }
      );
      jest
        .mocked(rememberFromAssistant)
        .mockRejectedValue(new AssistantMemoryError("off", "Memory is off."));
      const off = await call("needt_remember", { content: "Anything" });
      expect(off.payload).toEqual({ status: 400, error: "Memory is off." });
      jest
        .mocked(rememberFromAssistant)
        .mockRejectedValue(new AssistantMemoryError("cap", "Memory is full."));
      const full = await call("needt_remember", { content: "Anything" });
      expect(full.payload.status).toBe(409);
    });

    it("has no tool that turns learning on", async () => {
      const response = await POST(
        new NextRequest("http://localhost/api/mcp", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer good-token",
          },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
        })
      );
      const names = (await response.json()).result.tools.map(
        (tool: { name: string }) => tool.name
      );
      expect(names).toEqual(
        expect.arrayContaining([
          "needt_list_memories",
          "needt_remember",
          "needt_update_memory",
          "needt_forget_memory",
        ])
      );
      expect(names.filter((n: string) => /learn|enable/.test(n))).toEqual([]);
    });
  });

  describe("moodboards in needt_list and needt_get", () => {
    it("lists the workspace's boards", async () => {
      jest.mocked(prisma.moodboard.findMany).mockResolvedValue([
        {
          id: "board-1",
          title: "Mood",
          createdById: "user-1",
          _count: { items: 2 },
          items: [],
          accessGrants: [],
        },
      ] as never);
      const result = await call("needt_list", { type: "moodboard" });
      expect(result.payload.items).toEqual([
        expect.objectContaining({
          id: "board-1",
          title: "Mood",
          itemCount: 2,
          accessRole: "FULL_ACCESS",
        }),
      ]);
      expect(
        jest.mocked(prisma.moodboard.findMany).mock.calls[0][0]
      ).toMatchObject({
        where: { workspaceId: "workspace-1", archivedAt: null },
      });
    });

    it("reads a board the caller can access and refuses one it cannot", async () => {
      jest
        .mocked(resolveMoodboardAccess)
        .mockResolvedValueOnce({ role: "EDITOR" } as never);
      jest
        .mocked(prisma.moodboard.findFirst)
        .mockResolvedValue({ id: "board-1", title: "Mood" } as never);
      const found = await call("needt_get", {
        type: "moodboard",
        id: "board-1",
      });
      expect(found.payload).toEqual({
        id: "board-1",
        title: "Mood",
        accessRole: "EDITOR",
      });

      jest.mocked(resolveMoodboardAccess).mockResolvedValueOnce(null);
      const denied = await call("needt_get", {
        type: "moodboard",
        id: "board-2",
      });
      expect(denied.payload.status).toBe(404);
    });
  });
});
