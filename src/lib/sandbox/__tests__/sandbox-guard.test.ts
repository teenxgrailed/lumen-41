import { getToken } from "next-auth/jwt";
import { NextRequest } from "next/server";

import { middleware } from "@/middleware";

import { requireAdmin } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";
import {
  SANDBOX_LOCKED_CODE,
  type SandboxCapability,
  SandboxLockedError,
  assertNotSandbox,
  refuseSandbox,
  sandboxApiCapability,
  sandboxLockedMessage,
} from "@/lib/sandbox/guard";

jest.mock("next-auth/jwt", () => ({ getToken: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: jest.fn() } },
}));
jest.mock("@/lib/auth/email-verification-access", () => ({
  requiresEmailVerificationBeforeAccess: jest.fn().mockResolvedValue(false),
  getEmailVerificationStatus: jest
    .fn()
    .mockResolvedValue({ required: false, verified: true }),
}));

const mockedGetToken = getToken as jest.MockedFunction<typeof getToken>;
const findUnique = prisma.user.findUnique as unknown as jest.Mock;

/** One request per capability, the way the app (or a tool) would send it. */
const BLOCKED: Array<[SandboxCapability, string, string]> = [
  ["account_identity", "POST", "/api/auth/reset-password/request"],
  ["account_delete", "POST", "/api/account/deletion"],
  ["account_export", "POST", "/api/account/export"],
  ["billing", "POST", "/api/billing/checkout"],
  ["billing", "POST", "/api/billing/portal"],
  ["billing", "POST", "/api/billing/trial"],
  ["providers", "GET", "/api/calendar/google/auth"],
  ["providers", "POST", "/api/calendar/caldav/auth"],
  ["providers", "POST", "/api/calendar/outlook/sync"],
  ["providers", "POST", "/api/mail/accounts"],
  ["providers", "GET", "/api/mail/oauth/google/auth"],
  ["providers", "POST", "/api/imports"],
  ["providers", "GET", "/api/imports/todoist/authorize"],
  ["providers", "POST", "/api/import/tasks"],
  ["providers", "POST", "/api/task-sync/providers"],
  ["providers", "POST", "/api/integrations/connect"],
  ["providers", "GET", "/api/pinterest/authorize"],
  ["providers", "PUT", "/api/ai-settings"],
  ["webhooks", "PATCH", "/api/connector-settings"],
  ["api_tokens", "POST", "/api/connector-settings"],
  ["invites", "POST", "/api/workspaces/ws_1/invites"],
  ["public_share", "POST", "/api/pages/page_1/publication"],
  ["public_share", "PUT", "/api/pages/page_1/permissions"],
  ["public_share", "PUT", "/api/moodboards/mb_1/permissions"],
  ["public_share", "POST", "/api/booking-pages"],
  ["uploads", "POST", "/api/pages/page_1/assets"],
  ["uploads", "POST", "/api/moodboards/mb_1/items/upload"],
  ["admin", "GET", "/api/admin/users"],
  ["outbound_email", "POST", "/api/auth/email-verification/request"],
];

/** Requests a sandbox account makes all day; none of them is locked. */
const ALLOWED: Array<[string, string]> = [
  ["GET", "/api/tasks"],
  ["POST", "/api/tasks"],
  ["PATCH", "/api/tasks/task_1"],
  ["POST", "/api/pages"],
  ["PUT", "/api/pages/page_1/blocks"],
  ["GET", "/api/pages/page_1/publication"],
  ["POST", "/api/habits/habit_1/completions/today"],
  ["POST", "/api/goals"],
  ["POST", "/api/events"],
  ["POST", "/api/tasks/task_1/attachments"],
  ["GET", "/api/billing"],
  ["GET", "/api/connector-settings"],
  ["GET", "/api/calendar/google"],
  ["GET", "/api/mail/accounts"],
  ["POST", "/api/ai/chat"],
  ["POST", "/api/ai/memories"],
  ["GET", "/api/oauth/connected-apps"],
  ["POST", "/api/mcp"],
  ["POST", "/api/connect/ops/task.create"],
];

