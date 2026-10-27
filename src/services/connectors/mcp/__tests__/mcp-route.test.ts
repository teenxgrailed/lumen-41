import { NextRequest, NextResponse } from "next/server";

import {
  DELETE,
  GET,
  MCP_IP_LIMIT_PER_MINUTE,
  MCP_USER_LIMIT_PER_MINUTE,
  MCP_WRITE_LIMIT_PER_MINUTE,
  POST,
} from "@/app/api/mcp/route";
import {
  type BearerAuth,
  authenticateBearer,
} from "@/services/connectors/bearer";
import { CONNECTOR_CONTROL_ACTIONS } from "@/services/connectors/control-actions";
import { MCP_TOOLS } from "@/services/connectors/mcp/tools";
import { WorkspaceKind, WorkspaceRole } from "@prisma/client";

import { resolveWorkspaceAccess } from "@/lib/auth/workspace-auth";
import { prisma } from "@/lib/prisma";
import {
  accountRule,
  enforceRateLimits,
  ipRule,
} from "@/lib/security/rate-limit";

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
jest.mock("@/services/connectors/webhooks", () => ({
  sendConnectorWebhook: jest.fn(),
}));
jest.mock("@/services/scheduling/TaskSchedulingService", () => ({
  scheduleAllTasksForUser: jest.fn(),
}));
jest.mock("@/lib/task-block-push", () => ({
  schedulePushTaskBlock: jest.fn(),
}));
jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/security/rate-limit", () => ({
  enforceRateLimits: jest.fn(),
  ipRule: jest.fn((_req, namespace, limit) => ({ namespace, limit })),
  accountRule: jest.fn((_value, namespace, limit) => ({ namespace, limit })),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    task: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    habit: { findMany: jest.fn() },
    mailMessage: { findFirst: jest.fn() },
    scheduledBlock: { deleteMany: jest.fn() },
    user: { findUnique: jest.fn() },
    workspaceMember: { findMany: jest.fn() },
  },
}));

const workspace = {
  enabled: true,
  workspaceId: "workspace-1",
  workspaceKind: WorkspaceKind.SHARED,
  role: WorkspaceRole.EDITOR,
  dataScope: { mode: "workspace" as const, workspaceId: "workspace-1" },
};

const personal: BearerAuth = {
  userId: "user-1",
  kind: "personal",
  scopes: ["needt.read", "needt.write", "mail.read"],
};

