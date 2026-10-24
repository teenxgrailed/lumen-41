import { NextRequest } from "next/server";

import { POST as recordSession } from "@/app/api/focus/route";
import { POST as sessionAction } from "@/app/api/focus/session/route";
import { WorkspaceKind, WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";

/**
 * A focus session books time on its task and can close it, so a task id from
 * the client is only used inside the caller's workspace, and a viewer cannot
 * touch a task through it at all.
 */

const sessionFindFirst = jest.fn();
const sessionCreate = jest.fn();
const sessionUpdate = jest.fn();
const taskFindFirst = jest.fn();
const taskUpdate = jest.fn();
const timeEntryCreate = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    focusSession: {
      findFirst: (...a: unknown[]) => sessionFindFirst(...a),
      create: (...a: unknown[]) => sessionCreate(...a),
      update: (...a: unknown[]) => sessionUpdate(...a),
    },
    task: {
      findFirst: (...a: unknown[]) => taskFindFirst(...a),
      update: (...a: unknown[]) => taskUpdate(...a),
    },
    timeEntry: { create: (...a: unknown[]) => timeEntryCreate(...a) },
  },
}));
jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/entitlements", () => ({
  canUseAdvancedFocusModes: jest.fn(),
  canViewFocusStats: jest.fn(),
}));
jest.mock("@/services/focus/focus-end-job", () => ({
  syncFocusEndJob: jest.fn(),
}));
jest.mock("@/services/focus/focusStats", () => ({
  ...jest.requireActual("@/services/focus/focusStats"),
  recomputeFocusStats: jest.fn(),
  getWeeklyFocusReport: jest.fn(),
}));
jest.mock("@/services/time-tracking/timeEntries", () => ({
  recomputeTaskActuals: jest.fn(),
}));

const FOREIGN_TASK = "task-in-another-workspace";

function access(role: WorkspaceRole) {
  return {
    enabled: true,
    workspaceId: "w1",
    workspaceKind: WorkspaceKind.SHARED,
    role,
    dataScope: { mode: "workspace" as const, workspaceId: "w1" },
  };
}

function signIn(role: WorkspaceRole) {
  jest
    .mocked(authenticateRequest)
    .mockResolvedValue({ userId: "u1", workspace: access(role) });
}

async function post(
  handler: typeof sessionAction,
  path: string,
  body: Record<string, unknown>
) {
  const response = await handler(
    new NextRequest(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
  return response as Response;
}

const startOn = (taskId?: string) =>
  post(sessionAction, "/api/focus/session", {
    action: "start",
    ...(taskId ? { taskId } : {}),
  });

beforeEach(() => {
  jest.clearAllMocks();
  signIn(WorkspaceRole.EDITOR);
  sessionFindFirst.mockResolvedValue(null);
  sessionCreate.mockImplementation(async ({ data }) => ({ id: "s1", ...data }));
  sessionUpdate.mockImplementation(async ({ data }) => ({ id: "s1", ...data }));
  // Only the caller's workspace holds tasks; anything else is not found.
  taskFindFirst.mockImplementation(async ({ where }) =>
    where.workspaceId === "w1" && where.id !== FOREIGN_TASK
      ? { id: where.id }
      : null
  );
});

describe("POST /api/focus/session", () => {
  it("starts on a task of the workspace, found through the workspace scope", async () => {
    const response = await startOn("t1");
    expect(response.status).toBe(200);
    expect(taskFindFirst).toHaveBeenCalledWith({
      where: { id: "t1", workspaceId: "w1" },
      select: { id: true },
    });
    expect(sessionCreate.mock.calls[0][0].data.taskId).toBe("t1");
  });

  it("refuses a task id from another workspace and starts nothing", async () => {
    const response = await startOn(FOREIGN_TASK);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "TASK_NOT_FOUND" });
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it("keeps the bare timer open to a viewer but not a task", async () => {
    signIn(WorkspaceRole.VIEWER);
    const withTask = await startOn("t1");
    expect(withTask.status).toBe(403);
    expect(await withTask.json()).toEqual({ error: "WORKSPACE_ROLE_REQUIRED" });
    expect(sessionCreate).not.toHaveBeenCalled();

    const bare = await startOn();
    expect(bare.status).toBe(200);
    expect(sessionCreate.mock.calls[0][0].data.taskId).toBeNull();
  });

  it("ends a session bound to a foreign task without marking it done", async () => {
    sessionFindFirst.mockResolvedValue({
      id: "s1",
      userId: "u1",
      taskId: FOREIGN_TASK,
      phase: "FOCUS",
      strictness: "NORMAL",
      plannedMinutes: 25,
      startedAt: new Date(Date.now() - 10 * 60_000),
      pausedAt: null,
      pausedTotalSeconds: 0,
    });
    const response = await post(sessionAction, "/api/focus/session", {
      action: "stop",
      sessionId: "s1",
      completed: true,
      markTaskDone: true,
    });
    expect(response.status).toBe(200);
    expect(sessionUpdate).toHaveBeenCalledTimes(1);
    expect(taskUpdate).not.toHaveBeenCalled();
    expect(timeEntryCreate).not.toHaveBeenCalled();
  });
});

describe("POST /api/focus", () => {
  const record = (taskId?: string) =>
    post(recordSession, "/api/focus", {
      elapsedMinutes: 25,
      completed: true,
      ...(taskId ? { taskId } : {}),
    });

  it("books no time on a task of another workspace", async () => {
    const response = await record(FOREIGN_TASK);
    expect(response.status).toBe(404);
    expect(sessionCreate).not.toHaveBeenCalled();
    expect(timeEntryCreate).not.toHaveBeenCalled();
  });

  it("books no time on a task for a viewer", async () => {
    signIn(WorkspaceRole.VIEWER);
    const response = await record("t1");
    expect(response.status).toBe(403);
    expect(sessionCreate).not.toHaveBeenCalled();
    expect(timeEntryCreate).not.toHaveBeenCalled();
  });
});
