import { NextRequest } from "next/server";

import { POST } from "@/app/api/mcp/route";
import {
  type BearerAuth,
  authenticateBearer,
} from "@/services/connectors/bearer";
import { writePageBlocks } from "@/services/pages/page-write-path";
import { WorkspaceKind, WorkspaceRole } from "@prisma/client";

import { resolveWorkspaceAccess } from "@/lib/auth/workspace-auth";
import { listMailMessages } from "@/lib/mail-db";
import { prisma } from "@/lib/prisma";

type PageRow = {
  id: string;
  parentId: string | null;
  isPrivate: boolean;
  title: string;
  userId: string;
  workspaceId: string;
  trashedAt: null;
  accessGrants: never[];
  blocks: never[];
  contentRevision: number;
  documentFormatVersion: number;
};

function page(id: string, parentId: string | null, isPrivate = false) {
  return {
    id,
    parentId,
    isPrivate,
    title: `Page ${id}`,
    userId: "user-1",
    workspaceId: "ws-1",
    trashedAt: null,
    accessGrants: [],
    blocks: [],
    contentRevision: 1,
    documentFormatVersion: 1,
  } satisfies PageRow;
}

const mockState: { pages: PageRow[] } = { pages: [] };

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
jest.mock("@/services/scheduling/TaskSchedulingService", () => ({
  scheduleAllTasksForUser: jest.fn(),
  scheduleAllTasksForUserDetailed: jest.fn(),
}));
jest.mock("@/lib/mail-db", () => ({
  listMailMessages: jest.fn().mockResolvedValue([]),
}));
jest.mock("@/services/pages/page-write-path", () => ({
  ...jest.requireActual("@/services/pages/page-write-path"),
  writePageBlocks: jest.fn(),
}));
jest.mock("@/services/pages/page-preview-service", () => ({
  loadPagePreviews: jest.fn().mockResolvedValue(new Map()),
}));
jest.mock("@/lib/prisma", () => {
  const empty = () => ({
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
  });
  return {
    prisma: {
      page: {
        findMany: jest.fn(async (args: { where?: { id?: { in: string[] } } }) =>
          mockState.pages.filter((row) =>
            args.where?.id?.in ? args.where.id.in.includes(row.id) : true
          )
        ),
        findFirst: jest.fn(
          async (args: { where: { id: string } }) =>
            mockState.pages.find((row) => row.id === args.where.id) ?? null
        ),
        create: jest.fn(),
      },
      task: empty(),
      project: empty(),
      habit: empty(),
      calendarEvent: empty(),
      calendarFeed: empty(),
      personalBlock: empty(),
      mailMessage: empty(),
    },
  };
});

const workspaceOf = (kind: WorkspaceKind) => ({
  enabled: true,
  workspaceId: "ws-1",
  workspaceKind: kind,
  role: WorkspaceRole.OWNER,
  dataScope: { mode: "workspace" as const, workspaceId: "ws-1" },
});

const token: BearerAuth = {
  userId: "user-1",
  kind: "personal",
  scopes: ["needt.read", "needt.write", "mail.read"],
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
  mockState.pages = [
    page("root", null),
    page("journal", null, true),
    page("daily", "journal"),
    page("nested", "daily"),
  ];
  jest.mocked(authenticateBearer).mockResolvedValue(token);
  jest
    .mocked(resolveWorkspaceAccess)
    .mockResolvedValue(workspaceOf(WorkspaceKind.PERSONAL));
});

