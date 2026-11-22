import { NextRequest } from "next/server";

import { POST } from "@/app/api/mcp/route";
import {
  type BearerAuth,
  authenticateBearer,
} from "@/services/connectors/bearer";
import { createFakePrisma } from "@/services/ops/__tests__/fake-prisma";
import { WorkspaceKind, WorkspaceRole } from "@prisma/client";

import { resolveWorkspaceAccess } from "@/lib/auth/workspace-auth";

import { MCP_TOOLS, listMcpTools } from "../tools";

const mockState = { db: createFakePrisma() };

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
jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/realtime/publish", () => ({
  publishRealtimeEvent: jest.fn(),
  publishRealtimeEventSafe: jest.fn(),
}));
jest.mock("@/lib/security/rate-limit", () => ({
  enforceRateLimits: jest.fn().mockResolvedValue(null),
  ipRule: jest.fn(),
  accountRule: jest.fn(),
}));
jest.mock("@/lib/entitlements", () => ({
  getPlan: jest.fn().mockResolvedValue("PRO"),
  canUseGoals: jest.fn(),
}));
jest.mock("@/lib/task-block-push", () => ({
  schedulePushTaskBlock: jest.fn(),
}));
jest.mock("@/services/scheduling/TaskSchedulingService", () => ({
  scheduleAllTasksForUser: jest.fn(),
  scheduleAllTasksForUserDetailed: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockState.db.client;
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const entitlements = require("@/lib/entitlements");

const personal = {
  enabled: true,
  workspaceId: "personal-1",
  workspaceKind: WorkspaceKind.PERSONAL,
  role: WorkspaceRole.OWNER,
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
    isError: body.result?.isError === true,
    payload: body.result ? JSON.parse(body.result.content[0].text) : body,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockState.db = createFakePrisma();
  entitlements.getPlan.mockResolvedValue("PRO");
  entitlements.canUseGoals.mockResolvedValue({
    allowed: true,
    upgradeRequired: false,
    plan: "PRO",
  });
  jest.mocked(authenticateBearer).mockResolvedValue(token);
  jest.mocked(resolveWorkspaceAccess).mockResolvedValue(personal);
});

describe("MCP goals", () => {
  it("lists the goal tools and goal as a list type", () => {
    const names = MCP_TOOLS.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "needt_create_goal",
        "needt_update_goal",
        "needt_convert_task_to_goal",
      ])
    );
    const list = listMcpTools().find((tool) => tool.name === "needt_list");
    expect(JSON.stringify(list?.inputSchema)).toContain('"goal"');
    const update = listMcpTools().find(
      (tool) => tool.name === "needt_update_task"
    );
    expect(JSON.stringify(update?.inputSchema)).toContain("goalId");
  });

  it("creates a goal, links a task, ticks it and reads the progress", async () => {
    const created = await call("needt_create_goal", {
      title: "Run 10k",
      area: "health",
    });
    expect(created.isError).toBe(false);
    const goal = created.payload.result.goal;
    expect(created.payload.actionId).toEqual(expect.any(String));

    const task = await call("needt_create_task", {
      title: "Buy shoes",
      goalId: goal.id,
    });
    expect(task.isError).toBe(false);
    expect(task.payload.goalId).toBe(goal.id);
    const other = await call("needt_create_task", { title: "Run 5k" });
    const linked = await call("needt_update_task", {
      id: other.payload.id,
      goalId: goal.id,
    });
    expect(linked.isError).toBe(false);

    await call("needt_complete_task", { id: task.payload.id });
    const got = await call("needt_get", { type: "goal", id: goal.id });
    expect(got.payload.goal.progress).toMatchObject({
      source: "tasks",
      done: 1,
      total: 2,
    });

    const listed = await call("needt_list", { type: "goal" });
    expect(listed.payload.items).toEqual([
      expect.objectContaining({ id: goal.id, title: "Run 10k" }),
    ]);
  });

  it("refuses a goal id from nowhere on a task", async () => {
    const refused = await call("needt_create_task", {
      title: "Buy shoes",
      goalId: "missing",
    });
    expect(refused.isError).toBe(true);
  });

  it("updates, checks in and archives through needt_update_goal", async () => {
    const created = await call("needt_create_goal", {
      title: "Emergency fund",
      targetValue: 2500,
      currentValue: 500,
      unit: "CHF",
    });
    const id = created.payload.result.goal.id;
    const changed = await call("needt_update_goal", {
      id,
      area: "money",
      checkInSchedule: { weekday: 5, hour: 18 },
      checkIn: { value: 1500, note: "Halfway-ish" },
    });
    expect(changed.isError).toBe(false);
    expect(changed.payload.update.result.goal).toMatchObject({
      area: "money",
      checkIn: { weekday: 5, hour: 18 },
    });
    expect(changed.payload.checkIn.result.goal.progress.percent).toBe(60);
    expect(changed.payload.checkIn.actionId).toEqual(expect.any(String));

    const got = await call("needt_get", { type: "goal", id });
    expect(got.payload.checkIns).toEqual([
      expect.objectContaining({ value: 1500, note: "Halfway-ish" }),
    ]);

    const nothing = await call("needt_update_goal", { id });
    expect(nothing.isError).toBe(true);

    const archived = await call("needt_update_goal", { id, archive: true });
    expect(archived.isError).toBe(false);
    const after = await call("needt_list", { type: "goal" });
    expect(after.payload.items).toEqual([]);
  });

  it("converts a task to a goal", async () => {
    const task = await call("needt_create_task", {
      title: "GOAL: Learn German to B1",
    });
    // The fake client does not write nested creates; seed the steps.
    for (const [position, title] of [
      "Book a course",
      "Do 20 lessons",
    ].entries()) {
      await mockState.db.seed("taskPart", {
        taskId: task.payload.id,
        title,
        position,
      });
    }
    const converted = await call("needt_convert_task_to_goal", {
      taskId: task.payload.id,
      area: "learning",
    });
    expect(converted.isError).toBe(false);
    expect(converted.payload.result.goal).toMatchObject({
      title: "Learn German to B1",
      area: "learning",
    });
    expect(
      converted.payload.result.tasks.map((t: { title: string }) => t.title)
    ).toEqual(["Book a course", "Do 20 lessons"]);
    expect(converted.payload.actionId).toEqual(expect.any(String));
  });

  it("answers Free with an upgrade error when creating", async () => {
    entitlements.canUseGoals.mockResolvedValue({
      allowed: false,
      upgradeRequired: true,
      plan: "FREE",
    });
    const refused = await call("needt_create_goal", { title: "Run 10k" });
    expect(refused.isError).toBe(true);
    expect(refused.payload.error.code).toBe("UPGRADE_REQUIRED");
  });

  it("needs needt.write to create", async () => {
    jest.mocked(authenticateBearer).mockResolvedValue({
      ...token,
      scopes: ["needt.read"],
    });
    const refused = await call("needt_create_goal", { title: "Run 10k" });
    expect(refused.isError || refused.payload.error).toBeTruthy();
    expect(mockState.db.tables.goal).toHaveLength(0);
  });
});
