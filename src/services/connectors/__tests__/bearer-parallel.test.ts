import { NextRequest } from "next/server";

import { hashConnectorToken } from "@/services/connectors/auth-tokens";
import { authenticateBearer } from "@/services/connectors/bearer";

import { prisma } from "@/lib/prisma";

const warn = jest.fn();
jest.mock("@/lib/logger", () => ({
  logger: {
    warn: (...args: unknown[]) => warn(...args),
    info: jest.fn(),
    error: jest.fn(),
  },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    connectorSettings: { findUnique: jest.fn(), update: jest.fn() },
    personalApiToken: { findUnique: jest.fn(), update: jest.fn() },
    oAuthToken: { findUnique: jest.fn().mockResolvedValue(null) },
  },
}));

const legacyFind = prisma.connectorSettings.findUnique as jest.Mock;
const legacyUpdate = prisma.connectorSettings.update as jest.Mock;
const namedFind = prisma.personalApiToken.findUnique as jest.Mock;
const namedUpdate = prisma.personalApiToken.update as jest.Mock;

const TOKEN = "needt_parallel-lookup-token-value";
const request = new NextRequest("http://localhost/api/mcp", {
  headers: { authorization: `Bearer ${TOKEN}` },
});
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("personal token lookup", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    legacyFind.mockResolvedValue(null);
    namedFind.mockResolvedValue(null);
  });

  it("starts the legacy and the named lookup together", async () => {
    let releaseLegacy: (value: unknown) => void = () => undefined;
    legacyFind.mockReturnValue(
      new Promise((resolve) => {
        releaseLegacy = resolve;
      })
    );
    const pending = authenticateBearer(request);
    await flush();
    // The named lookup started while the legacy one is still in flight.
    expect(namedFind).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tokenHash: hashConnectorToken(TOKEN) },
      })
    );
    releaseLegacy(null);
    expect(await pending).toBeNull();
  });

  it("answers a named token without waiting for the last-used write", async () => {
    namedFind.mockResolvedValue({
      id: "tok-1",
      userId: "u1",
      name: "Chrome",
      expiresAt: null,
      revokedAt: null,
      lastUsedAt: null,
    });
    namedUpdate.mockReturnValue(new Promise(() => undefined)); // never settles

    const auth = await authenticateBearer(request);

    expect(auth).toMatchObject({ userId: "u1", personalTokenId: "tok-1" });
    expect(namedUpdate).toHaveBeenCalledTimes(1);
  });

  it("only logs a failed last-used write on the legacy token", async () => {
    legacyFind.mockResolvedValue({
      userId: "u1",
      tokenExpiresAt: null,
      tokenLastUsedAt: null,
    });
    legacyUpdate.mockRejectedValue(new Error("db down"));

    const auth = await authenticateBearer(request);
    await flush();

    expect(auth).toMatchObject({ userId: "u1", kind: "personal" });
    expect(warn).toHaveBeenCalledWith(
      "Could not record token use",
      { error: "db down" },
      expect.any(String)
    );
  });

  it("still refuses a revoked named token", async () => {
    namedFind.mockResolvedValue({
      id: "tok-1",
      userId: "u1",
      name: "Chrome",
      expiresAt: null,
      revokedAt: new Date(),
      lastUsedAt: null,
    });
    expect(await authenticateBearer(request)).toBeNull();
  });
});
