import type { BearerAuth } from "@/services/connectors/bearer";

import { prisma } from "@/lib/prisma";

import { agentForConnection, connectionKeyOf } from "../context";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    hubAgent: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    oAuthClient: { findUnique: jest.fn() },
  },
}));
jest.mock("@/lib/feature-flags", () => ({ agentHubEnabled: jest.fn() }));

const findUnique = prisma.hubAgent.findUnique as jest.Mock;
const create = prisma.hubAgent.create as jest.Mock;

const personal = (extra: Partial<BearerAuth> = {}): BearerAuth => ({
  userId: "user-1",
  kind: "personal",
  scopes: ["needt.read", "needt.write"],
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  findUnique.mockResolvedValue(null);
  create.mockImplementation(async ({ data }) => ({ id: "agent-1", ...data }));
});

describe("agent identity of a personal token", () => {
  it("keys a named token as token:<id>, apart from Default and agent tokens", () => {
    expect(connectionKeyOf(personal())).toBe("personal");
    expect(
      connectionKeyOf(
        personal({ personalTokenId: "tok-1", personalTokenName: "Chrome" })
      )
    ).toBe("token:tok-1");
    expect(
      connectionKeyOf({
        userId: "user-1",
        kind: "agent",
        scopes: ["agents.hub"],
        agentTokenId: "tok-2",
      })
    ).toBe("token:tok-2");
  });

  it("names a new agent after its token", async () => {
    await agentForConnection(
      personal({ personalTokenId: "tok-1", personalTokenName: "Grok Bot" }),
      "ws-1"
    );
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        workspaceId: "ws-1",
        connectionKey: "token:tok-1",
        name: "Grok Bot",
      }),
    });
  });

  it("gives two named tokens two agents, and Default its own", async () => {
    const keys: string[] = [];
    create.mockImplementation(async ({ data }) => {
      keys.push(data.connectionKey);
      return { id: data.connectionKey, ...data };
    });
    await agentForConnection(
      personal({ personalTokenId: "a", personalTokenName: "Chrome" }),
      "ws-1"
    );
    await agentForConnection(
      personal({ personalTokenId: "b", personalTokenName: "Script" }),
      "ws-1"
    );
    await agentForConnection(personal(), "ws-1");
    expect(keys).toEqual(["token:a", "token:b", "personal"]);
    expect(create.mock.calls[2][0].data.name).toBe("Personal token");
  });
});
