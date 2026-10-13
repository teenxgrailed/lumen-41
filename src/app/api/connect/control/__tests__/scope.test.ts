import { NextRequest } from "next/server";

import { POST } from "@/app/api/connect/control/route";
import { authenticateBearer } from "@/services/connectors/bearer";
import { WorkspaceKind, WorkspaceRole } from "@prisma/client";

import { resolveWorkspaceAccess } from "@/lib/auth/workspace-auth";
import { prisma } from "@/lib/prisma";

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
jest.mock("@/services/scheduling/TaskSchedulingService", () => ({
  scheduleAllTasksForUser: jest.fn(),
}));
jest.mock("@/lib/task-block-push", () => ({
  schedulePushTaskBlock: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    connectorSettings: { findUnique: jest.fn() },
    task: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
    project: { findMany: jest.fn().mockResolvedValue([]) },
    calendarFeed: { findMany: jest.fn().mockResolvedValue([]) },
    calendarEvent: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));

function control(body: unknown, query = "") {
  return POST(
    new NextRequest(`http://localhost/api/connect/control${query}`, {
      method: "POST",
      headers: {
        authorization: "Bearer ndt_oat_token",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(resolveWorkspaceAccess).mockResolvedValue({
    enabled: true,
    workspaceId: "workspace-1",
    workspaceKind: WorkspaceKind.SHARED,
    role: WorkspaceRole.EDITOR,
    dataScope: { mode: "workspace", workspaceId: "workspace-1" },
  });
});

describe("POST /api/connect/control with an OAuth grant", () => {
  it("refuses a write from a read-only grant", async () => {
    jest.mocked(authenticateBearer).mockResolvedValue({
      userId: "user-1",
      kind: "oauth",
      scopes: ["needt.read"],
      workspaceId: "workspace-1",
    });
    const response = await control({ action: "complete_task", id: "t1" });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "insufficient_scope",
    });
    expect(prisma.task.findFirst).not.toHaveBeenCalled();
  });

  it("lets a read-only grant read the overview", async () => {
    jest.mocked(authenticateBearer).mockResolvedValue({
      userId: "user-1",
      kind: "oauth",
      scopes: ["needt.read"],
      workspaceId: "workspace-1",
    });
    const response = await control({ action: "overview" });
    expect(response.status).toBe(200);
  });

  it("keeps a grant inside its bound workspace", async () => {
    jest.mocked(authenticateBearer).mockResolvedValue({
      userId: "user-1",
      kind: "oauth",
      scopes: ["needt.read", "needt.write"],
      workspaceId: "workspace-1",
    });
    const response = await control(
      { action: "overview" },
      "?workspaceId=workspace-2"
    );
    expect(response.status).toBe(403);
    expect(resolveWorkspaceAccess).not.toHaveBeenCalled();
  });
});
