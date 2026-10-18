import { NextRequest } from "next/server";

import { POST } from "@/app/api/mcp/route";
import {
  type BearerAuth,
  authenticateBearer,
} from "@/services/connectors/bearer";
import { createFakePrisma } from "@/services/ops/__tests__/fake-prisma";
import { WorkspaceKind, WorkspaceRole } from "@prisma/client";

import { resolveWorkspaceAccess } from "@/lib/auth/workspace-auth";

import { MCP_TOOLS } from "../tools";

const mockState = { db: createFakePrisma() };

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
}));
jest.mock("@/lib/security/rate-limit", () => ({
  enforceRateLimits: jest.fn().mockResolvedValue(null),
  ipRule: jest.fn(),
  accountRule: jest.fn(),
}));
jest.mock("@/lib/entitlements", () => ({ getPlan: jest.fn() }));
jest.mock("@/services/scheduling/TaskSchedulingService", () => ({
  scheduleAllTasksForUser: jest.fn(),
  scheduleAllTasksForUserDetailed: jest.fn(),
}));
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

const token: BearerAuth = {
  userId: "user-1",
  kind: "personal",
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
    isError: body.result?.isError === true,
    payload: body.result ? JSON.parse(body.result.content[0].text) : body,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockState.db = createFakePrisma();
  jest.mocked(authenticateBearer).mockResolvedValue(token);
  jest.mocked(resolveWorkspaceAccess).mockResolvedValue(personal);
});

describe("MCP personal time", () => {
  it("lists the personal time tools", () => {
    const names = MCP_TOOLS.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "needt_create_personal_time",
        "needt_mark_event_personal",
        "needt_update_personal_time",
        "needt_delete_personal_time",
      ])
    );
  });

  it("creates a block, reads it back with needt_list and needt_get, and the actionId undoes it", async () => {
    const created = await call("needt_create_personal_time", {
      kind: "gym",
      start: "2026-10-21T17:00:00.000Z",
    });
    expect(created.isError).toBe(false);
    const block = created.payload.result.block;
    expect(block).toMatchObject({ kind: "gym", title: "Gym" });
    expect(block.end).toBe("2026-10-21T18:00:00.000Z");
    expect(created.payload.actionId).toEqual(expect.any(String));

    const listed = await call("needt_list", { type: "personal_time" });
    expect(listed.payload.items.map((b: { id: string }) => b.id)).toEqual([
      block.id,
    ]);
    const got = await call("needt_get", {
      type: "personal_time",
      id: block.id,
    });
    expect(got.payload).toMatchObject({ id: block.id, title: "Gym" });

    const removed = await call("needt_delete_personal_time", { id: block.id });
    expect(removed.isError).toBe(false);
    const after = await call("needt_list", { type: "personal_time" });
    expect(after.payload.items).toEqual([]);
  });

  it("marks one of the person's events as personal time, and refuses a missing one", async () => {
    const feed = await mockState.db.seed("calendarFeed", {
      userId: "user-1",
      type: "GOOGLE",
      enabled: true,
    });
    const event = await mockState.db.seed("calendarEvent", {
      feedId: feed.id,
      title: "Padel",
      start: new Date("2026-10-22T17:00:00.000Z"),
      end: new Date("2026-10-22T18:00:00.000Z"),
    });
    const marked = await call("needt_mark_event_personal", {
      eventId: event.id,
      kind: "gym",
    });
    expect(marked.isError).toBe(false);
    expect(marked.payload.result.block).toMatchObject({
      sourceEventId: event.id,
      kind: "gym",
    });

    const missing = await call("needt_mark_event_personal", {
      eventId: "nope",
    });
    expect(missing.isError).toBe(true);
  });

  it("is unavailable in a shared workspace", async () => {
    jest.mocked(resolveWorkspaceAccess).mockResolvedValue({
      ...personal,
      workspaceKind: WorkspaceKind.SHARED,
    });
    const refused = await call("needt_create_personal_time", {
      kind: "walk",
      start: "2026-10-21T17:00:00.000Z",
    });
    expect(refused.isError).toBe(true);
  });
});
