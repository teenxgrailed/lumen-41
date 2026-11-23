import { NextRequest } from "next/server";

import { POST } from "@/app/api/mcp/route";
import {
  type BearerAuth,
  authenticateBearer,
} from "@/services/connectors/bearer";
import { createFakePrisma } from "@/services/ops/__tests__/fake-prisma";
import { scheduleAllTasksForUser } from "@/services/scheduling/TaskSchedulingService";
import { loadSpreadDays } from "@/services/scheduling/spread-capacity";
import { WorkspaceKind, WorkspaceRole } from "@prisma/client";

import { resolveWorkspaceAccess } from "@/lib/auth/workspace-auth";

import { MCP_TOOLS } from "../tools";

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
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
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
jest.mock("@/lib/activation-events", () => ({ recordActivation: jest.fn() }));
jest.mock("@/lib/feature-flags", () => ({
  ideaCardsEnabled: jest.fn().mockResolvedValue(true),
}));
jest.mock("@/lib/entitlements", () => ({
  getPlan: jest.fn().mockResolvedValue("PRO"),
  canUseGoals: jest.fn(),
}));
jest.mock("@/lib/task-block-push", () => ({
  schedulePushTaskBlock: jest.fn(),
}));
jest.mock("@/services/scheduling/TaskSchedulingService", () => ({
  scheduleAllTasksForUser: jest.fn().mockResolvedValue([]),
  scheduleAllTasksForUserDetailed: jest.fn(),
}));
jest.mock("@/services/scheduling/spread-capacity", () => ({
  loadSpreadDays: jest.fn(),
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

const rows = () => mockState.db.tables.task;

beforeEach(async () => {
  jest.clearAllMocks();
  mockState.db = createFakePrisma();
  jest.mocked(authenticateBearer).mockResolvedValue(token);
  jest.mocked(resolveWorkspaceAccess).mockResolvedValue(personal);
  jest.mocked(scheduleAllTasksForUser).mockResolvedValue([]);
  jest
    .mocked(loadSpreadDays)
    .mockResolvedValue([{ date: "2026-11-23", free: 240 }]);
  await mockState.db.seed("userSettings", {
    userId: "user-1",
    timeZone: "Europe/Zurich",
  });
});

describe("MCP idea tools", () => {
  it("lists the idea tools, each with a title and the right read-only hint", () => {
    const byName = new Map(MCP_TOOLS.map((tool) => [tool.name, tool]));
    for (const name of [
      "needt_create_idea",
      "needt_list_ideas",
      "needt_take_idea",
      "needt_skip_idea",
    ]) {
      expect(byName.get(name)?.annotations.title).toBeTruthy();
    }
    expect(byName.get("needt_list_ideas")?.annotations.readOnlyHint).toBe(true);
    expect(byName.get("needt_create_idea")?.annotations.readOnlyHint).toBe(
      false
    );
  });

  it("creates an idea with source agent, lists it, skips and takes it", async () => {
    const created = await call("needt_create_idea", {
      title: "Watch the Figma config talk",
      estimateMinutes: 20,
    });
    expect(created.isError).toBe(false);
    const id = created.payload.result.task.id as string;
    expect(created.payload.actionId).toBeTruthy();
    expect(rows().find((r) => r.id === id)).toMatchObject({
      kind: "IDEA",
      ideaSource: "agent",
      dueDate: null,
    });

    const listed = await call("needt_list_ideas", {});
    expect(
      listed.payload.result.ideas.map((i: { id: string }) => i.id)
    ).toEqual([id]);

    const skipped = await call("needt_skip_idea", { id });
    expect(skipped.payload.result.archived).toBe(false);

    const taken = await call("needt_take_idea", { id });
    expect(taken.isError).toBe(false);
    expect(rows().find((r) => r.id === id)?.kind).toBe("TASK");
    expect(scheduleAllTasksForUser).toHaveBeenCalled();
  });

  it("refuses a bad idea input", async () => {
    const res = await call("needt_create_idea", {
      title: "Dated",
      dueDate: "2026-11-25",
    });
    expect(res.isError).toBe(true);
  });

  it("needt_list keeps tasks by default and takes kind", async () => {
    await mockState.db.seed("task", {
      title: "Real task",
      userId: "user-1",
      workspaceId: "personal-1",
    });
    await mockState.db.seed("task", {
      title: "An idea",
      kind: "IDEA",
      userId: "user-1",
      workspaceId: "personal-1",
    });
    const titles = async (extra: Record<string, unknown> = {}) =>
      (
        (await call("needt_list", { type: "task", ...extra })).payload
          .items as { title: string }[]
      )
        .map((t) => t.title)
        .sort();
    expect(await titles()).toEqual(["Real task"]);
    expect(await titles({ kind: "idea" })).toEqual(["An idea"]);
    expect(await titles({ kind: "any" })).toEqual(["An idea", "Real task"]);
  });

  it("needt_update_task with kind converts a task to an idea and back, alone", async () => {
    const task = await mockState.db.seed("task", {
      title: "Read news",
      userId: "user-1",
      workspaceId: "personal-1",
      dueDate: new Date("2026-11-20T00:00:00Z"),
    });
    const bad = await call("needt_update_task", {
      id: task.id,
      kind: "idea",
      title: "Other",
    });
    expect(bad.isError).toBe(true);
    const made = await call("needt_update_task", { id: task.id, kind: "idea" });
    expect(made.isError).toBe(false);
    expect(made.payload.actionId).toBeTruthy();
    expect(rows().find((r) => r.id === task.id)).toMatchObject({
      kind: "IDEA",
      dueDate: null,
    });
    const back = await call("needt_update_task", { id: task.id, kind: "task" });
    expect(back.isError).toBe(false);
    expect(rows().find((r) => r.id === task.id)?.kind).toBe("TASK");
  });

  it("needt_update_task refuses a date on an idea", async () => {
    const idea = await mockState.db.seed("task", {
      title: "Idea",
      kind: "IDEA",
      userId: "user-1",
      workspaceId: "personal-1",
    });
    const res = await call("needt_update_task", {
      id: idea.id,
      deadline: "2026-11-25T10:00:00Z",
    });
    expect(res.isError).toBe(true);
  });
});
