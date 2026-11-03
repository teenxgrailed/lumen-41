import { prisma } from "@/lib/prisma";

import { hashConnectorToken } from "../auth-tokens";
import {
  DEFAULT_TOKEN_ID,
  PERSONAL_TOKEN_LIMIT,
  PersonalTokenError,
  createPersonalToken,
  listPersonalTokens,
  parseTokenName,
  renamePersonalToken,
  revokeNamedPersonalTokens,
  revokePersonalToken,
} from "../personal-tokens";

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

const settings = prisma.connectorSettings as unknown as {
  findUnique: jest.Mock;
  updateMany: jest.Mock;
};
const tokens = prisma.personalApiToken as unknown as {
  count: jest.Mock;
  create: jest.Mock;
  findMany: jest.Mock;
  findFirst: jest.Mock;
  updateMany: jest.Mock;
};

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
  tokens.count.mockResolvedValue(0);
  tokens.create.mockImplementation(async ({ data }) => row(data));
  tokens.findMany.mockResolvedValue([]);
  settings.findUnique.mockResolvedValue(null);
});

describe("createPersonalToken", () => {
  it("stores only the hash and returns the plaintext once", async () => {
    const { token, entry } = await createPersonalToken("user-1", "  Chrome ");
    expect(token).toMatch(/^needt_/);
    const data = tokens.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ userId: "user-1", name: "Chrome" });
    expect(data.tokenHash).toBe(hashConnectorToken(token));
    expect(JSON.stringify(data)).not.toContain(token);
    expect(entry).toMatchObject({ name: "Chrome", legacy: false });
    expect(JSON.stringify(entry)).not.toContain(token);
    // A year, like the Default token.
    expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now() + 360 * 864e5);
  });

  it("refuses a missing, blank or over-long name", async () => {
    for (const bad of [undefined, 5, "", "   ", "x".repeat(61)]) {
      await expect(createPersonalToken("user-1", bad)).rejects.toMatchObject({
        status: 400,
      });
    }
    expect(tokens.create).not.toHaveBeenCalled();
    expect(parseTokenName("x".repeat(60))).toHaveLength(60);
  });

  it("stops at the limit of live tokens", async () => {
    tokens.count.mockResolvedValue(PERSONAL_TOKEN_LIMIT);
    await expect(
      createPersonalToken("user-1", "One more")
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("listPersonalTokens", () => {
  it("lists the legacy token as Default first, then named ones, never revoked", async () => {
    settings.findUnique.mockResolvedValue({
      tokenHash: "h",
      tokenPreview: "needt_old...abcd",
      tokenExpiresAt: null,
      tokenLastUsedAt: new Date("2026-11-02T00:00:00Z"),
    });
    tokens.findMany.mockResolvedValue([row()]);
    const list = await listPersonalTokens("user-1");
    expect(tokens.findMany.mock.calls[0][0].where).toEqual({
      userId: "user-1",
      revokedAt: null,
    });
    expect(list.map((t) => [t.id, t.name, t.legacy])).toEqual([
      [DEFAULT_TOKEN_ID, "Default", true],
      ["tok-1", "Chrome", false],
    ]);
    expect(list[0]).toMatchObject({
      expiresAt: null,
      lastUsedAt: "2026-11-02T00:00:00.000Z",
    });
    expect(JSON.stringify(list)).not.toContain("tokenHash");
  });

  it("omits Default when there is no legacy token", async () => {
    settings.findUnique.mockResolvedValue({ tokenHash: null });
    expect(await listPersonalTokens("user-1")).toEqual([]);
  });

  it("marks an expired token", async () => {
    tokens.findMany.mockResolvedValue([
      row({ expiresAt: new Date(Date.now() - 1000) }),
    ]);
    expect((await listPersonalTokens("user-1"))[0].expired).toBe(true);
  });
});

describe("revoke and rename", () => {
  it("revokes one named token of this user only", async () => {
    tokens.updateMany.mockResolvedValue({ count: 1 });
    await revokePersonalToken("user-1", "tok-1");
    expect(tokens.updateMany).toHaveBeenCalledWith({
      where: { id: "tok-1", userId: "user-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(settings.updateMany).not.toHaveBeenCalled();
  });

  it("404s a token that is not this user's or already revoked", async () => {
    tokens.updateMany.mockResolvedValue({ count: 0 });
    await expect(revokePersonalToken("user-1", "other")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("revokes Default by clearing the legacy token", async () => {
    settings.updateMany.mockResolvedValue({ count: 1 });
    await revokePersonalToken("user-1", DEFAULT_TOKEN_ID);
    expect(settings.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", tokenHash: { not: null } },
      data: expect.objectContaining({ tokenHash: null, tokenPreview: null }),
    });
    expect(tokens.updateMany).not.toHaveBeenCalled();
  });

  it("renames a live named token and refuses to rename Default", async () => {
    tokens.updateMany.mockResolvedValue({ count: 1 });
    tokens.findFirst.mockResolvedValue(row({ name: "Script" }));
    await expect(
      renamePersonalToken("user-1", "tok-1", " Script ")
    ).resolves.toMatchObject({ name: "Script" });
    expect(tokens.updateMany).toHaveBeenCalledWith({
      where: { id: "tok-1", userId: "user-1", revokedAt: null },
      data: { name: "Script" },
    });
    await expect(
      renamePersonalToken("user-1", DEFAULT_TOKEN_ID, "x")
    ).rejects.toBeInstanceOf(PersonalTokenError);
  });

  it("revokes every named token for sign-out-everywhere", async () => {
    await revokeNamedPersonalTokens("user-1");
    expect(tokens.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
