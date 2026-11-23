import { NextRequest } from "next/server";

import { POST } from "@/app/api/connect/control/route";
import { authenticateBearer } from "@/services/connectors/bearer";
import { WorkspaceKind, WorkspaceRole } from "@prisma/client";

import { resolveWorkspaceAccess } from "@/lib/auth/workspace-auth";
import { prisma } from "@/lib/prisma";

/** delete_task cannot reach another member's idea in a shared workspace. */

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
jest.mock("@/lib/security/rate-limit", () => ({
  ...jest.requireActual("@/lib/security/rate-limit"),
  enforceRateLimits: jest.fn().mockResolvedValue(null),
  accountRule: jest.fn(),
}));
jest.mock("@/lib/task-block-push", () => ({
  schedulePushTaskBlock: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    connectorSettings: { findUnique: jest.fn() },
    task: { findFirst: jest.fn(), update: jest.fn() },
    scheduledBlock: { deleteMany: jest.fn() },
  },
}));

const task = prisma.task as unknown as Record<string, jest.Mock>;

const rows = [
  {
    id: "their-idea",
    kind: "IDEA",
    userId: "user-2",
    workspaceId: "workspace-1",
    title: "Their idea",
    assigneeId: null,
  },
  {
    id: "my-idea",
    kind: "IDEA",
    userId: "user-1",
    workspaceId: "workspace-1",
    title: "My idea",
    assigneeId: null,
  },
  {
    id: "their-task",
    kind: "TASK",
    userId: "user-2",
    workspaceId: "workspace-1",
    title: "Their task",
    assigneeId: null,
  },
];

const del = (id: string, confirm = true) =>
  POST(
    new NextRequest("http://localhost/api/connect/control", {
      method: "POST",
      headers: {
        authorization: "Bearer ndt_oat_token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ action: "delete_task", id, confirm }),
    })
  );

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(authenticateBearer).mockResolvedValue({
    userId: "user-1",
    kind: "oauth",
    scopes: ["needt.read", "needt.write"],
    workspaceId: "workspace-1",
  });
  jest.mocked(resolveWorkspaceAccess).mockResolvedValue({
    enabled: true,
    workspaceId: "workspace-1",
    workspaceKind: WorkspaceKind.SHARED,
    role: WorkspaceRole.EDITOR,
    dataScope: { mode: "workspace", workspaceId: "workspace-1" },
  });
  // The where clause as the database would apply it to the fixture rows.
  task.findFirst.mockImplementation(async ({ where }) => {
    const found = rows.find((r) => r.id === where.id);
    if (!found || where.workspaceId !== found.workspaceId) return null;
    const not = where.NOT as
      | { kind: string; userId: { not: string } }
      | undefined;
    if (not && found.kind === not.kind && found.userId !== not.userId.not)
      return null;
    return found;
  });
});

describe("POST /api/connect/control delete_task", () => {
  it("does not find another member's idea, even confirmed", async () => {
    for (const confirm of [false, true]) {
      const res = await del("their-idea", confirm);
      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({ error: "Object not found" });
    }
    expect(task.update).not.toHaveBeenCalled();
  });

  it("still archives the caller's own idea", async () => {
    const res = await del("my-idea");
    expect(res.status).toBe(200);
    expect(task.update).toHaveBeenCalledTimes(1);
  });

  it("still archives another member's task in the workspace", async () => {
    const res = await del("their-task");
    expect(res.status).toBe(200);
    expect(task.update).toHaveBeenCalledTimes(1);
  });
});
