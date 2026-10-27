import { getToken } from "next-auth/jwt";
import { NextRequest } from "next/server";

import { POST } from "@/app/api/account/sessions/revoke/route";

import { prisma } from "@/lib/prisma";

jest.mock("next-auth/jwt", () => ({ getToken: jest.fn() }));
jest.mock("@/lib/security/rate-limit", () => ({
  accountRule: jest.fn(() => ({ identifier: "account" })),
  ipRule: jest.fn(() => ({ identifier: "ip" })),
  enforceRateLimits: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(),
    user: { findUnique: jest.fn(), update: jest.fn() },
    connectorSettings: { updateMany: jest.fn() },
    systemSettings: { findFirst: jest.fn().mockResolvedValue(null) },
  },
}));

const userModel = prisma.user as unknown as {
  findUnique: jest.Mock;
  update: jest.Mock;
};
const db = prisma as unknown as {
  $transaction: jest.Mock;
  connectorSettings: { updateMany: jest.Mock };
};

function revokeRequest() {
  return new NextRequest("http://localhost/api/account/sessions/revoke", {
    method: "POST",
  });
}

describe("POST /api/account/sessions/revoke", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXTAUTH_SECRET = "test-secret-for-session-revoke";
  });

  it("requires a signed-in caller", async () => {
    jest.mocked(getToken).mockResolvedValue(null);

    const response = await POST(revokeRequest());

    expect(response.status).toBe(401);
    expect(userModel.update).not.toHaveBeenCalled();
    expect(db.connectorSettings.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a caller whose session was already revoked", async () => {
    jest
      .mocked(getToken)
      .mockImplementation((async (params: { raw?: boolean }) =>
        params.raw
          ? "raw-session"
          : { sub: "user-1", sessionVersion: 0 }) as never);
    userModel.findUnique.mockResolvedValue({
      id: "user-1",
      email: "person@example.com",
      isActive: true,
      sessionVersion: 1,
    });

    const response = await POST(revokeRequest());

    expect(response.status).toBe(401);
    expect(userModel.update).not.toHaveBeenCalled();
    expect(db.connectorSettings.updateMany).not.toHaveBeenCalled();
  });

  it("increments the caller's session version", async () => {
    jest
      .mocked(getToken)
      .mockImplementation((async (params: { raw?: boolean }) =>
        params.raw
          ? "raw-session"
          : { sub: "user-1", sessionVersion: 2 }) as never);
    userModel.findUnique.mockResolvedValue({
      id: "user-1",
      email: "person@example.com",
      isActive: true,
      emailVerified: new Date("2026-01-01T00:00:00Z"),
      sessionVersion: 2,
    });
    userModel.update.mockReturnValue("session-version-write");
    db.connectorSettings.updateMany.mockReturnValue("connector-revoke");
    db.$transaction.mockResolvedValue([{ sessionVersion: 3 }, { count: 1 }]);

    const response = await POST(revokeRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      revoked: true,
      connectorTokensRevoked: 1,
    });
    expect(db.$transaction).toHaveBeenCalledWith([
      "session-version-write",
      "connector-revoke",
    ]);
    expect(db.connectorSettings.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", tokenHash: { not: null } },
      data: { tokenHash: null, tokenPreview: null, tokenExpiresAt: null },
    });
    expect(userModel.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { sessionVersion: { increment: 1 } },
      select: { sessionVersion: true },
    });
  });
});
