import { NextRequest } from "next/server";

import { POST } from "@/app/api/ai/chat/route";
import { buildAgentPromptForUser } from "@/services/ai/context";
import {
  getConfiguredSchedulerAI,
  getPreparedSchedulerAI,
} from "@/services/ai/settings";
import { WorkspaceKind, WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";
import { schedulePushTaskBlock } from "@/lib/task-block-push";

jest.mock("@/services/ai/context", () => ({
  buildAgentPromptForUser: jest.fn(),
}));
jest.mock("@/services/ai/settings", () => ({
  getConfiguredSchedulerAI: jest.fn(),
  getPreparedSchedulerAI: jest.fn(),
}));
jest.mock("@/lib/auth/api-auth", () => ({
  authenticateRequest: jest.fn(),
}));
jest.mock("@/lib/realtime/publish", () => ({
  publishRealtimeEvent: jest.fn(),
}));
jest.mock("@/lib/task-block-push", () => ({
  schedulePushTaskBlock: jest.fn(),
}));
jest.mock("@/lib/security/rate-limit", () => ({
  enforceRateLimits: jest.fn().mockResolvedValue(null),
  ipRule: jest.fn(),
  accountRule: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    aiConversation: {
      create: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    aiMessage: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    task: { findFirst: jest.fn(), update: jest.fn() },
    scheduledBlock: { deleteMany: jest.fn() },
  },
}));

const taskModel = prisma.task as unknown as {
  findFirst: jest.Mock;
  update: jest.Mock;
};

const workspace = {
  enabled: true,
  workspaceId: "workspace-1",
  workspaceKind: WorkspaceKind.SHARED,
  role: WorkspaceRole.EDITOR,
  dataScope: { mode: "workspace" as const, workspaceId: "workspace-1" },
};

function request(confirmed = false, conversationId?: string) {
  return new NextRequest("http://localhost/api/ai/chat", {
    method: "POST",
    body: JSON.stringify({
      message: "Archive the release task",
      confirmed,
      conversationId,
    }),
  });
}

async function streamItems(response: Response) {
  return (await response.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

describe("AI archive confirmation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(authenticateRequest).mockResolvedValue({
      userId: "user-1",
      workspace,
    });
    jest
      .mocked(buildAgentPromptForUser)
      .mockResolvedValue({ systemPrompt: "system", contextBlock: "" });
    const configured = {
      settings: {
        allowParseTasks: true,
        allowFullAuto: true,
        soulPreset: "BALANCED",
      },
      ai: {
        selectChatTool: jest.fn().mockResolvedValue({
          name: "delete_task",
          arguments: { taskId: "task-1" },
        }),
      },
      source: "byok",
      usage: { plan: "PRO", allowed: true, mode: "normal" },
    };
    jest
      .mocked(getConfiguredSchedulerAI)
      .mockResolvedValue(configured as never);
    jest.mocked(getPreparedSchedulerAI).mockResolvedValue({
      ...configured,
      hostedMode: null,
    } as never);
    (prisma.aiConversation.create as jest.Mock).mockResolvedValue({
      id: "conversation-1",
    });
    (prisma.aiConversation.findFirst as jest.Mock).mockResolvedValue({
      id: "conversation-1",
    });
    (prisma.aiConversation.updateMany as jest.Mock).mockResolvedValue({});
    (prisma.aiMessage.create as jest.Mock).mockResolvedValue({});
    (prisma.aiMessage.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.aiMessage.findFirst as jest.Mock).mockResolvedValue({
      id: "confirmation-1",
      toolPayload: {
        requestedTool: "delete_task",
        arguments: { taskId: "task-1" },
      },
    });
    (prisma.aiMessage.updateMany as jest.Mock).mockResolvedValue({});
    taskModel.findFirst.mockResolvedValue({
      id: "task-1",
      title: "Ship release",
      workspaceId: "workspace-1",
      assigneeId: "user-1",
    });
    taskModel.update.mockResolvedValue({});
    (prisma.scheduledBlock.deleteMany as jest.Mock).mockResolvedValue({
      count: 1,
    });
  });

  it("names the exact task before changing it", async () => {
    const items = await streamItems((await POST(request()))!);

    expect(prisma.aiConversation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        workspaceId: "workspace-1",
      }),
    });
    expect(items[0]).toEqual(
      expect.objectContaining({
        type: "meta",
        requiresConfirm: true,
        toolName: "confirmation_required",
        toolPayload: expect.objectContaining({
          target: { type: "task", id: "task-1", title: "Ship release" },
        }),
      })
    );
    expect(taskModel.update).not.toHaveBeenCalled();
  });

  it("rejects an expired confirmation before claiming hosted AI", async () => {
    (prisma.aiConversation.findFirst as jest.Mock).mockResolvedValue({
      id: "conversation-1",
    });
    (prisma.aiMessage.findFirst as jest.Mock).mockResolvedValue(null);

    const response = (await POST(request(true, "conversation-1")))!;

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "The confirmation expired. Ask to perform the action again.",
    });
    expect(getPreparedSchedulerAI).not.toHaveBeenCalled();
  });

  it("archives instead of deleting after confirmation", async () => {
    const items = await streamItems(
      (await POST(request(true, "conversation-1")))!
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
    expect(prisma.aiMessage.updateMany).toHaveBeenCalledWith({
      where: {
        id: "confirmation-1",
        conversationId: "conversation-1",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      data: { requiresConfirm: false },
    });
    expect(items[0]).toEqual(
      expect.objectContaining({
        toolPayload: expect.objectContaining({
          taskId: "task-1",
          href: "/tasks?taskId=task-1",
        }),
      })
    );
  });

  it("rejects confirmation replay without a pending server record", async () => {
    (prisma.aiMessage.findFirst as jest.Mock).mockResolvedValue(null);

    const response = (await POST(request(true, "conversation-1")))!;

    expect(response.status).toBe(409);
    expect(taskModel.update).not.toHaveBeenCalled();
  });

  it("does not reuse a conversation from another workspace", async () => {
    (prisma.aiConversation.findFirst as jest.Mock).mockResolvedValue(null);

    const response = (await POST(request(false, "other-workspace-chat")))!;

    expect(response.status).toBe(404);
    expect(prisma.aiConversation.findFirst).toHaveBeenCalledWith({
      where: {
        id: "other-workspace-chat",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
    });
    expect(prisma.aiMessage.create).not.toHaveBeenCalled();
  });
});
