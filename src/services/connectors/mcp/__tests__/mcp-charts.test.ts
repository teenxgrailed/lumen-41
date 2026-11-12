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
  jest.mocked(authenticateBearer).mockResolvedValue(token);
  jest.mocked(resolveWorkspaceAccess).mockResolvedValue(personal);
});

describe("MCP charts", () => {
  it("lists the chart tools, and chart as a get/list type", () => {
    const names = MCP_TOOLS.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining(["needt_create_chart", "needt_update_chart"])
    );
    for (const name of ["needt_get", "needt_list"]) {
      const tool = listMcpTools().find((t) => t.name === name);
      expect(JSON.stringify(tool?.inputSchema)).toContain('"chart"');
    }
    const create = listMcpTools().find((t) => t.name === "needt_create_chart");
    expect(JSON.stringify(create?.inputSchema)).toContain("habit_streak");
  });

  it("adds a chart to a project, reads it with its series, changes and removes it", async () => {
    const project = await call("needt_create_project", { name: "Launch" });
    expect(project.isError).toBe(false);
    const projectId = project.payload.result?.project?.id ?? project.payload.id;
    await call("needt_create_task", { title: "Write post", projectId });

    const created = await call("needt_create_chart", {
      metric: "task_progress",
      projectId,
      rangeDays: 7,
    });
    expect(created.isError).toBe(false);
    expect(created.payload.actionId).toEqual(expect.any(String));
    const chart = created.payload.result.chart;
    expect(chart).toMatchObject({ projectId, metric: "task_progress" });

    const got = await call("needt_get", { type: "chart", id: chart.id });
    expect(got.payload.chart.series.points).toHaveLength(7);
    expect(got.payload.chart.series.summary).toMatchObject({
      done: 0,
      total: 1,
    });

    const updated = await call("needt_update_chart", {
      id: chart.id,
      style: "bar",
      title: "Launch progress",
    });
    expect(updated.isError).toBe(false);
    expect(updated.payload.result.chart).toMatchObject({
      style: "bar",
      title: "Launch progress",
    });

    const listed = await call("needt_list", { type: "chart" });
    expect(listed.payload.items).toEqual([
      expect.objectContaining({ id: chart.id, title: "Launch progress" }),
    ]);

    const removed = await call("needt_update_chart", {
      id: chart.id,
      remove: true,
    });
    expect(removed.isError).toBe(false);
    const after = await call("needt_list", { type: "chart" });
    expect(after.payload.items).toEqual([]);
  });

  it("answers an error for a bad metric and a missing chart", async () => {
    const bad = await call("needt_create_chart", { metric: "mood" });
    expect(bad.isError).toBe(true);
    const missing = await call("needt_get", { type: "chart", id: "nope" });
    expect(missing.isError).toBe(true);
  });
});
