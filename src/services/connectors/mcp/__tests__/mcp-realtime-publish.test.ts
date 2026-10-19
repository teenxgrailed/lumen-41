import { NextRequest } from "next/server";

import { authorizeConnectorWorkspace } from "@/services/connectors/auth";
import type { BearerAuth } from "@/services/connectors/bearer";
import { createLocalEvent } from "@/services/connectors/local-events";
import { setHabitCompletionToday } from "@/services/habits/habit-service";
import { appendPageBlocks, createPage } from "@/services/pages/page-service";
import { appendSubtasks, setSubtaskDone } from "@/services/tasks/subtasks";
import { updateTaskFields } from "@/services/tasks/task-update";

import { publishRealtimeEventSafe } from "@/lib/realtime/publish";

import { findMcpTool } from "../tools";

jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/realtime/publish", () => ({
  publishRealtimeEvent: jest.fn(),
  publishRealtimeEventSafe: jest.fn(),
}));
jest.mock("@/services/connectors/auth", () => ({
  authorizeConnectorWorkspace: jest.fn(),
}));
jest.mock("@/app/api/connect/tasks/route", () => ({ POST: jest.fn() }));
jest.mock("@/app/api/connect/control/route", () => ({ POST: jest.fn() }));
jest.mock("@/app/api/connect/reschedule/route", () => ({ POST: jest.fn() }));
jest.mock("@/app/api/connect/schedule/route", () => ({
  GET: jest.fn(),
  POST: jest.fn(),
}));
jest.mock("@/app/api/connect/ops/[name]/route", () => ({ POST: jest.fn() }));
jest.mock("@/services/connectors/local-events", () => ({
  createLocalEvent: jest.fn(),
}));
jest.mock("@/services/habits/habit-service", () => ({
  HabitCompletionDateError: class extends Error {},
  setHabitCompletionToday: jest.fn(),
}));
jest.mock("@/services/pages/page-service", () => ({
  createPage: jest.fn(),
  appendPageBlocks: jest.fn(),
  getPage: jest.fn(),
}));
jest.mock("@/services/tasks/subtasks", () => ({
  ...jest.requireActual("@/services/tasks/subtasks"),
  appendSubtasks: jest.fn(),
  setSubtaskDone: jest.fn(),
}));
jest.mock("@/services/tasks/task-update", () => ({
  updateTaskFields: jest.fn(),
}));

const publish = publishRealtimeEventSafe as jest.Mock;
const workspace = { workspaceId: "w1", workspaceKind: "PERSONAL" };

const ctx = {
  request: new NextRequest("https://use.needt.app/api/mcp", { method: "POST" }),
  userId: "u1",
  auth: { userId: "u1" } as unknown as BearerAuth,
};

function call(name: string, args: Record<string, unknown>) {
  const tool = findMcpTool(name)!;
  return tool.invoke(ctx, tool.input.parse(args));
}

const types = () => publish.mock.calls.map(([, type]) => type);

beforeEach(() => {
  jest.clearAllMocks();
  (authorizeConnectorWorkspace as jest.Mock).mockResolvedValue({ workspace });
});

describe("MCP writes tell the open app", () => {
  it("needt_complete_subtask publishes tasks-updated", async () => {
    (setSubtaskDone as jest.Mock).mockResolvedValue({
      ok: true,
      subtask: { id: "s1", done: true },
      open: 5,
      allDone: false,
    });
    await call("needt_complete_subtask", { taskId: "t1", subtaskId: "s1" });
    expect(publish).toHaveBeenCalledWith("u1", "tasks-updated");
  });

  it("needt_add_subtasks publishes tasks-updated", async () => {
    (appendSubtasks as jest.Mock).mockResolvedValue({ ok: true, subtasks: [] });
    await call("needt_add_subtasks", { taskId: "t1", subtasks: ["a"] });
    expect(types()).toEqual(["tasks-updated"]);
  });

  it("needt_update_task and needt_complete_task publish tasks-updated", async () => {
    (updateTaskFields as jest.Mock).mockResolvedValue({
      ok: true,
      changed: true,
      task: { id: "t1" },
    });
    await call("needt_update_task", { id: "t1", title: "New" });
    await call("needt_complete_task", { id: "t1" });
    expect(types()).toEqual(["tasks-updated", "tasks-updated"]);
  });

  it("needt_log_habit publishes tasks-updated", async () => {
    (setHabitCompletionToday as jest.Mock).mockResolvedValue({
      habitId: "h1",
      date: "2026-10-19",
      completed: true,
    });
    await call("needt_log_habit", { id: "h1" });
    expect(types()).toEqual(["tasks-updated"]);
  });

  it("needt_create_event publishes calendar-updated", async () => {
    (createLocalEvent as jest.Mock).mockResolvedValue({
      ok: true,
      event: { id: "e1" },
    });
    await call("needt_create_event", {
      title: "Call",
      start: "2026-10-20T10:00:00Z",
      end: "2026-10-20T11:00:00Z",
    });
    expect(types()).toEqual(["calendar-updated"]);
  });

  it("page writes publish docs-updated", async () => {
    (createPage as jest.Mock).mockResolvedValue({
      id: "p1",
      title: "T",
      contentRevision: 1,
      blocks: [],
    });
    (appendPageBlocks as jest.Mock).mockResolvedValue({
      id: "p1",
      title: "T",
      contentRevision: 2,
      blocks: [],
    });
    await call("needt_create_page", { title: "T" });
    await call("needt_append_page", { id: "p1", text: "hello" });
    expect(types()).toEqual(["docs-updated", "docs-updated"]);
  });

  it("publishes nothing when the write failed", async () => {
    (setSubtaskDone as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      error: "Subtask not found",
    });
    const result = await call("needt_complete_subtask", {
      taskId: "t1",
      subtaskId: "nope",
    });
    expect(result.isError).toBe(true);
    expect(publish).not.toHaveBeenCalled();
  });
});