function request(method: string, path: string) {
  return new NextRequest(`http://needt.test${path}`, { method });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("sandbox route table", () => {
  it.each(BLOCKED)("%s covers %s %s", (capability, method, path) => {
    expect(sandboxApiCapability(path, method)).toBe(capability);
  });

  it.each(ALLOWED)("leaves %s %s open", (method, path) => {
    expect(sandboxApiCapability(path, method)).toBeNull();
  });

  it("ignores a trailing slash and the method's case", () => {
    expect(sandboxApiCapability("/api/billing/checkout/", "post")).toBe(
      "billing"
    );
  });
});

describe("middleware lockdown", () => {
  it.each(BLOCKED)(
    "refuses %s to a sandbox session (%s %s) with a clear 403",
    async (capability, method, path) => {
      mockedGetToken.mockResolvedValue({
        sub: "sandbox-1",
        sandboxKind: "reviewer",
      });
      const response = await middleware(request(method, path));
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body).toEqual({
        error: sandboxLockedMessage(capability),
        code: SANDBOX_LOCKED_CODE,
        capability,
      });
      expect(body.error).toMatch(/^This is a sandbox account that resets/);
    }
  );

  it.each(BLOCKED)(
    "passes %s through for a normal session (%s %s)",
    async (_capability, method, path) => {
      mockedGetToken.mockResolvedValue({ sub: "user-1", role: "user" });
      const response = await middleware(request(method, path));
      expect(response.status).not.toBe(403);
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
  );

  it("does not read the session for a route outside the table", async () => {
    const response = await middleware(request("POST", "/api/tasks"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(mockedGetToken).not.toHaveBeenCalled();
  });

  it("keeps a sandbox session out of the admin pages", async () => {
    mockedGetToken.mockResolvedValue({
      sub: "sandbox-1",
      role: "admin",
      sandboxKind: "reviewer",
    });
    const response = await middleware(request("GET", "/admin/users"));
    expect(new URL(response.headers.get("location")!).pathname).toBe("/");
  });
});

describe("database guard (routes, services, MCP)", () => {
  const CAPABILITIES = [...new Set(BLOCKED.map(([c]) => c))];

  it.each(CAPABILITIES)(
    "refuses %s to a sandbox account",
    async (capability) => {
      findUnique.mockResolvedValue({ sandboxKind: "reviewer" });
      const response = await refuseSandbox("sandbox-1", capability);
      expect(response?.status).toBe(403);
      await expect(response?.json()).resolves.toMatchObject({
        code: SANDBOX_LOCKED_CODE,
        capability,
        error: sandboxLockedMessage(capability),
      });
      await expect(assertNotSandbox("sandbox-1", capability)).rejects.toThrow(
        SandboxLockedError
      );
    }
  );

  it.each(CAPABILITIES)("lets a normal account %s", async (capability) => {
    findUnique.mockResolvedValue({ sandboxKind: null });
    await expect(refuseSandbox("user-1", capability)).resolves.toBeNull();
    await expect(
      assertNotSandbox("user-1", capability)
    ).resolves.toBeUndefined();
  });
});

describe("requireAdmin", () => {
  it("refuses a sandbox account even when its row says admin", async () => {
    mockedGetToken.mockResolvedValue({ sub: "sandbox-1", sessionVersion: 0 });
    findUnique.mockResolvedValue({
      emailVerified: new Date(),
      isActive: true,
      role: "admin",
      sandboxKind: "reviewer",
      sessionVersion: 0,
    });
    const response = await requireAdmin(request("GET", "/api/admin/users"));
    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toMatchObject({
      code: SANDBOX_LOCKED_CODE,
      capability: "admin",
    });
  });

  it("still lets a real admin in", async () => {
    mockedGetToken.mockResolvedValue({ sub: "admin-1", sessionVersion: 0 });
    findUnique.mockResolvedValue({
      emailVerified: new Date(),
      isActive: true,
      role: "admin",
      sandboxKind: null,
      sessionVersion: 0,
    });
    await expect(
      requireAdmin(request("GET", "/api/admin/users"))
    ).resolves.toBeNull();
  });
});