describe("MCP and private pages", () => {
  it("needt_list leaves a private tree out", async () => {
    const listed = await call("needt_list", { type: "page" });
    expect(listed.payload.items.map((row: { id: string }) => row.id)).toEqual([
      "root",
    ]);
  });

  it("needt_get does not return a private page, or a note filed under one", async () => {
    const open = await call("needt_get", { type: "page", id: "root" });
    expect(open.isError).toBe(false);
    for (const id of ["journal", "daily", "nested"]) {
      const hidden = await call("needt_get", { type: "page", id });
      expect(hidden.isError).toBe(true);
      expect(hidden.payload.status).toBe(404);
      expect(hidden.payload.error).toMatch(/private/);
    }
  });

  it("needt_search never finds a private page", async () => {
    const found = await call("needt_search", {
      query: "Page",
      types: ["page"],
    });
    expect(found.payload.results.map((hit: { id: string }) => hit.id)).toEqual([
      "root",
    ]);
  });

  it("needt_append_page cannot write into a private tree", async () => {
    for (const id of ["journal", "daily", "nested"]) {
      const refused = await call("needt_append_page", { id, text: "injected" });
      expect(refused.isError).toBe(true);
      expect(refused.payload.status).toBe(404);
    }
    expect(writePageBlocks).not.toHaveBeenCalled();
  });

  it("needt_append_page still writes to an ordinary page", async () => {
    jest.mocked(writePageBlocks).mockResolvedValue({
      ...mockState.pages[0],
      contentRevision: 2,
      blocks: [{}],
    } as never);
    const written = await call("needt_append_page", {
      id: "root",
      text: "hello",
    });
    expect(written.isError).toBe(false);
    expect(writePageBlocks).toHaveBeenCalledTimes(1);
  });

  it("needt_create_page cannot file a page under a private tree", async () => {
    const refused = await call("needt_create_page", {
      title: "Child",
      parentId: "daily",
    });
    expect(refused.isError).toBe(true);
    expect(refused.payload.status).toBe(404);
    expect(prisma.page.create).not.toHaveBeenCalled();
  });
});

describe("MCP grants and personal objects", () => {
  const shared = () =>
    jest
      .mocked(resolveWorkspaceAccess)
      .mockResolvedValue(workspaceOf(WorkspaceKind.SHARED));

  it.each([
    ["calendar", () => prisma.calendarFeed.findMany],
    ["personal_time", () => prisma.personalBlock.findMany],
  ])(
    "needt_list type=%s answers nothing under a Team workspace",
    async (type, query) => {
      shared();
      const listed = await call("needt_list", { type });
      expect(listed.isError).toBe(false);
      expect(listed.payload.items).toEqual([]);
      expect(listed.payload.note).toMatch(/personal/);
      expect(query()).not.toHaveBeenCalled();
    }
  );

  it("needt_list type=mail answers nothing under a Team workspace", async () => {
    shared();
    const listed = await call("needt_list", { type: "mail" });
    expect(listed.payload.items).toEqual([]);
    expect(listMailMessages).not.toHaveBeenCalled();
  });

  it.each([
    ["calendar", () => prisma.calendarFeed.findFirst],
    ["personal_time", () => prisma.personalBlock.findFirst],
    ["mail", () => prisma.mailMessage.findFirst],
  ])(
    "needt_get type=%s is not found under a Team workspace",
    async (type, query) => {
      shared();
      const got = await call("needt_get", { type, id: "x" });
      expect(got.isError).toBe(true);
      expect(got.payload.status).toBe(404);
      expect(query()).not.toHaveBeenCalled();
    }
  );

  it("needt_search skips mail under a Team workspace, even with mail.read", async () => {
    shared();
    await call("needt_search", { query: "invoice" });
    expect(prisma.mailMessage.findMany).not.toHaveBeenCalled();
  });

  it("the same reads work in the personal workspace", async () => {
    await call("needt_list", { type: "calendar" });
    await call("needt_list", { type: "personal_time" });
    await call("needt_list", { type: "mail" });
    await call("needt_get", { type: "personal_time", id: "x" });
    await call("needt_search", { query: "invoice" });
    expect(prisma.calendarFeed.findMany).toHaveBeenCalled();
    expect(prisma.personalBlock.findMany).toHaveBeenCalled();
    expect(listMailMessages).toHaveBeenCalled();
    expect(prisma.personalBlock.findFirst).toHaveBeenCalled();
    expect(prisma.mailMessage.findMany).toHaveBeenCalled();
  });
});
