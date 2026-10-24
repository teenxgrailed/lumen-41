import { NextRequest } from "next/server";

import { POST } from "@/app/api/auth/reset-password/reset/route";
import { createHash } from "node:crypto";

import { prisma } from "@/lib/prisma";

jest.mock("@/lib/security/rate-limit", () => ({
  accountRule: jest.fn(() => ({ identifier: "account" })),
  ipRule: jest.fn(() => ({ identifier: "ip" })),
  enforceRateLimits: jest.fn().mockResolvedValue(null),
}));
jest.mock("bcryptjs", () => ({ hash: jest.fn().mockResolvedValue("hashed") }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(),
    account: { update: jest.fn() },
    connectorSettings: { updateMany: jest.fn() },
    passwordReset: { findFirst: jest.fn(), update: jest.fn() },
    user: { update: jest.fn() },
  },
}));

const mocked = prisma as unknown as {
  $transaction: jest.Mock;
  account: { update: jest.Mock };
  connectorSettings: { updateMany: jest.Mock };
  passwordReset: { findFirst: jest.Mock; update: jest.Mock };
  user: { update: jest.Mock };
};

function resetRequest() {
  return new NextRequest("http://localhost/api/auth/reset-password/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "reset-token", password: "NewPassw0rd" }),
  });
}

describe("POST /api/auth/reset-password/reset", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocked.account.update.mockReturnValue("account-write");
    mocked.passwordReset.update.mockReturnValue("token-write");
    mocked.user.update.mockReturnValue("session-version-write");
    mocked.connectorSettings.updateMany.mockReturnValue("connector-revoke");
    mocked.$transaction.mockResolvedValue([]);
  });

  it("signs every device out in the same transaction as the new password", async () => {
    mocked.passwordReset.findFirst.mockResolvedValue({
      id: "reset-1",
      userId: "user-1",
      user: { id: "user-1", accounts: [{ id: "account-1" }] },
    });

    const response = await POST(resetRequest());

    expect(response.status).toBe(200);
    // The emailed token is looked up by its sha256, never by the raw value.
    expect(mocked.passwordReset.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          token: createHash("sha256").update("reset-token").digest("hex"),
        }),
      })
    );
    expect(mocked.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { sessionVersion: { increment: 1 } },
      select: { sessionVersion: true },
    });
    expect(mocked.$transaction).toHaveBeenCalledWith(
      expect.arrayContaining([
        "session-version-write",
        "connector-revoke",
        "account-write",
      ])
    );
    expect(mocked.connectorSettings.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", tokenHash: { not: null } },
      data: { tokenHash: null, tokenPreview: null, tokenExpiresAt: null },
    });
  });

  it("leaves sessions alone when the reset token is invalid", async () => {
    mocked.passwordReset.findFirst.mockResolvedValue(null);

    const response = await POST(resetRequest());

    expect(response.status).toBe(400);
    expect(mocked.user.update).not.toHaveBeenCalled();
    expect(mocked.connectorSettings.updateMany).not.toHaveBeenCalled();
  });
});