function rpc(
  body: unknown,
  headers: Record<string, string> = { authorization: "Bearer good-token" }
) {
  return new NextRequest("http://localhost/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function call(
  name: string,
  args: Record<string, unknown>,
  headers?: Record<string, string>
) {
  return POST(
    rpc(
      {
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: { name, arguments: args },
      },
      headers
    )
  );
}

const namespaces = () =>
  jest
    .mocked(enforceRateLimits)
    .mock.calls.flatMap(([rules]) =>
      rules.map((rule) => (rule as { namespace: string }).namespace)
    );

describe("remote MCP endpoint", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(authenticateBearer)
      .mockImplementation(async (request) =>
        request.headers.get("authorization") === "Bearer good-token"
          ? personal
          : null
      );
    jest.mocked(resolveWorkspaceAccess).mockResolvedValue(workspace);
    jest.mocked(enforceRateLimits).mockResolvedValue(null);
  });

  it("initializes, negotiates 2025-11-25, and lists the tool catalogue", async () => {
    const init = await POST(
      rpc({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-11-25", capabilities: {} },
      })
    );
    const initBody = await init.json();
    expect(initBody.result.protocolVersion).toBe("2025-11-25");
    expect(initBody.result.capabilities.tools).toBeDefined();

    const older = await POST(
      rpc({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-03-26" },
      })
    );
    expect((await older.json()).result.protocolVersion).toBe("2025-03-26");

    const notified = await POST(
      rpc({ jsonrpc: "2.0", method: "notifications/initialized" })
    );
    expect(notified.status).toBe(202);

    const list = await POST(
      rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" })
    );
    const { result } = await list.json();
    // A personal token never carries needt.admin.read: admin tools stay hidden.
    expect(result.tools.map((tool: { name: string }) => tool.name)).toEqual(
      MCP_TOOLS.filter((tool) => !tool.name.startsWith("needt_admin_")).map(
        (tool) => tool.name
      )
    );
    expect(result.tools[0].name).toBe("needt_whoami");
    for (const tool of result.tools) {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.properties.workspaceId).toMatchObject({
        type: "string",
      });
      expect(typeof tool.annotations.readOnlyHint).toBe("boolean");
      expect(typeof tool.annotations.destructiveHint).toBe("boolean");
    }
  });

  it("refuses JSON-RPC batches", async () => {
    const response = await POST(
      rpc([
        { jsonrpc: "2.0", id: 1, method: "ping" },
        { jsonrpc: "2.0", id: 2, method: "ping" },
      ])
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatchObject({
      code: -32600,
      message: "Batch requests are not supported",
    });
  });

  it("challenges a missing or wrong token with the canonical metadata URL", async () => {
    const missing = await POST(
      rpc({ jsonrpc: "2.0", id: 1, method: "ping" }, {})
    );
    expect(missing.status).toBe(401);
    expect(missing.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="https://mcp.needt.app/.well-known/oauth-protected-resource/mcp", scope="needt.read needt.write"'
    );

    const wrong = await POST(
      rpc(
        { jsonrpc: "2.0", id: 1, method: "ping" },
        { authorization: "Bearer nope" }
      )
    );
    expect(wrong.status).toBe(401);
    // Only the per-IP limit runs before the token is known.
    expect(namespaces()).toEqual(["mcp:ip", "mcp:ip"]);
  });

  it("limits 600/min per IP and 120/min per person on every call", async () => {
    await POST(rpc({ jsonrpc: "2.0", id: 1, method: "ping" }));
    expect(ipRule).toHaveBeenCalledWith(
      expect.anything(),
      "mcp:ip",
      MCP_IP_LIMIT_PER_MINUTE,
      60
    );
    expect(accountRule).toHaveBeenCalledWith(
      "user-1",
      "mcp:user",
      MCP_USER_LIMIT_PER_MINUTE,
      60
    );
    expect([
      MCP_IP_LIMIT_PER_MINUTE,
      MCP_USER_LIMIT_PER_MINUTE,
      MCP_WRITE_LIMIT_PER_MINUTE,
    ]).toEqual([600, 120, 30]);
    expect(namespaces()).toEqual(["mcp:ip", "mcp:user"]);
  });

  it("limits writes to 30/min and leaves reads out of it", async () => {
    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);
    await call("needt_list", { type: "task" });
    expect(namespaces()).not.toContain("mcp:write");

    jest.mocked(enforceRateLimits).mockClear();
    jest.mocked(accountRule).mockClear();
    await call("needt_control", { action: "complete_task" });
    expect(accountRule).toHaveBeenCalledWith(
      "user-1",
      "mcp:write",
      MCP_WRITE_LIMIT_PER_MINUTE,
      60
    );
  });

  it("returns 429 when a limit refuses", async () => {
    jest
      .mocked(enforceRateLimits)
      .mockResolvedValue(NextResponse.json({ error: "slow" }, { status: 429 }));
    const response = await POST(rpc({ jsonrpc: "2.0", id: 1, method: "ping" }));
    expect(response.status).toBe(429);
  });

  it("answers GET and DELETE with 405", async () => {
    expect((await GET()).status).toBe(405);
    expect((await DELETE()).status).toBe(405);
  });

  it("answers 403 insufficient_scope, naming every scope, for a read-only token that writes", async () => {
    jest.mocked(authenticateBearer).mockResolvedValue({
      userId: "user-1",
      kind: "oauth",
      clientId: "client-1",
      scopes: ["needt.read"],
    });
    const response = await call("needt_create_task", { title: "x" });
    expect(response.status).toBe(403);
    expect(response.headers.get("www-authenticate")).toContain(
      'error="insufficient_scope", scope="needt.read needt.write"'
    );
    expect((await response.json()).error).toBe("insufficient_scope");
  });

  it("needs mail.read to list or read mail", async () => {
    jest.mocked(authenticateBearer).mockResolvedValue({
      userId: "user-1",
      kind: "oauth",
      scopes: ["needt.read", "needt.write"],
    });
    const mail = await call("needt_list", { type: "mail" });
    expect(mail.status).toBe(403);
    // Only a call about mail asks for mail.read.
    expect(mail.headers.get("www-authenticate")).toContain(
      'scope="needt.read needt.write mail.read"'
    );
    expect((await call("needt_get", { type: "mail", id: "m1" })).status).toBe(
      403
    );
    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);
    expect((await call("needt_list", { type: "task" })).status).toBe(200);
  });

  it("forwards needt_control to the control route with the caller's token and workspace", async () => {
    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);
    const response = await call(
      "needt_control",
      { action: "complete_task" },
      {
        authorization: "Bearer good-token",
        "x-workspace-id": "workspace-1",
      }
    );
    const body = await response.json();
    // complete_task without an id is refused by the route itself.
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain("id is required");

    // The in-process route call authenticated the same bearer again.
    const forwarded = jest.mocked(authenticateBearer).mock.calls[1][0];
    expect(forwarded.headers.get("authorization")).toBe("Bearer good-token");
    expect(resolveWorkspaceAccess).toHaveBeenCalledWith(
      expect.objectContaining({ requestedWorkspaceId: "workspace-1" })
    );
  });

  it("takes workspaceId as a tool argument and keeps it out of the tool's own arguments", async () => {
    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);
    await call("needt_list", { type: "task", workspaceId: "workspace-9" });
    expect(resolveWorkspaceAccess).toHaveBeenCalledWith(
      expect.objectContaining({ requestedWorkspaceId: "workspace-9" })
    );

    jest.mocked(resolveWorkspaceAccess).mockClear();
    await call("needt_control", {
      action: "complete_task",
      workspaceId: "workspace-9",
    });
    expect(resolveWorkspaceAccess).toHaveBeenCalledWith(
      expect.objectContaining({ requestedWorkspaceId: "workspace-9" })
    );
  });

  it("keeps an OAuth grant inside the workspace it was given", async () => {
    jest.mocked(authenticateBearer).mockResolvedValue({
      userId: "user-1",
      kind: "oauth",
      scopes: ["needt.read", "needt.write"],
      workspaceId: "workspace-1",
    });
    const other = await call("needt_list", {
      type: "task",
      workspaceId: "workspace-2",
    });
    const body = await other.json();
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain("another workspace");
    expect(prisma.task.findMany).not.toHaveBeenCalled();

    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);
    await call("needt_list", { type: "task" });
    expect(resolveWorkspaceAccess).toHaveBeenCalledWith(
      expect.objectContaining({ requestedWorkspaceId: "workspace-1" })
    );
  });

  it("needt_get type=mail returns metadata only, never the body", async () => {
    // Mail is personal: it answers from the personal workspace only.
    jest.mocked(resolveWorkspaceAccess).mockResolvedValue({
      ...workspace,
      workspaceKind: WorkspaceKind.PERSONAL,
    });
    (prisma.mailMessage.findFirst as jest.Mock).mockImplementation(
      async ({ select }) =>
        Object.fromEntries(
          Object.keys(select).map((key) => [key, `value-of-${key}`])
        )
    );
    const response = await call("needt_get", { type: "mail", id: "m1" });
    const text = (await response.json()).result.content[0].text as string;
    const { select } = (prisma.mailMessage.findFirst as jest.Mock).mock
      .calls[0][0];
    expect(select).not.toHaveProperty("bodyHtml");
    expect(text).not.toContain("bodyHtml");
    expect(JSON.parse(text)).toHaveProperty("subject");
  });

  it("needt_control overview is a read: read scope, outside the write limit", async () => {
    jest.mocked(authenticateBearer).mockResolvedValue({
      userId: "user-1",
      kind: "oauth",
      scopes: ["needt.read"],
    });
    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);
    const overview = await call("needt_control", { action: "overview" });
    expect(overview.status).toBe(200);
    expect(namespaces()).not.toContain("mcp:write");

    const write = await call("needt_control", {
      action: "complete_task",
      id: "t1",
    });
    expect(write.status).toBe(403);
  });

  it("answers 413 for a body over 256 KB, declared or not", async () => {
    const declared = await POST(
      new NextRequest("http://localhost/api/mcp", {
        method: "POST",
        headers: {
          authorization: "Bearer good-token",
          "content-type": "application/json",
          "content-length": String(300 * 1024),
        },
        body: "{}",
      })
    );
    expect(declared.status).toBe(413);

    // Multi-byte characters: 100k of them is ~300 KB on the wire.
    const big = await POST(
      rpc({
        jsonrpc: "2.0",
        id: 1,
        method: "ping",
        params: { x: "é".repeat(140_000) },
      })
    );
    expect(big.status).toBe(413);
  });

  it("refuses a browser call from a foreign origin", async () => {
    const response = await POST(
      rpc(
        { jsonrpc: "2.0", id: 1, method: "ping" },
        { authorization: "Bearer good-token", origin: "https://evil.example" }
      )
    );
    expect(response.status).toBe(403);
    expect(authenticateBearer).not.toHaveBeenCalled();
  });

  it("needt_whoami shows an OAuth grant only its bound workspace", async () => {
    jest.mocked(authenticateBearer).mockResolvedValue({
      userId: "user-1",
      kind: "oauth",
      scopes: ["needt.read"],
      workspaceId: "workspace-1",
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: "user-1" });
    (prisma.workspaceMember.findMany as jest.Mock).mockResolvedValue([
      {
        role: "OWNER",
        workspace: { id: "workspace-1", name: "A", kind: "SHARED" },
      },
      {
        role: "OWNER",
        workspace: { id: "workspace-2", name: "B", kind: "SHARED" },
      },
    ]);
    const response = await call("needt_whoami", {});
    const body = JSON.parse((await response.json()).result.content[0].text);
    expect(body.workspaces.map((w: { id: string }) => w.id)).toEqual([
      "workspace-1",
    ]);
  });

  it("needt_whoami reports the token, its scopes and the workspaces", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "user-1",
      name: "Dev",
      email: "dev@example.com",
    });
    (prisma.workspaceMember.findMany as jest.Mock).mockResolvedValue([
      {
        role: "OWNER",
        workspace: { id: "workspace-1", name: "Team", kind: "SHARED" },
      },
    ]);
    const response = await call("needt_whoami", {});
    const body = await response.json();
    expect(JSON.parse(body.result.content[0].text)).toMatchObject({
      user: { id: "user-1" },
      token: {
        kind: "personal",
        scopes: ["needt.read", "needt.write", "mail.read"],
      },
      workspace: { id: "workspace-1" },
      workspaces: [{ id: "workspace-1", role: "OWNER" }],
    });
  });

  it("returns a tool error, not a 500, for a delete without confirm", async () => {
    (prisma.task.findFirst as jest.Mock).mockResolvedValue({
      id: "task-1",
      title: "Ship release",
      assigneeId: "user-1",
      workspaceId: "workspace-1",
    });
    const response = await call("needt_control", {
      action: "delete_task",
      id: "task-1",
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain("confirm");
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it("derives the needt_control action enum from the route's action list", async () => {
    const list = await POST(
      rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" })
    );
    const { result } = await list.json();
    const control = result.tools.find(
      (tool: { name: string }) => tool.name === "needt_control"
    );
    expect(control.inputSchema.properties.action.enum).toEqual([
      ...CONNECTOR_CONTROL_ACTIONS,
    ]);
    expect(control.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    });
  });

  it("scopes needt_list to the caller's workspace and caps the limit", async () => {
    (prisma.task.findMany as jest.Mock).mockResolvedValue([
      { id: "task-1", title: "Mine", workspaceId: "workspace-1" },
    ]);
    const response = await call("needt_list", { type: "task", limit: 10 });
    const body = await response.json();
    expect(JSON.parse(body.result.content[0].text).items).toEqual([
      {
        id: "task-1",
        title: "Mine",
        workspaceId: "workspace-1",
        originPageId: null,
      },
    ]);
    const args = (prisma.task.findMany as jest.Mock).mock.calls[0][0];
    expect(args.where).toMatchObject({ workspaceId: "workspace-1" });
    expect(args.take).toBe(11);

    const tooMany = await call("needt_list", { type: "task", limit: 500 });
    const tooManyBody = await tooMany.json();
    expect(tooManyBody.result.isError).toBe(true);
  });

  it("needt_list filters tasks by originPageId and shows it on each row", async () => {
    (prisma.task.findMany as jest.Mock).mockResolvedValue([
      {
        id: "task-2",
        title: "From a doc",
        originKind: "doc",
        originId: "page-9",
      },
    ]);
    const response = await call("needt_list", {
      type: "task",
      originPageId: "page-9",
    });
    const body = await response.json();
    const items = JSON.parse(body.result.content[0].text).items;
    expect(items[0].originPageId).toBe("page-9");
    const args = (prisma.task.findMany as jest.Mock).mock.calls.at(-1)[0];
    expect(args.where).toMatchObject({
      originKind: "doc",
      originId: "page-9",
    });
  });

  it("advertises originPageId on create, update and list", async () => {
    const list = await POST(
      rpc({ jsonrpc: "2.0", id: 3, method: "tools/list" })
    );
    const { result } = await list.json();
    const props = (name: string) =>
      result.tools.find((t: { name: string }) => t.name === name).inputSchema
        .properties;
    expect(props("needt_create_task").originPageId).toBeDefined();
    expect(props("needt_update_task").originPageId).toBeDefined();
    expect(props("needt_list").originPageId).toBeDefined();
  });
});
