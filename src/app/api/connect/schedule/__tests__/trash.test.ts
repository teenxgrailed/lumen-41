import { NextRequest } from "next/server";

import { POST as reschedule } from "@/app/api/connect/reschedule/route";
import { GET } from "@/app/api/connect/schedule/route";
import { authenticateConnectorRequest } from "@/services/connectors/auth";

import { prisma } from "@/lib/prisma";

jest.mock("@/services/connectors/auth", () => ({
  authenticateConnectorRequest: jest.fn(),
}));
jest.mock("@/services/connectors/webhooks", () => ({
  sendConnectorWebhook: jest.fn(),
}));
jest.mock("@/services/scheduling/TaskSchedulingService", () => ({
  scheduleAllTasksForUser: jest.fn(),
}));
jest.mock("@/lib/realtime/publish", () => ({
  publishRealtimeEventSafe: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: { task: { findMany: jest.fn().mockResolvedValue([]) } },
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(authenticateConnectorRequest).mockResolvedValue({
    userId: "user-1",
    workspace: {
      workspaceId: "w1",
      dataScope: { mode: "personal", userId: "user-1" },
    },
  } as never);
});

describe("connector schedule reads", () => {
  it("schedule excludes trashed tasks", async () => {
    await GET(new NextRequest("http://localhost/api/connect/schedule"));
    expect(
      jest.mocked(prisma.task.findMany).mock.calls[0][0]?.where
    ).toMatchObject({ trashedAt: null });
  });

  it("reschedule excludes trashed tasks", async () => {
    await reschedule(
      new NextRequest("http://localhost/api/connect/reschedule", {
        method: "POST",
      })
    );
    expect(
      jest.mocked(prisma.task.findMany).mock.calls[0][0]?.where
    ).toMatchObject({ trashedAt: null });
  });
});
