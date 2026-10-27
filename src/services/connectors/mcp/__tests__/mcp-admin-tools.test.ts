import { NextRequest } from "next/server";

import { POST } from "@/app/api/mcp/route";
import { recordAdminAudit } from "@/services/admin/audit";
import { getAdminUserDetail, searchAdminUsers } from "@/services/admin/users";
import {
  type BearerAuth,
  PERSONAL_TOKEN_SCOPES,
  authenticateBearer,
} from "@/services/connectors/bearer";
import {
  ADMIN_TOOLS,
  MCP_ADMIN_LIMIT_PER_MINUTE,
  scrubMetadata,
} from "@/services/connectors/mcp/admin-tools";
import { handleMcpMessage } from "@/services/connectors/mcp/server";
import { listMcpTools } from "@/services/connectors/mcp/tools";
import { grantedScopes } from "@/services/oauth/consent";

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
jest.mock("@/services/admin/overview", () => ({
  getAdminOverview: jest.fn().mockResolvedValue({
    users: { total: 10, newLast7Days: 3 },
    activeTrials: 2,
    plans: { pro: 1, lifetime: 1, free: 6 },
    waitlist: 4,
    generatedAt: "2026-10-27T00:00:00.000Z",
  }),
  getAdminSignupStats: jest.fn().mockResolvedValue({
    signupsToday: 1,
    signupsLast7Days: 3,
    verified: 8,
    unverified: 2,
    signupsOpen: false,
  }),
}));
jest.mock("@/services/admin/feature-flags", () => ({
  listAdminFeatureFlags: jest.fn().mockResolvedValue([
    {
      key: "signups_open",
      enabled: false,
      rolloutPercentage: 0,
      description: "New accounts",
      overrides: 0,
      known: true,
      persisted: true,
    },
  ]),
}));
// The services return extra secret-looking fields on purpose: the tools must
// build their output field by field and never pass these through.
jest.mock("@/services/admin/users", () => ({
  searchAdminUsers: jest.fn().mockResolvedValue([
    {
      id: "u1",
      email: "a@x.com",
      name: "A",
      role: "user",
      createdAt: "2026-10-01T00:00:00.000Z",
      plan: "FREE",
      verified: true,
      lastSignInAt: null,
      passwordHash: "$2b$leak",
    },
  ]),
  getAdminUserDetail: jest.fn().mockResolvedValue({
    id: "u1",
    email: "a@x.com",
    name: "A",
    role: "user",
    createdAt: null,
    plan: "PRO",
    verified: true,
    lastSignInAt: null,
    isActive: true,
    trialEndsAt: null,
    subscription: {
      plan: "PRO",
      status: "ACTIVE",
      currentPeriodEnd: null,
      manual: false,
      creemCustomerId: "cus_leak",
    },
    providers: { signIn: ["google"], calendar: [], mail: [] },
    deletionScheduledFor: null,
    accessToken: "leaked-access-token-fixture",
  }),
}));
jest.mock("@/services/admin/logs", () => ({
  queryAdminLogs: jest.fn().mockResolvedValue({
    logs: [
      {
        id: "l1",
        timestamp: new Date("2026-10-27T00:00:00Z"),
        level: "ERROR",
        source: "Auth",
        message: "boom",
        metadata: {
          userId: "u1",
          refreshToken: "leak",
          nested: { apiKey: "leak", ok: 1 },
        },
        expiresAt: new Date("2026-11-27T00:00:00Z"),
      },
    ],
    pagination: { total: 1, pages: 1, current: 1, limit: 25 },
  }),
}));
jest.mock("@/services/admin/operations", () => ({
  getAdminOperations: jest.fn().mockResolvedValue({
    queues: [],
    cronStates: [
      {
        id: "sync",
        pendingCursor: "cursor-leak",
        pendingUserIds: ["u1"],
        lastStartedAt: null,
        lastSucceededAt: null,
        lastError: null,
        overdue: true,
      },
    ],
    lastSuccessfulBySource: [],
    lastError: null,
    failedRuns: [],
    services: [{ service: "redis", configured: true, healthy: true }],
  }),
}));
jest.mock("@/services/bug-reports/bug-report-service", () => ({
  listBugReports: jest.fn().mockResolvedValue([
    {
      id: "b1",
      userId: "u1",
      title: "Broken",
      description: "It broke",
      reproductionSteps: null,
      expectedBehavior: null,
      actualBehavior: null,
      severity: "HIGH",
      status: "OPEN",
      route: "/today",
      appVersion: "1",
      viewport: null,
      theme: null,
      browser: null,
      githubIssueUrl: null,
      githubSyncError: "token leak",
      createdAt: new Date("2026-10-26T00:00:00Z"),
      updatedAt: new Date("2026-10-26T00:00:00Z"),
      user: { id: "u1", name: "A", email: "a@x.com" },
      attachments: [
        {
          id: "f1",
          fileName: "a.png",
          mimeType: "image/png",
          size: 10,
          data: "bytes",
        },
      ],
    },
  ]),
}));

