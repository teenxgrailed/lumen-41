import { NextRequest } from "next/server";

import { recordActivation } from "@/lib/activation-events";
import { prisma } from "@/lib/prisma";

import { POST } from "../route";

jest.mock("@/lib/activation-events", () => ({ recordActivation: jest.fn() }));
jest.mock("@/lib/auth/api-auth", () => ({
  authenticateRequest: async () => ({
    userId: "user-1",
    workspace: { workspaceId: "ws-1" },
  }),
}));
jest.mock("@/lib/auth/page-auth", () => ({
  resolvePageAccess: jest.fn(async () => true),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    task: { create: jest.fn() },
    project: { create: jest.fn() },
  },
}));

const ctx = { params: Promise.resolve({ id: "page-1" }) };
const req = (body: unknown) =>
  new NextRequest("http://localhost/api/pages/page-1/entities", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(prisma.task.create)
    .mockResolvedValue({ id: "t1", title: "Call" } as never);
  jest
    .mocked(prisma.project.create)
    .mockResolvedValue({ id: "p1", name: "Trip" } as never);
});

describe("POST /api/pages/[id]/entities activation", () => {
  it("records task_created for an inline task", async () => {
    const res = await POST(req({ type: "task", title: "Call" }), ctx);
    expect(res?.status).toBe(201);
    expect(recordActivation).toHaveBeenCalledWith("task_created", "user-1", {
      source: "page",
    });
  });

  it("does not record for an inline project", async () => {
    await POST(req({ type: "project", title: "Trip" }), ctx);
    expect(recordActivation).not.toHaveBeenCalled();
  });

  it("does not record when the request is rejected", async () => {
    const res = await POST(req({ type: "task" }), ctx);
    expect(res?.status).toBe(400);
    expect(recordActivation).not.toHaveBeenCalled();
  });
});
