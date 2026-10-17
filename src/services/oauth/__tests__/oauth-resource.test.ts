import { validateAuthorizationRequest } from "@/services/oauth/authorize";
import { checkResource, resolveAccessToken } from "@/services/oauth/grants";

import { isMcpResource, mcpResourceAliases } from "@/lib/mcp-config";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    oAuthToken: { findUnique: jest.fn(), update: jest.fn() },
    oAuthClient: { findUnique: jest.fn() },
  },
}));

const CANONICAL = "https://mcp.needt.app/mcp";
const ALIAS = "https://use.needt.app/api/mcp";
const FOREIGN = "https://evil.example/api/mcp";

const original = { ...process.env };
beforeEach(() => {
  delete process.env.MCP_RESOURCE_URL;
  process.env.NEXTAUTH_URL = "https://use.needt.app";
  jest.clearAllMocks();
});
afterAll(() => {
  process.env = original;
});

describe("MCP resource aliases", () => {
  it("accepts the canonical resource and the NEXTAUTH_URL /api/mcp alias", () => {
    expect(mcpResourceAliases()).toEqual([CANONICAL, ALIAS]);
    expect(isMcpResource(CANONICAL)).toBe(true);
    expect(isMcpResource(ALIAS)).toBe(true);
  });

  it("rejects a foreign, near-miss, empty or missing resource", () => {
    for (const r of [
      FOREIGN,
      `${ALIAS}/`,
      "https://USE.needt.app/api/mcp",
      "",
      null,
      undefined,
    ]) {
      expect(isMcpResource(r)).toBe(false);
    }
  });

  it("follows the NEXTAUTH_URL origin", () => {
    process.env.NEXTAUTH_URL = "https://staging.example/";
    expect(isMcpResource("https://staging.example/api/mcp")).toBe(true);
    expect(isMcpResource(ALIAS)).toBe(false);
  });

  it("checkResource throws invalid_target only for a foreign resource", () => {
    expect(() => checkResource(CANONICAL)).not.toThrow();
    expect(() => checkResource(ALIAS)).not.toThrow();
    expect(() => checkResource(FOREIGN)).toThrow(/resource must be one of/);
  });
});

describe("/oauth/authorize resource", () => {
  const client = {
    id: "c1",
    kind: "dcr",
    clientId: "client-1",
    redirectUris: ["https://client.example/cb"],
  };
  const run = (resource: string) => {
    (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(client);
    return validateAuthorizationRequest(
      new URLSearchParams({
        client_id: "client-1",
        redirect_uri: "https://client.example/cb",
        response_type: "code",
        code_challenge: "a".repeat(43),
        code_challenge_method: "S256",
        resource,
      })
    );
  };

  it.each([CANONICAL, ALIAS])("accepts %s", async (resource) => {
    const result = await run(resource);
    expect(result).toMatchObject({ ok: true, request: { resource } });
  });

  it("still rejects a foreign resource with invalid_target", async () => {
    expect(await run(FOREIGN)).toMatchObject({
      ok: false,
      error: "invalid_target",
    });
  });
});

describe("access token audience at /api/mcp", () => {
  const stored = (resource: string) => ({
    id: "t1",
    type: "access",
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    lastUsedAt: new Date(),
    resource,
    client: { clientId: "client-1" },
  });

  it.each([CANONICAL, ALIAS])("accepts a token issued for %s", async (r) => {
    (prisma.oAuthToken.findUnique as jest.Mock).mockResolvedValue(stored(r));
    expect(await resolveAccessToken("ndt_oat_x")).not.toBeNull();
  });

  it("rejects a token issued for a foreign resource", async () => {
    (prisma.oAuthToken.findUnique as jest.Mock).mockResolvedValue(
      stored(FOREIGN)
    );
    expect(await resolveAccessToken("ndt_oat_x")).toBeNull();
  });
});
