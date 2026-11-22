import { NextRequest } from "next/server";

import { recordActivation } from "@/lib/activation-events";
import { getMailMessage, updateMailMessage } from "@/lib/mail-db";
import { prisma } from "@/lib/prisma";

import { PATCH } from "../route";

jest.mock("@/lib/activation-events", () => ({ recordActivation: jest.fn() }));
jest.mock("@/lib/auth/api-auth", () => ({
  authenticateRequest: async () => ({
    userId: "user-1",
    workspace: { workspaceId: "ws-1", role: "OWNER" },
  }),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/mail-db", () => ({
  getMailMessage: jest.fn(),
  updateMailMessage: jest.fn(),
}));
jest.mock("@/lib/mail/providers", () => ({
  fetchGmailBody: jest.fn(),
  fetchImapBody: jest.fn(),
  fetchOutlookBody: jest.fn(),
}));
jest.mock("@/lib/mail/sanitize", () => ({ sanitizeMailHtml: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: { task: { create: jest.fn() } },
}));

const ctx = { params: Promise.resolve({ id: "m1" }) };
const patch = (body: unknown) =>
  new NextRequest("http://localhost/api/mail/messages/m1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(getMailMessage)
    .mockResolvedValue({ id: "m1", subject: "Invoice" } as never);
  jest.mocked(updateMailMessage).mockResolvedValue({ id: "m1" } as never);
  jest
    .mocked(prisma.task.create)
    .mockResolvedValue({ id: "t1", title: "Invoice", dueDate: null } as never);
});

describe("PATCH /api/mail/messages/[id] activation", () => {
  it("records task_created when a reminder task is made from the mail", async () => {
    const res = await PATCH(
      patch({ remindAt: "2026-12-01T09:00:00.000Z" }),
      ctx
    );
    expect(res?.status).toBe(201);
    expect(recordActivation).toHaveBeenCalledWith("task_created", "user-1", {
      source: "mail",
    });
  });

  it("does not record for a plain read or archive update", async () => {
    await PATCH(patch({ isRead: true }), ctx);
    expect(recordActivation).not.toHaveBeenCalled();
  });
});
