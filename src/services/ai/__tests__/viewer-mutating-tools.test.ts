import type { WorkspaceAccess } from "@/lib/auth/workspace-auth";

import { executeTool } from "../agent/legacy-tools";
import {
  agentToolNeedsEditor,
  isDangerousAgentTool,
  isMutatingAgentTool,
} from "../tool-catalog";

/**
 * A viewer reads a workspace. The agent writes for the person it speaks for,
 * so a tool that changes workspace data is refused for a viewer whether or not
 * it asks for confirmation first.
 */

const create = jest.fn();
const findFirst = jest.fn();

jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    task: {
      create: (...a: unknown[]) => create(...a),
      findFirst: (...a: unknown[]) => findFirst(...a),
    },
  },
}));

const workspace = (role: string) =>
  ({
    workspaceId: "ws-1",
    role,
    dataScope: { mode: "workspace", workspaceId: "ws-1" },
  }) as WorkspaceAccess;

const run = (
  name: string,
  args: Record<string, unknown>,
  role: string,
  confirmed = false
) =>
  executeTool(
    {} as never,
    { id: "c1", name, arguments: args } as never,
    "user-1",
    workspace(role),
    confirmed
  );

beforeEach(() => jest.clearAllMocks());

describe("which agent tools need an editor", () => {
  it("counts a tool that writes without asking, as well as one that asks first", () => {
    expect(isMutatingAgentTool("create_task")).toBe(true);
    expect(isDangerousAgentTool("create_task")).toBe(false);
    expect(agentToolNeedsEditor("create_task")).toBe(true);
    expect(agentToolNeedsEditor("delete_task")).toBe(true);
    expect(agentToolNeedsEditor("manage_projects", { action: "list" })).toBe(
      false
    );
  });

  it("leaves the reading tools open to a viewer", () => {
    for (const name of [
      "query_schedule",
      "list_pages",
      "search_pages",
      "get_focus_stats",
      "search_mail",
      "parse_brain_dump",
    ]) {
      expect([name, agentToolNeedsEditor(name)]).toEqual([name, false]);
    }
  });
});

describe("executeTool for a viewer", () => {
  it.each([
    ["create_task", { title: "Sneak a task in" }],
    ["add_subtasks", { taskId: "t1", subtasks: ["one"] }],
    ["complete_subtask", { taskId: "t1", subtaskId: "p1" }],
    ["create_task_from_email", { messageId: "m1" }],
  ])("refuses %s and writes nothing", async (name, args) => {
    const result = await run(name, args, "VIEWER");
    expect(result.text).toMatch(/Editor or Owner role is required/);
    expect(create).not.toHaveBeenCalled();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("lets an editor create a task", async () => {
    create.mockResolvedValue({ id: "t1", title: "A task" });
    const result = await run("create_task", { title: "A task" }, "EDITOR");
    expect(result.text).not.toMatch(/Editor or Owner role is required/);
  });
});
