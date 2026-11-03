import { NextRequest, NextResponse } from "next/server";

import { hashConnectorToken } from "@/services/connectors/auth-tokens";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";
import { refuseSandbox } from "@/lib/sandbox/guard";
import { enforceRateLimits } from "@/lib/security/rate-limit";

import * as byId from "../[id]/route";
import * as collection from "../route";

/** The handlers type their response as possibly undefined; a test needs one. */
const must =
  <A extends unknown[]>(
    handler: (...args: A) => Promise<NextResponse | undefined>
  ) =>
  async (...args: A) => {
    const response = await handler(...args);
    if (!response) throw new Error("Expected a route response.");
    return response;
  };
const GET = must(collection.GET);
const POST = must(collection.POST);
const PATCH = must(byId.PATCH);
const DELETE = must(byId.DELETE);

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/sandbox/guard", () => ({ refuseSandbox: jest.fn() }));
jest.mock("@/lib/security/rate-limit", () => ({
  accountRule: jest.fn((_v, namespace, limit) => ({ namespace, limit })),
  enforceRateLimits: jest.fn(),
}));
jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    connectorSettings: { findUnique: jest.fn(), updateMany: jest.fn() },
    personalApiToken: {
      count: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

const tokens = prisma.personalApiToken as unknown as Record<string, jest.Mock>;
const settings = prisma.connectorSettings as unknown as Record<
  string,
  jest.Mock
>;

const url = "http://localhost/api/personal-tokens";
const json = (method: string, body?: unknown, path = url) =>
  new NextRequest(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const row = (over: Record<string, unknown> = {}) => ({
  id: "tok-1",
  userId: "user-1",
  name: "Chrome",
  tokenPreview: "needt_abcd...wxyz",
  createdAt: new Date("2026-11-03T10:00:00Z"),
  lastUsedAt: null,
  expiresAt: new Date("2027-11-03T10:00:00Z"),
  revokedAt: null,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(authenticateRequest)
    .mockResolvedValue({ userId: "user-1" } as never);
  jest.mocked(refuseSandbox).mockResolvedValue(null);
  jest.mocked(enforceRateLimits).mockResolvedValue(null);
  tokens.count.mockResolvedValue(0);
  tokens.create.mockImplementation(async ({ data }) => row(data));
  tokens.findMany.mockResolvedValue([row()]);
  settings.findUnique.mockResolvedValue(null);
});

describe("session-only", () => {
  it("answers 401 to every handler without a session", async () => {
    jest.mocked(authenticateRequest).mockResolvedValue({
      response: new NextResponse("Unauthorized", { status: 401 }),
    } as never);
    const statuses = [
      (await GET(json("GET"))).status,
      (await POST(json("POST", { name: "x" }))).status,
      (await PATCH(json("PATCH", { name: "x" }), ctx("t"))).status,
      (await DELETE(json("DELETE"), ctx("t"))).status,
    ];
    expect(statuses).toEqual([401, 401, 401, 401]);
    expect(tokens.create).not.toHaveBeenCalled();
    expect(tokens.updateMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/personal-tokens", () => {
  it("lists tokens without hashes", async () => {
    const body = await (await GET(json("GET"))).json();
    expect(body.tokens).toHaveLength(1);
    expect(body.tokens[0]).toMatchObject({ id: "tok-1", name: "Chrome" });
    expect(JSON.stringify(body)).not.toMatch(/tokenHash/);
  });
});

describe("POST /api/personal-tokens", () => {
  it("creates a named token and returns the plaintext once", async () => {
    const response = await POST(json("POST", { name: "Grok Bot" }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.token).toMatch(/^needt_/);
    expect(body.name).toBe("Grok Bot");
    expect(tokens.create.mock.calls[0][0].data.tokenHash).toBe(
      hashConnectorToken(body.token)
    );
    expect(JSON.stringify(tokens.create.mock.calls[0][0])).not.toContain(
      body.token
    );
    // Not a list entry afterwards.
    const list = await (await GET(json("GET"))).json();
    expect(JSON.stringify(list)).not.toContain(body.token);
  });

  it("400s without a name or with malformed JSON", async () => {
    expect((await POST(json("POST", {}))).status).toBe(400);
    expect(
      (
        await POST(
          new NextRequest(url, {
            method: "POST",
            body: "{nope",
            headers: { "content-type": "application/json" },
          })
        )
      ).status
    ).toBe(400);
    expect(tokens.create).not.toHaveBeenCalled();
  });

  it("is refused for a sandbox account", async () => {
    jest
      .mocked(refuseSandbox)
      .mockResolvedValue(
        NextResponse.json({ error: "locked" }, { status: 403 })
      );
    const response = await POST(json("POST", { name: "x" }));
    expect(response.status).toBe(403);
    expect(refuseSandbox).toHaveBeenCalledWith("user-1", "api_tokens");
    expect(tokens.create).not.toHaveBeenCalled();
  });

  it("is rate limited", async () => {
    jest
      .mocked(enforceRateLimits)
      .mockResolvedValue(
        NextResponse.json({ error: "slow down" }, { status: 429 })
      );
    expect((await POST(json("POST", { name: "x" }))).status).toBe(429);
    expect(tokens.create).not.toHaveBeenCalled();
  });
});

describe("PATCH and DELETE /api/personal-tokens/[id]", () => {
  it("renames", async () => {
    tokens.updateMany.mockResolvedValue({ count: 1 });
    tokens.findFirst.mockResolvedValue(row({ name: "Script" }));
    const response = await PATCH(
      json("PATCH", { name: "Script" }),
      ctx("tok-1")
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ name: "Script" });
  });

  it("will not rename Default", async () => {
    const response = await PATCH(json("PATCH", { name: "x" }), ctx("default"));
    expect(response.status).toBe(400);
  });

  it("revokes one token", async () => {
    tokens.updateMany.mockResolvedValue({ count: 1 });
    const response = await DELETE(json("DELETE"), ctx("tok-1"));
    expect(response.status).toBe(200);
    expect(tokens.updateMany).toHaveBeenCalledWith({
      where: { id: "tok-1", userId: "user-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("404s a token that is not yours", async () => {
    tokens.updateMany.mockResolvedValue({ count: 0 });
    expect((await DELETE(json("DELETE"), ctx("theirs"))).status).toBe(404);
    expect(
      (await PATCH(json("PATCH", { name: "x" }), ctx("theirs"))).status
    ).toBe(404);
  });

  it("revokes Default through the legacy token", async () => {
    settings.updateMany.mockResolvedValue({ count: 1 });
    expect((await DELETE(json("DELETE"), ctx("default"))).status).toBe(200);
    expect(settings.updateMany).toHaveBeenCalled();
    expect(tokens.updateMany).not.toHaveBeenCalled();
  });
});
