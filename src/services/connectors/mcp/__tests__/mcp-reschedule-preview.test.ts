import { NextRequest } from "next/server";

import { POST } from "@/app/api/mcp/route";
import { runReschedulePreviewAction } from "@/services/ai/reschedule-preview-api";
import {
  type BearerAuth,
  authenticateBearer,
} from "@/services/connectors/bearer";
import { listMcpTools } from "@/services/connectors/mcp/tools";
import { WorkspaceKind, WorkspaceRole } from "@prisma/client";

import { resolveWorkspaceAccess } from "@/lib/auth/workspace-auth";

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
  sendConnectorWebhook: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/services/ai/reschedule-preview-api", () => ({
  runReschedulePreviewAction: jest.fn(),
}));
jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/security/rate-limit", () => ({
  enforceRateLimits: jest.fn().mockResolvedValue(null),
  ipRule: jest.fn(),
  accountRule: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({ prisma: {} }));

const token: BearerAuth = {
  userId: "user-1",
  kind: "personal",
  scopes: ["needt.read", "needt.write"],
};
const shared = {
  enabled: true,
  workspaceId: "workspace-1",
  workspaceKind: WorkspaceKind.SHARED,
  role: WorkspaceRole.EDITOR,
  dataScope: { mode: "workspace" as const, workspaceId: "workspace-1" },
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
  jest.mocked(authenticateBearer).mockResolvedValue(token);
  jest.mocked(resolveWorkspaceAccess).mockResolvedValue(shared);
  jest
    .mocked(runReschedulePreviewAction)
    .mockResolvedValue({ changes: [], previewToken: "p" } as never);
});

describe("MCP: needt_reschedule_preview", () => {
  it("is listed with taskIds, token and via", () => {
    const tool = listMcpTools().find(
      (t) => t.name === "needt_reschedule_preview"
    );
    expect(tool).toBeDefined();
    expect(Object.keys(tool!.inputSchema.properties ?? {})).toEqual(
      expect.arrayContaining(["action", "taskIds", "token", "via"])
    );
  });

  it("previews only the given tasks through the shared action", async () => {
    const result = await call("needt_reschedule_preview", {
      action: "preview",
      taskIds: ["a", "b"],
      via: "fill",
    });
    expect(result.isError).toBe(false);
    expect(result.payload).toEqual({ changes: [], previewToken: "p" });
    expect(runReschedulePreviewAction).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ workspaceId: "workspace-1" }),
      { action: "preview", taskIds: ["a", "b"], via: "fill" }
    );
  });

  it("offers home_missed as a via value", async () => {
    const tool = listMcpTools().find(
      (t) => t.name === "needt_reschedule_preview"
    );
    const via = (
      tool!.inputSchema.properties as Record<string, { enum?: string[] }>
    ).via;
    expect(via.enum).toEqual(["chat", "fill", "home_missed"]);
    await call("needt_reschedule_preview", {
      action: "apply",
      token: "p",
      via: "home_missed",
    });
    expect(runReschedulePreviewAction).toHaveBeenLastCalledWith(
      "user-1",
      expect.anything(),
      { action: "apply", token: "p", via: "home_missed" }
    );
  });

  it("applies with a token", async () => {
    await call("needt_reschedule_preview", { action: "apply", token: "p" });
    expect(runReschedulePreviewAction).toHaveBeenCalledWith(
      "user-1",
      expect.anything(),
      { action: "apply", token: "p" }
    );
  });

  it("refuses more than 100 ids", async () => {
    const result = await call("needt_reschedule_preview", {
      action: "preview",
      taskIds: Array.from({ length: 101 }, (_, i) => `t${i}`),
    });
    expect(result.isError).toBe(true);
    expect(runReschedulePreviewAction).not.toHaveBeenCalled();
  });
});
