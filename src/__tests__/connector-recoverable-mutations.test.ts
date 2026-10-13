import { NextRequest } from "next/server";

import { POST } from "@/app/api/connect/control/route";
import {
  authenticateConnectorRequest,
  authenticateConnectorToken,
} from "@/services/connectors/auth";
import { WorkspaceKind, WorkspaceRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { schedulePushTaskBlock } from "@/lib/task-block-push";

jest.mock("@/services/connectors/auth");
jest.mock("@/services/scheduling/TaskSchedulingService", () => ({
  scheduleAllTasksForUser: jest.fn(),
}));
jest.mock("@/lib/task-block-push", () => ({
  schedulePushTaskBlock: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    task: {
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    scheduledBlock: { deleteMany: jest.fn() },
  },
}));

const taskModel = prisma.task as unknown as {
  findFirst: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
};

const workspace = {
  enabled: true,
  workspaceId: "workspace-1",
  workspaceKind: WorkspaceKind.SHARED,
  role: WorkspaceRole.EDITOR,
  dataScope: { mode: "workspace" as const, workspaceId: "workspace-1" },
};

function mutation(confirm?: boolean) {
  return new NextRequest("http://localhost/api/connect/control", {
    method: "POST",
    headers: { authorization: "Bearer token" },
    body: JSON.stringify({
      action: "delete_task",
      id: "task-1",
      ...(confirm === undefined ? {} : { confirm }),
    }),
  });
}

function restoreMutation() {
  return new NextRequest("http://localhost/api/connect/control", {
    method: "POST",
    headers: { authorization: "Bearer token" },
    body: JSON.stringify({ action: "restore_task", id: "task-1" }),
  });
}

describe("connector recoverable mutations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(authenticateConnectorToken).mockResolvedValue("user-1");
    jest.mocked(authenticateConnectorRequest).mockResolvedValue({
      userId: "user-1",
      workspace,
      bearer: {
        userId: "user-1",
        kind: "personal",
        scopes: ["needt.read", "needt.write", "mail.read"],
      },
    });
    taskModel.findFirst.mockResolvedValue({
      id: "task-1",
      title: "Ship release",
      assigneeId: "user-1",
      workspaceId: "workspace-1",
    });
    taskModel.update.mockResolvedValue({});
    taskModel.updateMany.mockResolvedValue({ count: 1 });
    (prisma.scheduledBlock.deleteMany as jest.Mock).mockResolvedValue({
      count: 1,
    });
  });

  it("shows the exact target before archiving", async () => {
    const response = await POST(mutation());

    expect(response!.status).toBe(400);
    expect(await response!.json()).toEqual(
      expect.objectContaining({
        confirmation: {
          action: "delete_task",
          target: { type: "task", id: "task-1", title: "Ship release" },
        },
      })
    );
    expect(taskModel.update).not.toHaveBeenCalled();
  });

  it("archives the task and preserves its row after confirmation", async () => {
    const response = await POST(mutation(true));

    expect(response!.status).toBe(200);
    expect(await response!.json()).toEqual(
      expect.objectContaining({ archived: true })
    );
    expect(taskModel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "task-1" },
        data: expect.objectContaining({
          isArchived: true,
          archivedAt: expect.any(Date),
        }),
      })
    );
    expect(schedulePushTaskBlock).toHaveBeenCalledWith("user-1", "task-1");
  });

  it("restores an archived task without recreating it", async () => {
    const response = await POST(restoreMutation());

    expect(response!.status).toBe(200);
    expect(taskModel.updateMany).toHaveBeenCalledWith({
      where: {
        id: "task-1",
        workspaceId: "workspace-1",
        isArchived: true,
      },
      data: { isArchived: false, archivedAt: null },
    });
  });
});