const ADMIN_NAMES = [
  "needt_admin_overview",
  "needt_admin_users",
  "needt_admin_flags",
  "needt_admin_logs",
  "needt_admin_reports",
];

const oauth = (scopes: BearerAuth["scopes"]): BearerAuth => ({
  userId: "admin-1",
  kind: "oauth",
  scopes,
  clientId: "claude",
  workspaceId: "ws-1",
});

const ADMIN = { role: "admin", isActive: true, emailVerified: new Date() };
const USER = { role: "user", isActive: true, emailVerified: new Date() };

function setCaller(auth: BearerAuth, user: Record<string, unknown> | null) {
  jest.mocked(authenticateBearer).mockResolvedValue(auth);
  jest
    .mocked(prisma.user.findUnique)
    .mockResolvedValue(user as unknown as never);
}

async function call(name: string, args: Record<string, unknown> = {}) {
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
        params: { name, arguments: args },
      }),
    })
  );
  const body = await response.json();
  const text = body.result?.content?.[0]?.text;
  return {
    status: response.status,
    body,
    payload: text ? JSON.parse(text) : undefined,
  };
}

/** Every key anywhere in a value. */
function keysOf(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => keysOf(item, out));
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      out.add(key);
      keysOf(item, out);
    }
  }
  return out;
}

const SECRET =
  /pass|hash|token|secret|cookie|api[-_]?key|creem|stripe|cursor|bytes|^data$|syncError/i;

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(enforceRateLimits).mockResolvedValue(null);
  jest.mocked(prisma.adminAuditLog.findMany).mockResolvedValue([]);
});

describe("needt.admin.read scope and role", () => {
  it("refuses a non-admin who holds the scope with 403", async () => {
    setCaller(oauth(["needt.read", "needt.admin.read"]), USER);
    const { status } = await call("needt_admin_overview");
    expect(status).toBe(403);
    expect(recordAdminAudit).not.toHaveBeenCalled();
  });

  it("refuses an admin without the scope with 403 insufficient_scope", async () => {
    setCaller(oauth(["needt.read", "needt.write"]), ADMIN);
    const { status, body } = await call("needt_admin_overview");
    expect(status).toBe(403);
    expect(body.error).toBe("insufficient_scope");
    expect(body.scope).toContain("needt.admin.read");
  });

  it("answers an admin with the scope, audit-logs the read and rate-limits it", async () => {
    setCaller(oauth(["needt.read", "needt.admin.read"]), ADMIN);
    const { status, payload } = await call("needt_admin_overview");
    expect(status).toBe(200);
    expect(payload).toMatchObject({
      users: { total: 10, signupsToday: 1, verified: 8, unverified: 2 },
      plans: { pro: 1, lifetime: 1, free: 6 },
      signupsOpen: false,
      mrr: null,
    });
    expect(recordAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin-1",
        action: "mcp.admin_read",
        details: expect.objectContaining({ tool: "needt_admin_overview" }),
      })
    );
    expect(accountRule).toHaveBeenCalledWith(
      "admin-1",
      "mcp:admin",
      MCP_ADMIN_LIMIT_PER_MINUTE,
      60
    );
  });

  it("refuses an admin who was demoted after the grant", async () => {
    setCaller(oauth(["needt.read", "needt.admin.read"]), ADMIN);
    expect((await call("needt_admin_flags")).status).toBe(200);
    jest.mocked(prisma.user.findUnique).mockResolvedValue(USER as never);
    expect((await call("needt_admin_flags")).status).toBe(403);
    jest
      .mocked(prisma.user.findUnique)
      .mockResolvedValue({ ...ADMIN, isActive: false } as never);
    expect((await call("needt_admin_flags")).status).toBe(403);
  });

  it("refuses an admin whose email is unconfirmed when confirmation is required", async () => {
    setCaller(oauth(["needt.read", "needt.admin.read"]), {
      ...ADMIN,
      emailVerified: null,
    });
    expect((await call("needt_admin_flags")).status).toBe(403);
  });

  it("refuses inside the tool too when the transport is bypassed", async () => {
    jest.mocked(prisma.user.findUnique).mockResolvedValue(USER as never);
    const response = await handleMcpMessage(
      {
        request: new NextRequest("http://localhost/api/mcp"),
        userId: "u-2",
        auth: oauth(["needt.read", "needt.admin.read"]),
      },
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "needt_admin_users", arguments: {} },
      }
    );
    expect(response?.result).toMatchObject({ isError: true });
    expect(searchAdminUsers).not.toHaveBeenCalled();
  });

  it("never puts the admin scope on a personal token", () => {
    expect(PERSONAL_TOKEN_SCOPES).not.toContain("needt.admin.read");
  });
});

