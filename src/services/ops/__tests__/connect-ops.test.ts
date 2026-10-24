import { NextRequest, NextResponse } from "next/server";

import { POST as undoActionRoute } from "@/app/api/agent/actions/[id]/undo/route";
import { POST as runOpRoute } from "@/app/api/connect/ops/[name]/route";
import { GET as listOpsRoute } from "@/app/api/connect/ops/route";
import { hashConnectorToken } from "@/services/connectors/auth";
import {
  type BearerAuth,
  registerBearerResolver,
} from "@/services/connectors/bearer";
import { WorkspaceRole } from "@prisma/client";

import { enforceRateLimits } from "@/lib/security/rate-limit";

import { createFakePrisma } from "./fake-prisma";
import {
  OTHER_ID,
  OWNER_ID,
  WORKSPACE_ID,
  access,
  seedTask,
  taskRow,
} from "./harness";

const mockState = { db: createFakePrisma() };

jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockState.db.client;
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock("@/lib/realtime/publish", () => ({
  publishRealtimeEvent: jest.fn(),
}));
jest.mock("@/lib/task-block-push", () => ({
  schedulePushTaskBlock: jest.fn(),
}));
jest.mock("@/services/connectors/webhooks", () => ({
  sendConnectorWebhook: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/services/time-tracking/timeEntries", () => ({
  recomputeTaskActuals: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/mail-db", () => ({ getMailMessage: jest.fn() }));
jest.mock("@/lib/entitlements", () => ({
  getPlan: jest.fn().mockResolvedValue("FREE"),
}));
jest.mock("@/services/scheduling/TaskSchedulingService", () => ({
  scheduleAllTasksForUser: jest.fn(),
  scheduleAllTasksForUserDetailed: jest.fn(),
}));
jest.mock("@/lib/auth/email-verification-access", () => ({
  getEmailVerificationStatus: jest
    .fn()
    .mockResolvedValue({ required: false, verified: true }),
}));
jest.mock("@/lib/auth/api-auth", () => ({
  authenticateRequest: jest.fn().mockResolvedValue({
    response: new Response("Unauthorized", { status: 401 }),
  }),
}));
jest.mock("@/lib/security/rate-limit", () => ({
  accountRule: jest.fn((_value, namespace, limit) => ({ namespace, limit })),
  enforceRateLimits: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/lib/auth/workspace-auth", () => {
  const actual = jest.requireActual("@/lib/auth/workspace-auth");
  return { ...actual, resolveWorkspaceAccess: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const workspaceAuth = require("@/lib/auth/workspace-auth");

const OWNER_TOKEN = "needt_owner";
const OTHER_TOKEN = "needt_other";
let role: WorkspaceRole = WorkspaceRole.OWNER;

beforeEach(async () => {
  jest.mocked(enforceRateLimits).mockClear();
  mockState.db = createFakePrisma();
  role = WorkspaceRole.OWNER;
  workspaceAuth.resolveWorkspaceAccess.mockImplementation(
    async ({ requiredRole }: { requiredRole?: WorkspaceRole }) => {
      if (
        requiredRole === WorkspaceRole.EDITOR &&
        role === WorkspaceRole.VIEWER
      ) {
        throw new workspaceAuth.WorkspaceAuthorizationError(
          "The requested workspace role is required.",
          403,
          "WORKSPACE_ROLE_REQUIRED"
        );
      }
      return access(role);
    }
  );
  await mockState.db.seed("connectorSettings", {
    userId: OWNER_ID,
    tokenHash: hashConnectorToken(OWNER_TOKEN),
  });
  await mockState.db.seed("connectorSettings", {
    userId: OTHER_ID,
    tokenHash: hashConnectorToken(OTHER_TOKEN),
  });
});

function request(
  path: string,
  init: { token?: string; body?: unknown; method?: string } = {}
) {
  return new NextRequest(`http://localhost${path}`, {
    method: init.method ?? "POST",
    headers: {
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
      "content-type": "application/json",
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

const params = <T extends Record<string, string>>(value: T) => ({
  params: Promise.resolve(value),
});

describe("connector ops API", () => {
  it("requires the connector token", async () => {
    const list = await listOpsRoute(
      request("/api/connect/ops", { method: "GET" })
    );
    expect(list.status).toBe(401);
    const run = await runOpRoute(
      request("/api/connect/ops/task.create", { body: { title: "x" } }),
      params({ name: "task.create" })
    );
    expect(run.status).toBe(401);
    const wrong = await runOpRoute(
      request("/api/connect/ops/task.create", {
        token: "needt_wrong",
        body: { title: "x" },
      }),
      params({ name: "task.create" })
    );
    expect(wrong.status).toBe(401);
    expect(mockState.db.tables.task).toHaveLength(0);
  });

  it("lists public ops with their input schema", async () => {
    const response = await listOpsRoute(
      request("/api/connect/ops", { method: "GET", token: OWNER_TOKEN })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ops.map((op: { name: string }) => op.name)).toContain(
      "task.create"
    );
    expect(body.ops.map((op: { name: string }) => op.name)).not.toContain(
      "task.restore"
    );
  });

  it("runs an op as the token's user, logs it, and the same token can undo it", async () => {
    const response = await runOpRoute(
      request("/api/connect/ops/task.create", {
        token: OWNER_TOKEN,
        body: { title: "From Zapier" },
      }),
      params({ name: "task.create" })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ op: "task.create", undoable: true });
    const action = mockState.db.tables.agentAction[0];
    expect(action).toMatchObject({
      actor: "mcp",
      userId: OWNER_ID,
      workspaceId: WORKSPACE_ID,
    });

    const foreign = await undoActionRoute(
      request(`/api/agent/actions/${body.actionId}/undo`, {
        token: OTHER_TOKEN,
      }),
      params({ id: body.actionId })
    );
    expect(foreign.status).toBe(404);

    const undone = await undoActionRoute(
      request(`/api/agent/actions/${body.actionId}/undo`, {
        token: OWNER_TOKEN,
      }),
      params({ id: body.actionId })
    );
    expect(undone.status).toBe(200);
    expect(taskRow(mockState.db, body.result.task.id).isArchived).toBe(true);
  });

  it("returns 409 with the conflicting rows when undo would overwrite a later change", async () => {
    const task = await seedTask(mockState.db);
    const response = await runOpRoute(
      request("/api/connect/ops/task.update", {
        token: OWNER_TOKEN,
        body: { taskId: task.id, title: "Agent" },
      }),
      params({ name: "task.update" })
    );
    const { actionId } = await response.json();
    await (
      mockState.db.client.task as {
        update: (args: unknown) => Promise<unknown>;
      }
    ).update({
      where: { id: task.id },
      data: { title: "Person" },
    });
    const undone = await undoActionRoute(
      request(`/api/agent/actions/${actionId}/undo`, { token: OWNER_TOKEN }),
      params({ id: actionId })
    );
    expect(undone.status).toBe(409);
    expect(await undone.json()).toMatchObject({ status: "undo_conflict" });
    expect(taskRow(mockState.db, task.id).title).toBe("Person");
  });

  it("maps validation, unknown op, and viewer errors to 400, 404 and 403", async () => {
    const invalid = await runOpRoute(
      request("/api/connect/ops/task.create", {
        token: OWNER_TOKEN,
        body: { title: "x", hacker: true },
      }),
      params({ name: "task.create" })
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ code: "INVALID_INPUT" });

    const unknown = await runOpRoute(
      request("/api/connect/ops/task.explode", {
        token: OWNER_TOKEN,
        body: {},
      }),
      params({ name: "task.explode" })
    );
    expect(unknown.status).toBe(404);

    role = WorkspaceRole.VIEWER;
    const viewer = await runOpRoute(
      request("/api/connect/ops/task.create", {
        token: OWNER_TOKEN,
        body: { title: "x" },
      }),
      params({ name: "task.create" })
    );
    expect(viewer.status).toBe(403);
    expect(mockState.db.tables.task).toHaveLength(0);
  });
});

// OAuth grants carry only the scopes the person consented to. The resolver
// answers for test tokens that never touch the OAuth tables.
const GRANTS: Record<string, BearerAuth["scopes"]> = {
  tst_read: ["needt.read"],
  tst_write: ["needt.read", "needt.write"],
  tst_mail: ["needt.read", "needt.write", "mail.read"],
};
registerBearerResolver(async (token) =>
  GRANTS[token]
    ? {
        userId: OWNER_ID,
        kind: "oauth",
        clientId: "client-1",
        scopes: GRANTS[token],
        workspaceId: WORKSPACE_ID,
      }
    : null
);

describe("connector ops API token scopes", () => {
  const run = (name: string, token: string, body: unknown = {}) =>
    runOpRoute(
      request(`/api/connect/ops/${name}`, { token, body }),
      params({ name })
    );

  it("refuses a read-only token on every write op, before anything runs", async () => {
    const task = await seedTask(mockState.db);
    const attempts: [string, unknown][] = [
      ["task.create", { title: "Sneaky" }],
      ["task.archive", { taskId: task.id }],
      ["task.detach", { taskId: task.id, attachmentId: "a1" }],
      ["event.create", { title: "x", start: "2026-10-22T09:00:00Z" }],
      ["page.create", { title: "x" }],
      ["project.create", { name: "x" }],
      ["personal.create", { kind: "lunch", start: "2026-10-22T12:00:00Z" }],
      ["starter.create", {}],
    ];
    for (const [name, body] of attempts) {
      const response = await run(name, "tst_read", body);
      expect([name, response.status]).toEqual([name, 403]);
      expect(await response.json()).toMatchObject({
        error: "insufficient_scope",
        scope: expect.stringContaining("needt.write"),
      });
    }
    expect(mockState.db.tables.agentAction).toHaveLength(0);
    expect(mockState.db.tables.task).toHaveLength(1);
    expect(taskRow(mockState.db, task.id).isArchived).toBeFalsy();
  });

  it("still lets a read-only token run the read ops", async () => {
    await seedTask(mockState.db);
    const response = await run("task.list", "tst_read");
    expect(response.status).toBe(200);
    expect(enforceRateLimits).not.toHaveBeenCalled();
  });

  it("lets a write token change data", async () => {
    const response = await run("task.create", "tst_write", { title: "Ok" });
    expect(response.status).toBe(200);
    expect(mockState.db.tables.task).toHaveLength(1);
  });

  it("needs mail.read as well for an op that copies mail", async () => {
    const withoutMail = await run("mail.to_task", "tst_write", {
      messageId: "m1",
    });
    expect(withoutMail.status).toBe(403);
    expect(await withoutMail.json()).toMatchObject({
      error: "insufficient_scope",
      scope: expect.stringContaining("mail.read"),
    });

    // With the consent it reaches the op, which finds no such message.
    const withMail = await run("mail.to_task", "tst_mail", {
      messageId: "m1",
    });
    expect(withMail.status).toBe(404);
  });

  it("applies the per-person write limit to writes only", async () => {
    jest
      .mocked(enforceRateLimits)
      .mockResolvedValueOnce(
        NextResponse.json({ error: "Too many attempts." }, { status: 429 })
      );
    const limited = await run("task.create", "tst_write", { title: "Spam" });
    expect(limited.status).toBe(429);
    expect(enforceRateLimits).toHaveBeenCalledWith(
      [expect.objectContaining({ namespace: "connect:write", limit: 30 })],
      expect.objectContaining({ userId: OWNER_ID })
    );
    expect(mockState.db.tables.task).toHaveLength(0);
  });

  it("refuses an undo from a read-only token", async () => {
    const created = await run("task.create", "tst_write", { title: "Mine" });
    const { actionId } = await created.json();
    const refused = await undoActionRoute(
      request(`/api/agent/actions/${actionId}/undo`, { token: "tst_read" }),
      params({ id: actionId })
    );
    expect(refused.status).toBe(403);
    const task = mockState.db.tables.task[0];
    expect(task.isArchived).toBeFalsy();
  });
});
