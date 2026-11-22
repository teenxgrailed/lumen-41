import { NextRequest } from "next/server";

import { POST } from "@/app/api/mcp/route";
import { recordAdminAudit } from "@/services/admin/audit";
import {
  type BearerAuth,
  PERSONAL_TOKEN_SCOPES,
  authenticateBearer,
} from "@/services/connectors/bearer";
import {
  ADMIN_DRAFT_TOOLS,
  MCP_ADMIN_LIMIT_PER_MINUTE,
} from "@/services/connectors/mcp/admin-tools";
import { handleMcpMessage } from "@/services/connectors/mcp/server";
import { MCP_TOOLS, listMcpTools } from "@/services/connectors/mcp/tools";
import {
  createAnnouncement,
  setAnnouncementStatus,
} from "@/services/popups/announcements";

import { MCP_SCOPES } from "@/lib/mcp-config";
import { prisma } from "@/lib/prisma";
import { accountRule, enforceRateLimits } from "@/lib/security/rate-limit";

jest.mock("@/services/connectors/bearer", () => ({
  ...jest.requireActual("@/services/connectors/bearer"),
  authenticateBearer: jest.fn(),
}));
jest.mock("@/lib/auth/email-verification-access", () => ({
  getEmailVerificationStatus: jest
    .fn()
    .mockResolvedValue({ required: false, verified: true }),
  requiresEmailVerificationBeforeAccess: jest.fn().mockResolvedValue(true),
}));
jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/security/rate-limit", () => ({
  enforceRateLimits: jest.fn(),
  ipRule: jest.fn((_req, namespace, limit) => ({ namespace, limit })),
  accountRule: jest.fn((_value, namespace, limit) => ({ namespace, limit })),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    adminAuditLog: { findMany: jest.fn() },
  },
}));
jest.mock("@/services/admin/audit", () => ({
  recordAdminAudit: jest.fn().mockResolvedValue({ id: "audit-1" }),
}));
jest.mock("@/services/popups/announcements", () => ({
  createAnnouncement: jest.fn(),
  setAnnouncementStatus: jest.fn(),
  updateAnnouncement: jest.fn(),
  deleteAnnouncement: jest.fn(),
}));

const TOOL = "needt_announcement_draft_create";

const oauth = (scopes: BearerAuth["scopes"]): BearerAuth => ({
  userId: "admin-1",
  kind: "oauth",
  scopes,
  clientId: "claude",
  workspaceId: "ws-1",
});

const ADMIN = { role: "admin", isActive: true, emailVerified: new Date() };
const USER = { role: "user", isActive: true, emailVerified: new Date() };
const DRAFTER: BearerAuth["scopes"] = [
  "needt.read",
  "needt.write",
  "needt.admin.read",
];

function setCaller(auth: BearerAuth, user: Record<string, unknown> | null) {
  jest.mocked(authenticateBearer).mockResolvedValue(auth);
  jest
    .mocked(prisma.user.findUnique)
    .mockResolvedValue(user as unknown as never);
}

async function call(args: Record<string, unknown>) {
  const response = await POST(
    new NextRequest("http://localhost/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer t",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: TOOL, arguments: args },
      }),
    })
  );
  const body = await response.json();
  const text = body.result?.content?.[0]?.text;
  return {
    status: response.status,
    body,
    isError: body.result?.isError === true,
    payload: text ? JSON.parse(text) : undefined,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(enforceRateLimits).mockResolvedValue(null);
  jest.mocked(createAnnouncement).mockResolvedValue({
    ok: true,
    announcement: {
      id: "ann-1",
      slug: "new-board",
      title: "Boards are here",
      status: "draft",
    },
  } as never);
});

