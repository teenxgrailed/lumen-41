import { NextRequest } from "next/server";

import { POST as rawConnectStart } from "@/app/api/connect/imports/route";
import { POST as rawCancelRun } from "@/app/api/imports/[id]/cancel/route";
import { GET as rawGetRun } from "@/app/api/imports/[id]/route";
import {
  GET as rawListImports,
  POST as rawStartImport,
} from "@/app/api/imports/route";
import {
  createImportOAuthState,
  verifyImportOAuthState,
} from "@/services/imports/service";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";
import { enqueueImportRun } from "@/lib/queue/enqueue";

jest.mock("@/lib/security/rate-limit", () => ({
  accountRule: jest.fn(() => ({})),
  ipRule: jest.fn(() => ({})),
  enforceRateLimits: jest.fn().mockResolvedValue(null),
  enforceByteBudget: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: jest.fn() }));
jest.mock("@/lib/queue/enqueue", () => ({ enqueueImportRun: jest.fn() }));
jest.mock("@/services/imports/token-secret", () => ({
  sealImportToken: (v: string) => `enc(${v})`,
}));
jest.mock("@/lib/auth/email-verification-access", () => ({
  getEmailVerificationStatus: jest
    .fn()
    .mockResolvedValue({ required: false, verified: true }),
}));
jest.mock("@/lib/auth/workspace-auth", () => ({
  ...jest.requireActual("@/lib/auth/workspace-auth"),
  resolveWorkspaceAccess: jest.fn().mockResolvedValue({
    enabled: false,
    workspaceId: "ws-1",
    workspaceKind: "PERSONAL",
    role: "OWNER",
    dataScope: { mode: "legacy", userId: "user-1" },
  }),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    connectorSettings: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    importRun: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

/** Route handlers are typed `Response | undefined`; a test wants the Response. */
function must(response: Response | undefined): Response {
  if (!response) throw new Error("Expected a route response.");
  return response;
}
type Args<F> = F extends (...args: infer A) => unknown ? A : never;
const getRun = async (...a: Args<typeof rawGetRun>) =>
  must(await rawGetRun(...a));
const cancelRun = async (...a: Args<typeof rawCancelRun>) =>
  must(await rawCancelRun(...a));
const listImports = async (...a: Args<typeof rawListImports>) =>
  must(await rawListImports(...a));
const startImport = async (...a: Args<typeof rawStartImport>) =>
  must(await rawStartImport(...a));
const connectStart = async (...a: Args<typeof rawConnectStart>) =>
  must(await rawConnectStart(...a));

const OWNER = "user-1";
const run = {
  id: "run-1",
  userId: OWNER,
  workspaceId: "ws-1",
  source: "todoist",
  status: "running",
  counts: { total: 10, done: 4, skipped: 1, failed: 0 },
  warnings: [],
  encryptedToken: "enc(secret)",
  startedAt: new Date("2026-10-12T10:00:00Z"),
  finishedAt: null,
  createdAt: new Date("2026-10-12T09:59:00Z"),
  updatedAt: new Date("2026-10-12T10:00:00Z"),
};

function signedIn(userId: string) {
  jest.mocked(authenticateRequest).mockResolvedValue({
    userId,
    workspace: {
      enabled: false,
      workspaceId: "ws-1",
      workspaceKind: "PERSONAL",
      role: "OWNER",
      dataScope: { mode: "legacy", userId },
    },
  } as never);
}

/** The fake table only returns a run to a query scoped to its owner. */
function ownerScopedRuns() {
  jest
    .mocked(prisma.importRun.findFirst)
    .mockImplementation((async (args: { where: { userId: string } }) =>
      args.where.userId === OWNER ? run : null) as never);
}

const req = (url: string, init?: RequestInit) =>
  new NextRequest(`http://localhost:3000${url}`, init as never);
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("import routes", () => {
  const env = { ...process.env };
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...env };
    delete process.env.TODOIST_CLIENT_ID;
    delete process.env.TODOIST_CLIENT_SECRET;
    jest.mocked(isFeatureEnabled).mockResolvedValue(true);
    ownerScopedRuns();
  });
  afterAll(() => {
    process.env = env;
  });

  it("returns the owner's run without the token", async () => {
    signedIn(OWNER);
    const res = await getRun(req("/api/imports/run-1"), params("run-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.run).toMatchObject({ id: "run-1", status: "running" });
    expect(JSON.stringify(body)).not.toContain("enc(secret)");
  });

  it("answers 404 for another user's run", async () => {
    signedIn("intruder");
    const res = await getRun(req("/api/imports/run-1"), params("run-1"));
    expect(res.status).toBe(404);
  });

  it("will not cancel another user's run", async () => {
    signedIn("intruder");
    jest.mocked(prisma.importRun.updateMany).mockResolvedValue({ count: 0 });
    const res = await cancelRun(
      req("/api/imports/run-1/cancel", { method: "POST" }),
      params("run-1")
    );
    expect(res.status).toBe(404);
    expect(prisma.importRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "intruder" }),
      })
    );
  });

  it("passes an unauthenticated request's 401 through", async () => {
    jest.mocked(authenticateRequest).mockResolvedValue({
      response: new Response("Unauthorized", { status: 401 }),
    } as never);
    const res = await getRun(req("/api/imports/run-1"), params("run-1"));
    expect(res.status).toBe(401);
  });

  it("hides everything while the flag is off", async () => {
    signedIn(OWNER);
    jest.mocked(isFeatureEnabled).mockResolvedValue(false);
    expect(
      (await getRun(req("/api/imports/run-1"), params("run-1"))).status
    ).toBe(404);
    const list = await (await listImports(req("/api/imports"))).json();
    expect(list).toEqual({ enabled: false, sources: {}, runs: [] });
  });

  it("reports Todoist as not configured without client credentials", async () => {
    signedIn(OWNER);
    jest.mocked(prisma.importRun.findFirst).mockResolvedValue(null);
    const res = await startImport(
      req("/api/imports", {
        method: "POST",
        body: JSON.stringify({ source: "todoist" }),
      })
    );
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("NOT_CONFIGURED");
  });

  it("returns the authorize URL when configured", async () => {
    process.env.TODOIST_CLIENT_ID = "cid";
    process.env.TODOIST_CLIENT_SECRET = "secret";
    signedIn(OWNER);
    jest.mocked(prisma.importRun.findFirst).mockResolvedValue(null);
    const res = await startImport(
      req("/api/imports", {
        method: "POST",
        body: JSON.stringify({ source: "todoist" }),
      })
    );
    expect(res.status).toBe(200);
    const { authorizeUrl } = await res.json();
    expect(authorizeUrl).toMatch(
      /\/api\/imports\/todoist\/authorize\?workspaceId=ws-1$/
    );
  });

  it("refuses a second run while one is active", async () => {
    signedIn(OWNER);
    const res = await startImport(
      req("/api/imports", {
        method: "POST",
        body: JSON.stringify({ source: "todoist", token: "personal" }),
      })
    );
    expect(res.status).toBe(409);
  });

  it("connect API: rejects a missing token, queues a run with a personal token", async () => {
    jest.mocked(prisma.connectorSettings.findUnique).mockResolvedValue(null);
    const denied = await connectStart(
      req("/api/connect/imports", {
        method: "POST",
        body: JSON.stringify({ source: "todoist" }),
      })
    );
    expect(denied.status).toBe(401);

    jest
      .mocked(prisma.connectorSettings.findUnique)
      .mockResolvedValue({ userId: OWNER } as never);
    jest.mocked(prisma.importRun.findFirst).mockResolvedValue(null);
    jest
      .mocked(prisma.importRun.create)
      .mockResolvedValue({ ...run, status: "queued" } as never);
    jest.mocked(enqueueImportRun).mockResolvedValue({ id: "job" } as never);
    const res = await connectStart(
      req("/api/connect/imports", {
        method: "POST",
        headers: { authorization: "Bearer needt_x" },
        body: JSON.stringify({ source: "todoist", token: "personal" }),
      })
    );
    expect(res.status).toBe(202);
    expect(prisma.importRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: OWNER,
        source: "todoist",
        encryptedToken: "enc(personal)",
      }),
    });
    expect(enqueueImportRun).toHaveBeenCalledWith("run-1");
  });
});

describe("import OAuth state", () => {
  it("verifies for the same user and nonce only", () => {
    const { state, nonce } = createImportOAuthState(OWNER, "ws-1");
    expect(verifyImportOAuthState(state, OWNER, nonce)).toEqual({
      workspaceId: "ws-1",
    });
    expect(verifyImportOAuthState(state, "intruder", nonce)).toBeNull();
    expect(verifyImportOAuthState(state, OWNER, "other-nonce")).toBeNull();
    expect(verifyImportOAuthState(state, OWNER, undefined)).toBeNull();
    expect(verifyImportOAuthState(`${state}x`, OWNER, nonce)).toBeNull();
  });

  it("expires", () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date("2026-10-12T10:00:00Z"));
      const { state, nonce } = createImportOAuthState(OWNER, "ws-1");
      jest.setSystemTime(new Date("2026-10-12T10:11:00Z"));
      expect(verifyImportOAuthState(state, OWNER, nonce)).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