describe("admin tool listing", () => {
  it("hides admin tools without the scope and shows them with it", () => {
    const without = listMcpTools(["needt.read", "needt.write", "mail.read"]);
    expect(without.map((t) => t.name)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^needt_admin_/)])
    );
    expect(listMcpTools().some((t) => t.name.startsWith("needt_admin_"))).toBe(
      false
    );
    const withScope = listMcpTools(["needt.read", "needt.admin.read"]);
    expect(withScope.map((t) => t.name)).toEqual(
      expect.arrayContaining(ADMIN_NAMES)
    );
  });

  it("has only read-only admin tools, all needing the admin scope", () => {
    expect(ADMIN_TOOLS.map((t) => t.name).sort()).toEqual(
      [...ADMIN_NAMES].sort()
    );
    for (const tool of ADMIN_TOOLS) {
      expect(tool.annotations).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
      });
      expect(tool.scopes?.({} as never)).toEqual(["needt.admin.read"]);
    }
  });
});

describe("admin tool output", () => {
  beforeEach(() => setCaller(oauth(["needt.admin.read"]), ADMIN));

  it.each([
    ["needt_admin_overview", {}],
    ["needt_admin_users", {}],
    ["needt_admin_users", { userId: "u1" }],
    ["needt_admin_flags", {}],
    ["needt_admin_logs", {}],
    ["needt_admin_logs", { kind: "jobs" }],
    ["needt_admin_logs", { kind: "audit" }],
    ["needt_admin_reports", {}],
  ])("%s %j carries no secret field", async (name, args) => {
    const { status, payload } = await call(name, args);
    expect(status).toBe(200);
    const leaked = [...keysOf(payload)].filter((key) => SECRET.test(key));
    expect(leaked).toEqual([]);
    expect(JSON.stringify(payload)).not.toMatch(/leak/);
  });

  it("gives the user search its allowlisted fields and a page flag", async () => {
    const { payload } = await call("needt_admin_users", { limit: 1 });
    expect(Object.keys(payload.users[0]).sort()).toEqual(
      [
        "createdAt",
        "email",
        "id",
        "lastSignInAt",
        "name",
        "plan",
        "role",
        "verified",
      ].sort()
    );
    expect(searchAdminUsers).toHaveBeenCalledWith("", undefined, {
      offset: 0,
      limit: 2,
    });
    expect(getAdminUserDetail).not.toHaveBeenCalled();
  });

  it("caps page size at 50 and refuses write-shaped arguments", async () => {
    expect((await call("needt_admin_logs", { limit: 51 })).payload).toEqual(
      expect.objectContaining({ error: "Invalid arguments" })
    );
    expect(
      (await call("needt_admin_flags", { key: "signups_open", enabled: true }))
        .payload
    ).toEqual(expect.objectContaining({ error: "Invalid arguments" }));
  });

  it("drops secret-looking keys from log metadata", () => {
    expect(
      scrubMetadata({ password: "x", userId: "u1", inner: { sessionId: 1 } })
    ).toEqual({ userId: "u1", inner: {} });
  });
});

describe("consent grants admin read only to an admin who ticks it", () => {
  const asked = ["needt.read", "needt.write"] as const;
  it.each([
    [{ admin: false }, { isAdmin: true }, false],
    [{ admin: true }, { isAdmin: false }, false],
    [{ admin: true }, { isAdmin: true }, true],
  ])("choices %j person %j -> %s", (choice, person, granted) => {
    const scopes = grantedScopes(
      [...asked],
      { write: true, mail: false, ...choice },
      person
    );
    expect(scopes.includes("needt.admin.read")).toBe(granted);
  });

  it("is never granted by default", () => {
    expect(
      grantedScopes(["needt.read", "needt.admin.read"], {
        write: true,
        mail: true,
      })
    ).not.toContain("needt.admin.read");
  });
});
