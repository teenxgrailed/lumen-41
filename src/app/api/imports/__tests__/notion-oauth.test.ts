import { NextRequest } from "next/server";

import { GET as rawAuthorize } from "@/app/api/imports/notion/authorize/route";
import { GET as rawCallback } from "@/app/api/imports/notion/callback/route";
import {
  GET as rawListImports,
  POST as rawStartImport,
} from "@/app/api/imports/route";
import { GET as rawTodoistCallback } from "@/app/api/imports/todoist/callback/route";
import { exchangeNotionCode } from "@/services/imports/notion/client";
import {
  IMPORT_STATE_COOKIE,
  createImportOAuthState,
  verifyImportOAuthState,
} from "@/services/imports/service";

import { isFeatureEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";
import { enqueueImportRun } from "@/lib/queue/enqueue";

/*
 * The Notion OAuth routes run the real session auth and workspace-role check
 * over a mocked database, like the Todoist ones: the person owns a personal
 * workspace and is only a VIEWER of "shared-ws".
 */

jest.mock("@/lib/security/rate-limit", () => ({
  accountRule: jest.fn(() => ({})),
  ipRule: jest.fn(() => ({})),
  enforceRateLimits: jest.fn().mockResolvedValue(null),
  enforceByteBudget: jest.fn().mockResolvedValue(null),
}));
jest.mock("next-auth/jwt", () => ({
  getToken: jest.fn().mockResolvedValue({ sub: "user-1" }),
}));
jest.mock("@/lib/auth/email-verification-access", () => ({
  getEmailVerificationStatus: jest
    .fn()
    .mockResolvedValue({ required: false, verified: true }),
}));
jest.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: jest.fn().mockResolvedValue(true),
}));
jest.mock("@/lib/entitlements", () => ({
  getPlan: jest.fn().mockResolvedValue("PRO"),
}));
jest.mock("@/lib/queue/enqueue", () => ({ enqueueImportRun: jest.fn() }));
jest.mock("@/services/imports/token-secret", () => ({
  sealImportToken: (v: string) => `enc(${v})`,
}));
jest.mock("@/services/imports/notion/client", () => ({
  ...jest.requireActual("@/services/imports/notion/client"),
  exchangeNotionCode: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    workspace: { upsert: jest.fn(), findUnique: jest.fn() },
    workspaceMember: { upsert: jest.fn(), findUnique: jest.fn() },
    importRun: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const USER = "user-1";
const PERSONAL = "personal-ws";
const SHARED = "shared-ws";
const REDIRECT_URI = "https://use.needt.app/api/imports/notion/callback";

function must(response: Response | undefined): Response {
  if (!response) throw new Error("Expected a route response.");
  return response;
}
const callback = async (r: NextRequest) => must(await rawCallback(r));
const authorize = async (r: NextRequest) => must(await rawAuthorize(r));
const startImport = async (r: NextRequest) => must(await rawStartImport(r));
const list = async (r: NextRequest) => must(await rawListImports(r));

function callbackRequest(state: string, cookie?: string, query = "code=c0de") {
  return new NextRequest(
    `http://localhost:3000/api/imports/notion/callback?${query}&state=${encodeURIComponent(state)}`,
    { headers: cookie ? { cookie: `${IMPORT_STATE_COOKIE}=${cookie}` } : {} }
  );
}

describe("Notion OAuth routes", () => {
  const env = { ...process.env };
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...env,
      NEXTAUTH_URL: "https://use.needt.app",
      NOTION_CLIENT_ID: "notion-cid",
      NOTION_CLIENT_SECRET: "notion-secret",
    };
    jest.mocked(isFeatureEnabled).mockResolvedValue(true);
    jest.mocked(prisma.user.findUnique).mockResolvedValue({
      id: USER,
      isActive: true,
      sessionVersion: 0,
    } as never);
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
    jest.mocked(prisma.importRun.findMany).mockResolvedValue([]);
    jest.mocked(prisma.importRun.create).mockResolvedValue({
      id: "run-n",
      source: "notion",
      status: "queued",
      counts: { total: 0, done: 0, skipped: 0, failed: 0 },
      warnings: [],
      startedAt: null,
      finishedAt: null,
      createdAt: new Date("2026-10-12T10:00:00Z"),
    } as never);
    jest.mocked(enqueueImportRun).mockResolvedValue({ id: "job" } as never);
    jest
      .mocked(exchangeNotionCode)
      .mockResolvedValue({ accessToken: "ntn_access", refreshToken: null });
  });
  afterAll(() => {
    process.env = env;
  });

  describe("authorize", () => {
    it("sends the owner to Notion's consent screen with the documented parameters and a nonce cookie", async () => {
      const res = await authorize(
        new NextRequest("http://localhost:3000/api/imports/notion/authorize")
      );
      expect(res.status).toBe(307);
      const location = new URL(res.headers.get("location")!);
      expect(`${location.origin}${location.pathname}`).toBe(
        "https://api.notion.com/v1/oauth/authorize"
      );
      expect(location.searchParams.get("owner")).toBe("user");
      expect(location.searchParams.get("response_type")).toBe("code");
      expect(location.searchParams.get("client_id")).toBe("notion-cid");
      expect(location.searchParams.get("redirect_uri")).toBe(REDIRECT_URI);
      expect(location.searchParams.get("state")).toBeTruthy();
      const cookie = res.headers.get("set-cookie") ?? "";
      expect(cookie.startsWith(`${IMPORT_STATE_COOKIE}=`)).toBe(true);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(location.toString()).not.toContain("notion-secret");
    });

    it("makes a state that only verifies for Notion, this user and this nonce", async () => {
      const res = await authorize(
        new NextRequest("http://localhost:3000/api/imports/notion/authorize")
      );
      const state = new URL(res.headers.get("location")!).searchParams.get(
        "state"
      );
      const nonce = /=([\w-]+);/.exec(res.headers.get("set-cookie") ?? "")?.[1];
      expect(verifyImportOAuthState(state, USER, nonce, "notion")).toEqual({
        workspaceId: PERSONAL,
      });
      expect(verifyImportOAuthState(state, USER, nonce, "todoist")).toBeNull();
      expect(
        verifyImportOAuthState(state, "intruder", nonce, "notion")
      ).toBeNull();
    });

    it("answers 503 NOT_CONFIGURED without client credentials and sets no cookie", async () => {
      delete process.env.NOTION_CLIENT_ID;
      const res = await authorize(
        new NextRequest("http://localhost:3000/api/imports/notion/authorize")
      );
      expect(res.status).toBe(503);
      expect((await res.json()).code).toBe("NOT_CONFIGURED");
      expect(res.headers.get("set-cookie")).toBeNull();
    });

    it("answers 404 while the imports flag is off", async () => {
      jest.mocked(isFeatureEnabled).mockResolvedValue(false);
      const res = await authorize(
        new NextRequest("http://localhost:3000/api/imports/notion/authorize")
      );
      expect(res.status).toBe(404);
      expect((await res.json()).code).toBe("IMPORTS_DISABLED");
    });

    it("refuses a VIEWER of the target workspace", async () => {
      const res = await authorize(
        new NextRequest(
          `http://localhost:3000/api/imports/notion/authorize?workspaceId=${SHARED}`
        )
      );
      expect(res.status).toBe(403);
      expect(res.headers.get("set-cookie")).toBeNull();
    });
  });

  describe("callback", () => {
    it("rejects a state that is not ours, a wrong nonce, and an expired state", async () => {
      expect(
        (await callback(callbackRequest("garbage.sig", "nonce"))).status
      ).toBe(400);
      const { state, nonce } = createImportOAuthState(USER, PERSONAL, "notion");
      expect((await callback(callbackRequest(state, "other"))).status).toBe(
        400
      );
      expect((await callback(callbackRequest(state))).status).toBe(400);
      jest.useFakeTimers();
      jest.setSystemTime(Date.now() - 11 * 60 * 1_000);
      const old = createImportOAuthState(USER, PERSONAL, "notion");
      jest.useRealTimers();
      expect(
        (await callback(callbackRequest(old.state, old.nonce))).status
      ).toBe(400);
      expect(exchangeNotionCode).not.toHaveBeenCalled();
      expect(nonce).toBeTruthy();
    });

    it("rejects a Todoist state, and Notion's state is rejected by Todoist's callback", async () => {
      const todoist = createImportOAuthState(USER, PERSONAL, "todoist");
      expect(
        (await callback(callbackRequest(todoist.state, todoist.nonce))).status
      ).toBe(400);
      const notion = createImportOAuthState(USER, PERSONAL, "notion");
      const res = must(
        await rawTodoistCallback(
          new NextRequest(
            `http://localhost:3000/api/imports/todoist/callback?code=c&state=${encodeURIComponent(notion.state)}`,
            { headers: { cookie: `${IMPORT_STATE_COOKIE}=${notion.nonce}` } }
          )
        )
      );
      expect(res.status).toBe(400);
      expect(exchangeNotionCode).not.toHaveBeenCalled();
    });

    it("creates and queues a run with the encrypted token and clears the nonce cookie", async () => {
      const { state, nonce } = createImportOAuthState(USER, PERSONAL, "notion");
      const res = await callback(callbackRequest(state, nonce));
      expect(res.status).toBe(307);
      const location = new URL(res.headers.get("location")!);
      expect(location.pathname).toBe("/settings");
      expect(location.hash).toBe("#data");
      expect(location.searchParams.get("import")).toBe("notion-started");
      expect(exchangeNotionCode).toHaveBeenCalledWith(
        { clientId: "notion-cid", clientSecret: "notion-secret" },
        "c0de",
        REDIRECT_URI
      );
      expect(prisma.importRun.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: USER,
          workspaceId: PERSONAL,
          source: "notion",
          encryptedToken: "enc(ntn_access)",
        }),
      });
      expect(enqueueImportRun).toHaveBeenCalledWith("run-n");
      expect(res.headers.get("set-cookie")).toMatch(/Max-Age=0/i);
    });

    it("keeps a refresh token with the access token, both encrypted together", async () => {
      jest
        .mocked(exchangeNotionCode)
        .mockResolvedValue({ accessToken: "a", refreshToken: "r" });
      const { state, nonce } = createImportOAuthState(USER, PERSONAL, "notion");
      await callback(callbackRequest(state, nonce));
      const data = jest.mocked(prisma.importRun.create).mock.calls[0][0].data;
      expect(
        JSON.parse(String(data.encryptedToken).replace(/^enc\(|\)$/g, ""))
      ).toEqual({ a: "a", r: "r" });
    });

    it("goes back with notion-denied when the person cancels at Notion", async () => {
      const { state, nonce } = createImportOAuthState(USER, PERSONAL, "notion");
      const res = await callback(
        callbackRequest(state, nonce, "error=access_denied")
      );
      const location = new URL(res.headers.get("location")!);
      expect(location.searchParams.get("import")).toBe("notion-denied");
      expect(exchangeNotionCode).not.toHaveBeenCalled();
      expect(prisma.importRun.create).not.toHaveBeenCalled();
    });

    it("goes back with notion-failed when the code is missing, Notion refuses it, or the flag is off", async () => {
      const a = createImportOAuthState(USER, PERSONAL, "notion");
      expect(
        new URL(
          (
            await callback(callbackRequest(a.state, a.nonce, "x=1"))
          ).headers.get("location")!
        ).searchParams.get("import")
      ).toBe("notion-failed");

      jest
        .mocked(exchangeNotionCode)
        .mockRejectedValueOnce(new Error("boom ntn_secret"));
      const b = createImportOAuthState(USER, PERSONAL, "notion");
      const failed = await callback(callbackRequest(b.state, b.nonce));
      expect(
        new URL(failed.headers.get("location")!).searchParams.get("import")
      ).toBe("notion-failed");
      expect(failed.headers.get("location")).not.toContain("ntn_secret");

      jest.mocked(isFeatureEnabled).mockResolvedValue(false);
      const c = createImportOAuthState(USER, PERSONAL, "notion");
      const off = await callback(callbackRequest(c.state, c.nonce));
      expect(
        new URL(off.headers.get("location")!).searchParams.get("import")
      ).toBe("notion-failed");
      expect(prisma.importRun.create).not.toHaveBeenCalled();
    });

    it("sends a VIEWER of the target workspace back with notion-failed", async () => {
      const { state, nonce } = createImportOAuthState(USER, SHARED, "notion");
      const res = await callback(callbackRequest(state, nonce));
      expect(
        new URL(res.headers.get("location")!).searchParams.get("import")
      ).toBe("notion-failed");
      expect(exchangeNotionCode).not.toHaveBeenCalled();
      expect(prisma.importRun.create).not.toHaveBeenCalled();
    });

    it("does not start a second import while one is running", async () => {
      jest
        .mocked(prisma.importRun.findFirst)
        .mockResolvedValue({ id: "run-x", status: "running" } as never);
      const { state, nonce } = createImportOAuthState(USER, PERSONAL, "notion");
      const res = await callback(callbackRequest(state, nonce));
      expect(
        new URL(res.headers.get("location")!).searchParams.get("import")
      ).toBe("notion-running");
      expect(exchangeNotionCode).not.toHaveBeenCalled();
    });
  });

  describe("the shared start and list routes", () => {
    it("lists Notion beside Todoist, configured only with client credentials", async () => {
      const on = await (
        await list(new NextRequest("http://localhost:3000/api/imports"))
      ).json();
      expect(on.sources.notion).toEqual({ configured: true });
      delete process.env.NOTION_CLIENT_SECRET;
      const off = await (
        await list(new NextRequest("http://localhost:3000/api/imports"))
      ).json();
      expect(off.sources.notion).toEqual({ configured: false });
      expect(off.sources.todoist).toBeDefined();
    });

    it("lists the recent runs of each source, so a busy source does not hide the other", async () => {
      const row = (id: string, source: string, at: string) => ({
        id,
        source,
        status: "done",
        counts: { total: 1, done: 1, skipped: 0, failed: 0 },
        warnings: [],
        startedAt: null,
        finishedAt: null,
        createdAt: new Date(at),
      });
      jest
        .mocked(prisma.importRun.findMany)
        .mockImplementation((async (args: { where: { source: string } }) =>
          args.where.source === "notion"
            ? [row("n1", "notion", "2026-10-01T00:00:00Z")]
            : [
                row("t2", "todoist", "2026-10-03T00:00:00Z"),
                row("t1", "todoist", "2026-10-02T00:00:00Z"),
              ]) as never);
      const body = await (
        await list(new NextRequest("http://localhost:3000/api/imports"))
      ).json();
      expect(body.runs.map((r: { id: string }) => r.id)).toEqual([
        "t2",
        "t1",
        "n1",
      ]);
    });

    it("hides the Notion source while the flag is off", async () => {
      jest.mocked(isFeatureEnabled).mockResolvedValue(false);
      const body = await (
        await list(new NextRequest("http://localhost:3000/api/imports"))
      ).json();
      expect(body).toEqual({ enabled: false, sources: {}, runs: [] });
      const start = await startImport(
        new NextRequest("http://localhost:3000/api/imports", {
          method: "POST",
          body: JSON.stringify({ source: "notion" }),
        })
      );
      expect(start.status).toBe(404);
    });

    it("starts a Notion import by answering with the Notion authorize URL", async () => {
      const res = await startImport(
        new NextRequest("http://localhost:3000/api/imports", {
          method: "POST",
          body: JSON.stringify({ source: "notion" }),
        })
      );
      expect(res.status).toBe(200);
      expect((await res.json()).authorizeUrl).toMatch(
        /\/api\/imports\/notion\/authorize\?workspaceId=personal-ws$/
      );
    });

    it("answers 503 NOT_CONFIGURED for Notion without credentials, naming Notion", async () => {
      delete process.env.NOTION_CLIENT_ID;
      const res = await startImport(
        new NextRequest("http://localhost:3000/api/imports", {
          method: "POST",
          body: JSON.stringify({ source: "notion" }),
        })
      );
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.code).toBe("NOT_CONFIGURED");
      expect(body.error).toContain("Notion");
    });

    it("queues a run straight away for a Notion integration token", async () => {
      const res = await startImport(
        new NextRequest("http://localhost:3000/api/imports", {
          method: "POST",
          body: JSON.stringify({ source: "notion", token: "ntn_internal" }),
        })
      );
      expect(res.status).toBe(202);
      expect(prisma.importRun.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          source: "notion",
          encryptedToken: "enc(ntn_internal)",
        }),
      });
    });

    it("refuses an unknown source", async () => {
      const res = await startImport(
        new NextRequest("http://localhost:3000/api/imports", {
          method: "POST",
          body: JSON.stringify({ source: "evernote" }),
        })
      );
      expect(res.status).toBe(400);
    });
  });
});
