import { NextRequest } from "next/server";

import { POST as rawStartImport } from "@/app/api/imports/route";
import { GET as rawAuthorize } from "@/app/api/imports/todoist/authorize/route";
import { GET as rawCallback } from "@/app/api/imports/todoist/callback/route";
import {
  IMPORT_STATE_COOKIE,
  createImportOAuthState,
} from "@/services/imports/service";
import { exchangeTodoistCode } from "@/services/imports/todoist/client";

import { prisma } from "@/lib/prisma";
import { enqueueImportRun } from "@/lib/queue/enqueue";

/*
 * These run the real session auth and the real workspace-role check
 * (src/lib/auth/api-auth.ts, workspace-auth.ts) over a mocked database: the
 * person owns a personal workspace and is only a VIEWER of "shared-ws".
 */

jest.mock("next-auth/jwt", () => ({
  getToken: jest.fn().mockResolvedValue({ sub: "user-1" }),
}));
jest.mock("@/lib/auth/email-verification-access", () => ({
  getEmailVerificationStatus: jest
    .fn()
    .mockResolvedValue({ required: false, verified: true }),
}));
// Both `imports` and `workspaces` are on for this person.
jest.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: jest.fn().mockResolvedValue(true),
}));
jest.mock("@/lib/entitlements", () => ({
  getPlan: jest.fn().mockResolvedValue("PRO"),
}));
jest.mock("@/lib/queue/enqueue", () => ({ enqueueImportRun: jest.fn() }));
jest.mock("@/services/ai/encryption", () => ({
  encryptSecret: (v: string) => `enc(${v})`,
}));
jest.mock("@/services/imports/todoist/client", () => ({
  ...jest.requireActual("@/services/imports/todoist/client"),
  exchangeTodoistCode: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    workspace: { upsert: jest.fn(), findUnique: jest.fn() },
    workspaceMember: { upsert: jest.fn(), findUnique: jest.fn() },
    importRun: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const USER = "user-1";
const PERSONAL = "personal-ws";
const SHARED = "shared-ws";

function must(response: Response | undefined): Response {
  if (!response) throw new Error("Expected a route response.");
  return response;
}
const callback = async (r: NextRequest) => must(await rawCallback(r));
const authorize = async (r: NextRequest) => must(await rawAuthorize(r));
const startImport = async (r: NextRequest) => must(await rawStartImport(r));

function callbackRequest(state: string, cookie?: string, extra = "") {
  return new NextRequest(
    `http://localhost:3000/api/imports/todoist/callback?code=c0de&state=${encodeURIComponent(state)}${extra}`,
    {
      headers: cookie ? { cookie: `${IMPORT_STATE_COOKIE}=${cookie}` } : {},
    }
  );
}

describe("Todoist OAuth callback and workspace roles", () => {
  const env = { ...process.env };
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...env,
      TODOIST_CLIENT_ID: "cid",
      TODOIST_CLIENT_SECRET: "secret",
    };
    jest
      .mocked(prisma.user.findUnique)
      .mockResolvedValue({ id: USER, isActive: true } as never);
    jest
      .mocked(prisma.workspace.upsert)
      .mockResolvedValue({ id: PERSONAL, kind: "PERSONAL" } as never);
    jest
      .mocked(prisma.workspaceMember.upsert)
      .mockResolvedValue({ role: "OWNER" } as never);
    jest.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({
      role: "VIEWER",
      workspace: { id: SHARED, kind: "SHARED" },
    } as never);
    jest.mocked(prisma.importRun.findFirst).mockResolvedValue(null);
    jest.mocked(prisma.importRun.create).mockResolvedValue({
      id: "run-1",
      status: "queued",
    } as never);
    jest.mocked(enqueueImportRun).mockResolvedValue({ id: "job" } as never);
    jest.mocked(exchangeTodoistCode).mockResolvedValue("todoist-token");
  });
  afterAll(() => {
    process.env = env;
  });

  it("rejects a state that is not ours", async () => {
    const res = await callback(callbackRequest("garbage.sig", "nonce"));
    expect(res.status).toBe(400);
    expect(exchangeTodoistCode).not.toHaveBeenCalled();
  });

  it("rejects a valid state with the wrong nonce cookie", async () => {
    const { state } = createImportOAuthState(USER, PERSONAL);
    expect((await callback(callbackRequest(state, "other"))).status).toBe(400);
    expect((await callback(callbackRequest(state))).status).toBe(400);
    expect(exchangeTodoistCode).not.toHaveBeenCalled();
  });

  it("rejects an expired state", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.now() - 11 * 60 * 1_000);
    const { state, nonce } = createImportOAuthState(USER, PERSONAL);
    jest.useRealTimers();
    expect((await callback(callbackRequest(state, nonce))).status).toBe(400);
    expect(exchangeTodoistCode).not.toHaveBeenCalled();
  });

  it("sends a VIEWER of the target workspace back with todoist-failed", async () => {
    const { state, nonce } = createImportOAuthState(USER, SHARED);
    const res = await callback(callbackRequest(state, nonce));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("import")).toBe("todoist-failed");
    expect(exchangeTodoistCode).not.toHaveBeenCalled();
    expect(prisma.importRun.create).not.toHaveBeenCalled();
  });

  it("creates and queues a run on success and clears the nonce cookie", async () => {
    const { state, nonce } = createImportOAuthState(USER, PERSONAL);
    const res = await callback(callbackRequest(state, nonce));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/settings");
    expect(location.hash).toBe("#data");
    expect(location.searchParams.get("import")).toBe("todoist-started");
    expect(exchangeTodoistCode).toHaveBeenCalledWith(
      { clientId: "cid", clientSecret: "secret" },
      "c0de"
    );
    expect(prisma.importRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: USER,
        workspaceId: PERSONAL,
        source: "todoist",
        encryptedToken: "enc(todoist-token)",
      }),
    });
    expect(enqueueImportRun).toHaveBeenCalledWith("run-1");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${IMPORT_STATE_COOKIE}=;`);
    expect(setCookie).toMatch(/Max-Age=0/i);
  });

  it("goes back with todoist-denied when the person refuses at Todoist", async () => {
    const { state, nonce } = createImportOAuthState(USER, PERSONAL);
    const res = await callback(
      callbackRequest(state, nonce, "&error=access_denied")
    );
    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("import")).toBe("todoist-denied");
    expect(exchangeTodoistCode).not.toHaveBeenCalled();
  });

  it("refuses POST /api/imports for a VIEWER of the workspace", async () => {
    const res = await startImport(
      new NextRequest("http://localhost:3000/api/imports", {
        method: "POST",
        headers: { "x-workspace-id": SHARED },
        body: JSON.stringify({ source: "todoist", token: "personal" }),
      })
    );
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("WORKSPACE_ROLE_REQUIRED");
    expect(prisma.importRun.create).not.toHaveBeenCalled();
  });

  it("refuses the authorize step for a VIEWER of the workspace", async () => {
    const res = await authorize(
      new NextRequest(
        `http://localhost:3000/api/imports/todoist/authorize?workspaceId=${SHARED}`
      )
    );
    expect(res.status).toBe(403);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("lets the owner start and get the Todoist consent URL with a nonce cookie", async () => {
    const res = await authorize(
      new NextRequest("http://localhost:3000/api/imports/todoist/authorize")
    );
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.host).toBe("app.todoist.com");
    expect(location.searchParams.get("scope")).toBe("data:read");
    expect(res.headers.get("set-cookie")).toMatch(
      new RegExp(`^${IMPORT_STATE_COOKIE}=[\\w-]+;.*HttpOnly`, "i")
    );
  });
});
