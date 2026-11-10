import { resolveAccessToken } from "@/services/oauth/grants";

import { revokeAllAccess } from "@/lib/auth/session-version";

import { sha256Hex } from "../../../services/oauth/crypto";

type Row = Record<string, unknown>;

const mockStore = {
  oAuthToken: [] as Row[],
  oAuthAuthorizationCode: [] as Row[],
  hubAgentToken: [] as Row[],
  hubAgent: [] as Row[],
};

// Just enough of Prisma's `where` for these writes: equality, null, agent.userId.
function mockMatches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, want]) => {
    if (key === "agent") {
      const agent = mockStore.hubAgent.find((a) => a.id === row.agentId);
      return Boolean(agent) && mockMatches(agent as Row, want as Row);
    }
    return row[key] === want;
  });
}
function mockUpdateMany(
  rows: Row[],
  { where, data }: { where: Row; data: Row }
) {
  let count = 0;
  for (const row of rows) {
    if (mockMatches(row, where)) {
      Object.assign(row, data);
      count++;
    }
  }
  return Promise.resolve({ count });
}

jest.mock("@auth/prisma-adapter", () => ({
  PrismaAdapter: jest.fn(() => ({})),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { update: jest.fn(async () => ({ sessionVersion: 2 })) },
    connectorSettings: { updateMany: jest.fn(async () => ({ count: 0 })) },
    personalApiToken: { updateMany: jest.fn(async () => ({ count: 0 })) },
    oAuthToken: {
      findUnique: jest.fn(async ({ where }: { where: Row }) => {
        const row = mockStore.oAuthToken.find(
          (r) => r.tokenHash === where.tokenHash
        );
        return row ? { ...row, client: { clientId: "client-1" } } : null;
      }),
      update: jest.fn(async () => ({})),
      updateMany: jest.fn((args: { where: Row; data: Row }) =>
        mockUpdateMany(mockStore.oAuthToken, args)
      ),
    },
    oAuthAuthorizationCode: {
      updateMany: jest.fn((args: { where: Row; data: Row }) =>
        mockUpdateMany(mockStore.oAuthAuthorizationCode, args)
      ),
    },
    hubAgentToken: {
      updateMany: jest.fn((args: { where: Row; data: Row }) =>
        mockUpdateMany(mockStore.hubAgentToken, args)
      ),
    },
  },
}));

function oauthRow(token: string, type: string, userId: string): Row {
  return {
    id: token,
    tokenHash: sha256Hex(token),
    type,
    userId,
    scope: "needt.read",
    resource: "https://mcp.needt.app/mcp",
    workspaceId: null,
    expiresAt: new Date(Date.now() + 3_600_000),
    revokedAt: null,
    lastUsedAt: new Date(),
  };
}

describe("revokeAllAccess reaches OAuth and Hub credentials", () => {
  beforeEach(() => {
    process.env.MCP_RESOURCE_URL = "https://mcp.needt.app/mcp";
    mockStore.oAuthToken = [
      oauthRow("ndt_oat_victim", "access", "victim"),
      oauthRow("ndt_ort_victim", "refresh", "victim"),
      oauthRow("ndt_oat_other", "access", "someone-else"),
    ];
    mockStore.oAuthAuthorizationCode = [
      { id: "c1", userId: "victim", usedAt: null },
      { id: "c2", userId: "someone-else", usedAt: null },
    ];
    mockStore.hubAgent = [
      { id: "a1", userId: "victim" },
      { id: "a2", userId: "someone-else" },
    ];
    mockStore.hubAgentToken = [
      { id: "h1", agentId: "a1", revokedAt: null },
      { id: "h2", agentId: "a2", revokedAt: null },
    ];
  });

  it("an OAuth access token works before and stops after", async () => {
    expect(await resolveAccessToken("ndt_oat_victim")).not.toBeNull();
    await Promise.all(revokeAllAccess("victim"));
    expect(await resolveAccessToken("ndt_oat_victim")).toBeNull();
  });

  it("revokes the refresh token, unused codes and Hub tokens of that person only", async () => {
    await Promise.all(revokeAllAccess("victim"));
    const byId = (rows: Row[], id: string) => rows.find((r) => r.id === id);
    // The refresh path refuses a row with revokedAt set.
    expect(
      byId(mockStore.oAuthToken, "ndt_ort_victim")?.revokedAt
    ).toBeInstanceOf(Date);
    expect(byId(mockStore.oAuthAuthorizationCode, "c1")?.usedAt).toBeInstanceOf(
      Date
    );
    expect(byId(mockStore.hubAgentToken, "h1")?.revokedAt).toBeInstanceOf(Date);
    // Another person's credentials are untouched.
    expect(await resolveAccessToken("ndt_oat_other")).not.toBeNull();
    expect(byId(mockStore.oAuthAuthorizationCode, "c2")?.usedAt).toBeNull();
    expect(byId(mockStore.hubAgentToken, "h2")?.revokedAt).toBeNull();
  });
});