describe("needt_announcement_draft_create", () => {
  it("drafts through createAnnouncement and audits it as an MCP create", async () => {
    setCaller(oauth(DRAFTER), ADMIN);
    const { status, payload, isError } = await call({
      slug: "new-board",
      title: "Boards are here",
      startsAt: "2026-12-01T00:00:00Z",
    });
    expect(status).toBe(200);
    expect(isError).toBe(false);
    expect(payload.announcement).toEqual({
      id: "ann-1",
      slug: "new-board",
      title: "Boards are here",
      status: "draft",
    });
    // Validated by announcementCreateSchema: defaults filled, dates coerced.
    expect(createAnnouncement).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "new-board",
        title: "Boards are here",
        kind: "update",
        bullets: [],
        startsAt: new Date("2026-12-01T00:00:00Z"),
      })
    );
    const passed = jest.mocked(createAnnouncement).mock.calls[0][0];
    expect(passed).not.toHaveProperty("status");
    expect(passed).not.toHaveProperty("workspaceId");
    expect(recordAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin-1",
        action: "announcement.create",
        details: expect.objectContaining({
          announcementId: "ann-1",
          via: "mcp",
          tool: TOOL,
        }),
      })
    );
    expect(setAnnouncementStatus).not.toHaveBeenCalled();
    // Admin role checked and admin + write limits applied by the transport.
    expect(accountRule).toHaveBeenCalledWith(
      "admin-1",
      "mcp:admin",
      MCP_ADMIN_LIMIT_PER_MINUTE,
      60
    );
    expect(accountRule).toHaveBeenCalledWith(
      "admin-1",
      "mcp:write",
      expect.any(Number),
      60
    );
  });

  it.each([
    [{ status: "published" }],
    [{ status: "draft" }],
    [{ published: true }],
    [{ publishedAt: "2026-12-01T00:00:00Z" }],
  ])("refuses %j and creates nothing", async (extra) => {
    setCaller(oauth(DRAFTER), ADMIN);
    const { isError, payload } = await call({
      slug: "new-board",
      title: "Boards are here",
      ...extra,
    });
    expect(isError).toBe(true);
    expect(payload.error).toBe("Invalid arguments");
    expect(createAnnouncement).not.toHaveBeenCalled();
    expect(recordAdminAudit).not.toHaveBeenCalled();
  });

  it("applies the schema's own checks (end after start)", async () => {
    setCaller(oauth(DRAFTER), ADMIN);
    const { isError } = await call({
      slug: "new-board",
      title: "Boards are here",
      startsAt: "2026-12-02T00:00:00Z",
      endsAt: "2026-12-01T00:00:00Z",
    });
    expect(isError).toBe(true);
    expect(createAnnouncement).not.toHaveBeenCalled();
  });

  it("answers a taken slug without auditing", async () => {
    setCaller(oauth(DRAFTER), ADMIN);
    jest
      .mocked(createAnnouncement)
      .mockResolvedValue({ ok: false, code: "slug_taken" });
    const { isError, payload } = await call({ slug: "x-y", title: "T" });
    expect(isError).toBe(true);
    expect(payload.error).toMatch(/slug/);
    expect(recordAdminAudit).not.toHaveBeenCalled();
  });

  it("refuses a non-admin holding both scopes with 403", async () => {
    setCaller(oauth(DRAFTER), USER);
    const { status } = await call({ slug: "x-y", title: "T" });
    expect(status).toBe(403);
    expect(createAnnouncement).not.toHaveBeenCalled();
  });

  it("refuses an admin without needt.write or without needt.admin.read", async () => {
    setCaller(oauth(["needt.read", "needt.admin.read"]), ADMIN);
    expect((await call({ slug: "x-y", title: "T" })).status).toBe(403);
    setCaller(oauth(["needt.read", "needt.write"]), ADMIN);
    expect((await call({ slug: "x-y", title: "T" })).status).toBe(403);
    expect(createAnnouncement).not.toHaveBeenCalled();
  });

  it("refuses a personal token (it never carries the admin scope)", async () => {
    setCaller(
      { userId: "admin-1", kind: "personal", scopes: PERSONAL_TOKEN_SCOPES },
      ADMIN
    );
    expect((await call({ slug: "x-y", title: "T" })).status).toBe(403);
    expect(createAnnouncement).not.toHaveBeenCalled();
  });

  it("refuses inside the tool too when the transport is bypassed", async () => {
    jest.mocked(prisma.user.findUnique).mockResolvedValue(USER as never);
    const response = await handleMcpMessage(
      {
        request: new NextRequest("http://localhost/api/mcp"),
        userId: "u-2",
        auth: oauth(DRAFTER),
      },
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: TOOL, arguments: { slug: "x-y", title: "T" } },
      }
    );
    expect(response?.result).toMatchObject({ isError: true });
    expect(createAnnouncement).not.toHaveBeenCalled();
  });
});

describe("no MCP tool can publish an announcement", () => {
  const ALL_SCOPES = [...MCP_SCOPES];
  const everyList = [
    listMcpTools(ALL_SCOPES, { hub: true, quit: true, dayPlan: true }),
    listMcpTools(DRAFTER),
    listMcpTools(),
  ];

  it("has no tool named for publishing or a status change on announcements", () => {
    const names = [
      ...MCP_TOOLS.map((t) => t.name),
      ...everyList.flat().map((t) => t.name),
    ];
    expect(
      names.filter((n) => /publish|announcement.*status/i.test(n))
    ).toEqual([]);
    const announcementTools = new Set(
      names.filter((n) => /announcement/i.test(n))
    );
    expect([...announcementTools]).toEqual([TOOL]);
  });

  it("the draft tool's input has no status or published field", () => {
    const [tool] = ADMIN_DRAFT_TOOLS;
    const listed = listMcpTools(DRAFTER).find((t) => t.name === TOOL);
    const props = Object.keys(
      (listed?.inputSchema.properties ?? {}) as Record<string, unknown>
    );
    expect(props).toEqual(expect.arrayContaining(["slug", "title"]));
    expect(props).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/status|publish/i)])
    );
    expect(listed?.inputSchema.additionalProperties).toBe(false);
    expect(tool.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
    });
    expect(tool.scopes?.({} as never)).toEqual([
      "needt.admin.read",
      "needt.write",
    ]);
  });

  it("lists the draft tool only with needt.admin.read and needt.write", () => {
    const has = (scopes: BearerAuth["scopes"]) =>
      listMcpTools(scopes).some((t) => t.name === TOOL);
    expect(has(DRAFTER)).toBe(true);
    expect(has(["needt.read", "needt.admin.read"])).toBe(false);
    expect(has(["needt.read", "needt.write"])).toBe(false);
    expect(has(PERSONAL_TOKEN_SCOPES)).toBe(false);
    expect(has([])).toBe(false);
  });
});
