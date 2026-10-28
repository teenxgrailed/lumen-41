import { NextRequest, NextResponse } from "next/server";

import { POST } from "@/app/api/mcp/route";
import {
  type BearerAuth,
  authenticateBearer,
} from "@/services/connectors/bearer";
import { createFakePrisma } from "@/services/ops/__tests__/fake-prisma";
import { WorkspaceKind, WorkspaceRole } from "@prisma/client";

import { resolveWorkspaceAccess } from "@/lib/auth/workspace-auth";
import { enforceRateLimits } from "@/lib/security/rate-limit";

import { listMcpTools } from "../tools";

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
  ...jest.requireActual("@/lib/entitlements"),
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

function rpc(name: string, args: Record<string, unknown>, id = 1) {
  return new NextRequest("http://localhost/api/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer good-token",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
}

async function call(name: string, args: Record<string, unknown>) {
  const response = await POST(rpc(name, args));
  const body = await response.json();
  return {
    isError: body.result?.isError === true,
    payload: (body.result
      ? JSON.parse(body.result.content[0].text)
      : body) as Json,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockState.db = createFakePrisma();
  jest.mocked(enforceRateLimits).mockResolvedValue(null);
  jest.mocked(authenticateBearer).mockResolvedValue(token);
  jest.mocked(resolveWorkspaceAccess).mockResolvedValue(personal);
});

const seedTask = (title: string, fields: Json = {}) =>
  mockState.db.seed("task", {
    title,
    userId: "user-1",
    assigneeId: "user-1",
    workspaceId: "personal-1",
    ...fields,
  });

const taskRow = (id: string) =>
  mockState.db.tables.task.find((row) => row.id === id)!;
const projectRow = (id: string) =>
  mockState.db.tables.project.find((row) => row.id === id)!;

describe("MCP delete, bulk, projects and undo", () => {
  it("lists the new tools with the right hints", () => {
    const tools = listMcpTools();
    const byName = (name: string) => tools.find((tool) => tool.name === name)!;
    for (const name of [
      "needt_delete",
      "needt_bulk",
      "needt_undo",
      "needt_create_project",
      "needt_update_project",
    ]) {
      expect(byName(name)).toBeDefined();
    }
    expect(byName("needt_delete").annotations).toMatchObject({
      destructiveHint: true,
      readOnlyHint: false,
    });
    expect(byName("needt_delete").description).toMatch(/needt_undo/);
    expect(byName("needt_update_task").description).toMatch(/needt_bulk/);
    expect(byName("needt_update_project").annotations?.destructiveHint).toBe(
      false
    );
    expect(JSON.stringify(byName("needt_bulk").inputSchema)).toContain(
      "additionalProperties"
    );
  });

  it("deletes tasks to Trash, hides them from lists, and needt_undo restores them", async () => {
    const a = await seedTask("A");
    const b = await seedTask("B");
    const keep = await seedTask("Keep");

    const deleted = await call("needt_delete", {
      type: "task",
      ids: [a.id, b.id],
    });
    expect(deleted.isError).toBe(false);
    expect(deleted.payload.result.counts).toEqual({ deleted: 2, failed: 0 });
    expect(deleted.payload.actionId).toEqual(expect.any(String));
    expect(taskRow(a.id).trashedAt).toBeInstanceOf(Date);

    const listed = await call("needt_list", { type: "task" });
    expect(listed.payload.items.map((t: Json) => t.title)).toEqual(["Keep"]);

    const undone = await call("needt_undo", {
      actionId: deleted.payload.actionId,
    });
    expect(undone.isError).toBe(false);
    expect(undone.payload.status).toBe("undone");
    expect(taskRow(a.id).trashedAt).toBeNull();
    expect(taskRow(keep.id).trashedAt ?? null).toBeNull();
    const back = await call("needt_list", { type: "task" });
    expect(back.payload.items).toHaveLength(3);
  });

  it("deletes mixed kinds with items; a project is archived", async () => {
    const task = await seedTask("T");
    const project = await mockState.db.seed("project", {
      name: "P",
      userId: "user-1",
      workspaceId: "personal-1",
    });
    const result = await call("needt_delete", {
      items: [
        { type: "task", id: task.id },
        { type: "project", id: project.id },
      ],
    });
    expect(result.payload.result.counts.deleted).toBe(2);
    expect(projectRow(project.id).status).toBe("archived");
  });

  it("asks for ids or items, and refuses more than 100", async () => {
    const empty = await call("needt_delete", { type: "task" });
    expect(empty.isError).toBe(true);
    const tooMany = await call("needt_delete", {
      type: "task",
      ids: Array.from({ length: 101 }, (_, i) => `t${i}`),
    });
    expect(tooMany.isError).toBe(true);
  });

  it("cannot delete another person's or another workspace's objects", async () => {
    const theirs = await seedTask("Theirs", {
      userId: "user-2",
      assigneeId: "user-2",
      workspaceId: "personal-2",
    });
    const project = await mockState.db.seed("project", {
      name: "Theirs",
      userId: "user-2",
      workspaceId: "personal-2",
    });
    const result = await call("needt_delete", {
      items: [
        { type: "task", id: theirs.id },
        { type: "project", id: project.id },
      ],
    });
    expect(result.payload.result.counts).toEqual({ deleted: 0, failed: 2 });
    expect(taskRow(theirs.id).trashedAt ?? null).toBeNull();
    expect(projectRow(project.id).status).toBe("active");

    const undo = await call("needt_undo", { actionId: "someone-elses" });
    expect(undo.isError).toBe(true);
  });

  it("needs write access: a read-only token cannot delete", async () => {
    jest.mocked(authenticateBearer).mockResolvedValue({
      ...token,
      scopes: ["needt.read"],
    });
    const response = await POST(
      rpc("needt_delete", { type: "task", ids: ["a"] })
    );
    expect(response.status).toBe(403);
  });

  it("changes many tasks with needt_bulk as one write and one undo", async () => {
    const tasks = await Promise.all(
      Array.from({ length: 12 }, (_, i) => seedTask(`Task ${i}`))
    );
    const bulk = await call("needt_bulk", {
      operations: tasks.map((task) => ({
        op: "task.update",
        input: { taskId: task.id, priority: "HIGH" },
      })),
    });
    expect(bulk.isError).toBe(false);
    expect(bulk.payload.result).toMatchObject({ applied: 12, failed: 0 });
    expect(tasks.every((t) => taskRow(t.id).priorityLevel === "HIGH")).toBe(
      true
    );
    expect(mockState.db.tables.agentAction).toHaveLength(1);

    await call("needt_undo", { actionId: bulk.payload.actionId });
    expect(tasks.every((t) => taskRow(t.id).priorityLevel === "MEDIUM")).toBe(
      true
    );
  });

  it("needt_bulk aborts on a bad step and says which", async () => {
    const task = await seedTask("Keep");
    const bulk = await call("needt_bulk", {
      operations: [
        { op: "task.update", input: { taskId: task.id, title: "Changed" } },
        { op: "task.update", input: { taskId: "missing", title: "x" } },
      ],
    });
    expect(bulk.isError).toBe(true);
    expect(JSON.stringify(bulk.payload)).toContain("Step 2");
    expect(taskRow(task.id).title).toBe("Keep");
  });

  it("completes several tasks with ids in one call", async () => {
    const tasks = await Promise.all([seedTask("A"), seedTask("B")]);
    const done = await call("needt_complete_task", {
      ids: tasks.map((t) => t.id),
    });
    expect(done.isError).toBe(false);
    expect(done.payload.result).toMatchObject({ applied: 2, failed: 0 });
    expect(tasks.every((t) => taskRow(t.id).status === "completed")).toBe(true);
    const neither = await call("needt_complete_task", {});
    expect(neither.isError).toBe(true);
  });

  it("creates, renames, recolours and archives a project, with undo", async () => {
    const created = await call("needt_create_project", {
      name: "Move house",
      color: "#3b82f6",
    });
    expect(created.isError).toBe(false);
    const id = created.payload.result.project.id;
    const changed = await call("needt_update_project", {
      id,
      name: "Moving",
      description: "Boxes",
      archived: true,
    });
    expect(changed.isError).toBe(false);
    expect(projectRow(id)).toMatchObject({
      name: "Moving",
      description: "Boxes",
      color: "#3b82f6",
      status: "archived",
    });
    await call("needt_undo", { actionId: changed.payload.actionId });
    expect(projectRow(id)).toMatchObject({
      name: "Move house",
      status: "active",
    });

    const empty = await call("needt_update_project", { id });
    expect(empty.isError).toBe(true);
    const missing = await call("needt_update_project", {
      id: "nope",
      name: "x",
    });
    expect(missing.isError).toBe(true);
  });

  it("tells a rate-limited tool call how long to wait", async () => {
    jest
      .mocked(enforceRateLimits)
      .mockResolvedValueOnce(null) // ip
      .mockResolvedValueOnce(null) // user
      .mockResolvedValueOnce(
        NextResponse.json(
          { error: "Too many attempts. Try again later." },
          { status: 429, headers: { "Retry-After": "17" } }
        )
      );
    const response = await POST(rpc("needt_create_project", { name: "P" }, 7));
    expect(response.status).toBe(200);
    expect(response.headers.get("retry-after")).toBe("17");
    const body = await response.json();
    expect(body.id).toBe(7);
    expect(body.result.isError).toBe(true);
    const payload = JSON.parse(body.result.content[0].text);
    expect(payload).toMatchObject({
      error: "RATE_LIMITED",
      retryAfterSeconds: 17,
    });
    expect(payload.message).toMatch(/17 seconds/);
    expect(mockState.db.tables.project).toHaveLength(0);
  });
});

describe("needt_whoami plan", () => {
  const person = { id: "user-1", name: "A", email: "a@example.com" };

  async function whoami(account: Json | null) {
    (mockState.db.client as Json).user = {
      findUnique: jest.fn().mockResolvedValue(account),
    };
    (mockState.db.client as Json).workspaceMember = {
      findMany: jest.fn().mockResolvedValue([]),
    };
    return call("needt_whoami", {});
  }

  it("says Free and what Free lacks", async () => {
    const { payload } = await whoami({
      ...person,
      subscription: null,
      trialGrant: null,
    });
    expect(payload.plan).toMatchObject({
      plan: "FREE",
      trial: false,
      features: { goals: false, aiAgent: false },
      limits: { activeHabits: 3 },
    });
    expect(payload.plan.upgrade).toMatch(/Settings > Plan/);
    expect(payload.user).toEqual(person);
  });

  it("says Pro for a paid plan, and Lifetime", async () => {
    const future = new Date("2099-01-01T00:00:00.000Z");
    const pro = await whoami({
      ...person,
      subscription: { plan: "PRO", status: "ACTIVE", currentPeriodEnd: future },
      trialGrant: null,
    });
    expect(pro.payload.plan).toMatchObject({
      plan: "PRO",
      trial: false,
      features: { goals: true },
      upgrade: null,
    });
    const lifetime = await whoami({
      ...person,
      subscription: {
        plan: "LIFETIME",
        status: "ACTIVE",
        currentPeriodEnd: null,
      },
      trialGrant: null,
    });
    expect(lifetime.payload.plan.plan).toBe("LIFETIME");
    expect(lifetime.payload.plan.features.goals).toBe(true);
  });

  it("says Pro on a free trial, with its end", async () => {
    const endsAt = new Date("2099-01-01T00:00:00.000Z");
    const { payload } = await whoami({
      ...person,
      subscription: null,
      trialGrant: { endsAt },
    });
    expect(payload.plan).toMatchObject({
      plan: "PRO",
      trial: true,
      trialEndsAt: endsAt.toISOString(),
      features: { goals: true },
    });
  });
});
