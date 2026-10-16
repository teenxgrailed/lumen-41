import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/security/secret-encryption";

import { PinterestApiError, refreshPinterestTokens } from "../client";
import {
  accessTokenFor,
  createPinterestState,
  deleteConnection,
  verifyPinterestState,
} from "../connection";

jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    pinterestConnection: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    moodboard: { updateMany: jest.fn() },
    $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops)),
  },
}));
jest.mock("../client", () => ({
  ...jest.requireActual("../client"),
  refreshPinterestTokens: jest.fn(),
}));

process.env.NEXTAUTH_SECRET = "test-secret-for-pinterest";
process.env.PINTEREST_CLIENT_ID = "id";
process.env.PINTEREST_CLIENT_SECRET = "secret";

const HOUR = 3600_000;
const row = (over: Record<string, unknown> = {}) => ({
  userId: "u1",
  status: "CONNECTED",
  accessToken: encryptSecret("live-token"),
  refreshToken: encryptSecret("pinr_old"),
  accessExpiresAt: new Date(Date.now() + 24 * HOUR),
  refreshExpiresAt: new Date(Date.now() + 48 * HOUR),
  scope: "boards:read",
  ...over,
});

beforeEach(() => jest.clearAllMocks());

describe("OAuth state", () => {
  it("round-trips for the same user and nonce, carrying the moodboard", () => {
    const { state, nonce } = createPinterestState("u1", "mb_1");
    expect(verifyPinterestState(state, "u1", nonce)).toEqual({
      moodboardId: "mb_1",
    });
  });

  it("is refused for another user, another nonce, or a tampered body", () => {
    const { state, nonce } = createPinterestState("u1");
    expect(verifyPinterestState(state, "u2", nonce)).toBeNull();
    expect(verifyPinterestState(state, "u1", "other")).toBeNull();
    expect(verifyPinterestState(state, "u1", undefined)).toBeNull();
    const [payload, sig] = state.split(".");
    const forged = Buffer.from(
      JSON.stringify({ n: nonce, e: Date.now() + 1e6, b: "x" })
    ).toString("base64url");
    expect(verifyPinterestState(`${forged}.${sig}`, "u1", nonce)).toBeNull();
    expect(payload).toBeTruthy();
  });
});

describe("accessTokenFor", () => {
  it("returns the decrypted token while it is fresh", async () => {
    (prisma.pinterestConnection.findUnique as jest.Mock).mockResolvedValue(
      row()
    );
    expect(await accessTokenFor("u1")).toBe("live-token");
    expect(refreshPinterestTokens).not.toHaveBeenCalled();
  });

  it("refreshes a token about to end and stores the new ones encrypted", async () => {
    (prisma.pinterestConnection.findUnique as jest.Mock).mockResolvedValue(
      row({ accessExpiresAt: new Date(Date.now() + 60_000) })
    );
    (refreshPinterestTokens as jest.Mock).mockResolvedValue({
      accessToken: "new-token",
      refreshToken: "pinr_new",
      accessExpiresAt: new Date(Date.now() + 30 * 24 * HOUR),
      refreshExpiresAt: new Date(Date.now() + 60 * 24 * HOUR),
      scope: "boards:read",
    });
    expect(await accessTokenFor("u1")).toBe("new-token");
    const data = (prisma.pinterestConnection.update as jest.Mock).mock
      .calls[0][0].data;
    expect(data.accessToken).not.toBe("new-token");
    expect(decryptSecret(data.accessToken)).toBe("new-token");
    expect(decryptSecret(data.refreshToken)).toBe("pinr_new");
  });

  it("marks the connection as needing a reconnect when the refresh is refused", async () => {
    (prisma.pinterestConnection.findUnique as jest.Mock).mockResolvedValue(
      row({ accessExpiresAt: new Date(Date.now() - HOUR) })
    );
    (refreshPinterestTokens as jest.Mock).mockRejectedValue(
      new PinterestApiError("unauthorized", "revoked")
    );
    await expect(accessTokenFor("u1")).rejects.toMatchObject({
      code: "unauthorized",
    });
    expect(prisma.pinterestConnection.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
      data: { status: "ERROR" },
    });
    expect(prisma.moodboard.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { pinterestStatus: "lost" } })
    );
  });

  it("does not call Pinterest at all once the connection is in error", async () => {
    (prisma.pinterestConnection.findUnique as jest.Mock).mockResolvedValue(
      row({ status: "ERROR", accessExpiresAt: new Date(Date.now() - HOUR) })
    );
    await expect(accessTokenFor("u1")).rejects.toMatchObject({
      code: "unauthorized",
    });
    expect(refreshPinterestTokens).not.toHaveBeenCalled();
  });
});

it("disconnecting stops the sync of the person's boards", async () => {
  await deleteConnection("u1");
  expect(prisma.moodboard.updateMany).toHaveBeenCalledWith({
    where: { pinterestConnectedById: "u1" },
    data: { pinterestSync: false },
  });
  expect(prisma.pinterestConnection.deleteMany).toHaveBeenCalledWith({
    where: { userId: "u1" },
  });
});
