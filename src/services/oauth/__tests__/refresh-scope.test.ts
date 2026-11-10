import { OAuthError, refreshTokens } from "@/services/oauth/grants";

import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => {
  const prismaMock = {
    $transaction: jest.fn(),
    oAuthAuthorizationCode: { updateMany: jest.fn() },
    oAuthToken: {
      findUnique: jest.fn(),
      createMany: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  prismaMock.$transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
    cb(prismaMock)
  );
  return { prisma: prismaMock };
});

const token = prisma.oAuthToken as unknown as {
  findUnique: jest.Mock;
  updateMany: jest.Mock;
  createMany: jest.Mock;
};

function stored(rotatedAt: Date | null = null) {
  return {
    id: "t1",
    type: "refresh",
    clientId: "c1",
    familyId: "f1",
    userId: "u1",
    scope: "needt.read",
    resource: "https://example.test/mcp",
    workspaceId: null,
    revokedAt: null,
    rotatedAt,
    expiresAt: new Date(Date.now() + 60_000),
  };
}

describe("refreshTokens scope check", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    token.updateMany.mockResolvedValue({ count: 1 });
    token.createMany.mockResolvedValue({ count: 2 });
  });

  it("rejects a wider scope without rotating the refresh token", async () => {
    token.findUnique.mockResolvedValue(stored());
    await expect(
      refreshTokens({
        refreshToken: "ndt_ort_x",
        clientDbId: "c1",
        resource: null,
        scope: "needt.read needt.write",
      })
    ).rejects.toMatchObject({ error: "invalid_scope" });
    expect(token.updateMany).not.toHaveBeenCalled();
  });

  it("still treats an already rotated token as reuse", async () => {
    token.findUnique.mockResolvedValue(stored(new Date()));
    token.updateMany.mockResolvedValue({ count: 0 });
    const err = await refreshTokens({
      refreshToken: "ndt_ort_x",
      clientDbId: "c1",
      resource: null,
      scope: "needt.write",
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OAuthError);
    expect((err as OAuthError).error).toBe("invalid_grant");
  });
});
