import { NextRequest } from "next/server";

import { POST } from "@/app/api/mcp/route";
import {
  type BearerAuth,
  authenticateBearer,
} from "@/services/connectors/bearer";
import { createFakePrisma } from "@/services/ops/__tests__/fake-prisma";
import {
  createReminder,
  deleteReminder,
  listReminders,
  updateReminder,
} from "@/services/reminders/reminders";
import { WorkspaceKind, WorkspaceRole } from "@prisma/client";

import { resolveWorkspaceAccess } from "@/lib/auth/workspace-auth";

const mockState = { db: createFakePrisma() };

jest.mock("@/services/reminders/reminders", () => ({
  ...jest.requireActual("@/services/reminders/reminders"),
  listReminders: jest.fn(),
  createReminder: jest.fn(),
  updateReminder: jest.fn(),
  deleteReminder: jest.fn(),
}));
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
jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/realtime/publish", () => ({
  publishRealtimeEvent: jest.fn(),
  publishRealtimeEventSafe: jest.fn(),
}));
jest.mock("@/lib/security/rate-limit", () => ({
  enforceRateLimits: jest.fn().mockResolvedValue(null),
  ipRule: jest.fn(),
  accountRule: jest.fn(),
}));
jest.mock("@/lib/entitlements", () => ({ getPlan: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockState.db.client;
  },
}));

const personal = {
  enabled: true,
  workspaceId: "personal-1",
  workspaceKind: WorkspaceKind.PERSONAL,
  role: WorkspaceRole.OWNER,
  dataScope: { mode: "workspace" as const, workspaceId: "personal-1" },
};

const readOnly: BearerAuth = {
  userId: "user-1",
  kind: "personal",
  scopes: ["needt.read"],
};
const readWrite: BearerAuth = {
  ...readOnly,
  scopes: ["needt.read", "needt.write"],
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
    isError: body.result?.isError === true || !!body.error,
    payload: body.result ? JSON.parse(body.result.content[0].text) : body,
  };
}

const view = { id: "r1", taskId: "t1", label: "10 min before" };

beforeEach(() => {
  jest.clearAllMocks();
  mockState.db = createFakePrisma();
  jest.mocked(authenticateBearer).mockResolvedValue(readWrite);
  jest.mocked(resolveWorkspaceAccess).mockResolvedValue(personal);
});

describe("needt_reminders", () => {
  it("lists with a read-only token", async () => {
    jest.mocked(authenticateBearer).mockResolvedValue(readOnly);
    jest.mocked(listReminders).mockResolvedValue([view] as never);
    const result = await call("needt_reminders", { taskId: "t1" });
    expect(result.isError).toBe(false);
    expect(result.payload.reminders).toEqual([view]);
    expect(listReminders).toHaveBeenCalledWith("user-1", { taskId: "t1" });
  });

  it("refuses to set one without the write scope", async () => {
    jest.mocked(authenticateBearer).mockResolvedValue(readOnly);
    const result = await call("needt_reminders", {
      action: "set",
      taskId: "t1",
      offsetMinutes: 10,
    });
    expect(result.isError).toBe(true);
    expect(createReminder).not.toHaveBeenCalled();
  });

  it("sets, snoozes and deletes through the same service as the API", async () => {
    jest
      .mocked(createReminder)
      .mockResolvedValue({ ok: true, value: view as never });
    const set = await call("needt_reminders", {
      action: "set",
      taskId: "t1",
      offsetMinutes: 1440,
      atTime: "09:00",
    });
    expect(set.isError).toBe(false);
    expect(createReminder).toHaveBeenCalledWith("user-1", {
      taskId: "t1",
      offsetMinutes: 1440,
      atTime: "09:00",
    });

    jest
      .mocked(updateReminder)
      .mockResolvedValue({ ok: true, value: view as never });
    await call("needt_reminders", {
      action: "snooze",
      id: "r1",
      until: "2026-10-28T09:00:00.000Z",
    });
    expect(updateReminder).toHaveBeenCalledWith("user-1", "r1", {
      snoozeUntil: "2026-10-28T09:00:00.000Z",
    });

    jest
      .mocked(deleteReminder)
      .mockResolvedValue({ ok: true, value: { id: "r1" } });
    const removed = await call("needt_reminders", {
      action: "delete",
      id: "r1",
    });
    expect(removed.isError).toBe(false);
    expect(deleteReminder).toHaveBeenCalledWith("user-1", "r1");
  });

  it("asks for an id before changing one", async () => {
    const result = await call("needt_reminders", { action: "delete" });
    expect(result.isError).toBe(true);
    expect(result.payload).toMatchObject({ status: 400 });
  });
});
