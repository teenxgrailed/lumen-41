import { revokeConnectorTokens } from "@/services/connectors/auth";

import {
  claimUnconfirmedAccountByProvider,
  isUnprovenPasswordAccount,
  replaceUnprovenPassword,
  unprovenPasswordReplaceable,
} from "@/lib/auth/unproven-password";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(),
    user: { update: jest.fn((args: unknown) => ({ user: args })) },
    account: { updateMany: jest.fn((args: unknown) => ({ account: args })) },
    adminAuditLog: { create: jest.fn((args: unknown) => ({ audit: args })) },
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/services/connectors/auth", () => ({
  revokeConnectorTokens: jest.fn(() => ({ connectors: true })),
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(prisma.$transaction).mockResolvedValue([] as never);
});

describe("claimUnconfirmedAccountByProvider", () => {
  it("confirms, wipes the password, revokes sessions and tokens, and logs it", async () => {
    const now = new Date("2026-10-27T10:00:00Z");
    await claimUnconfirmedAccountByProvider({
      userId: "user-1",
      provider: "google",
      now,
    });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: { sessionVersion: { increment: 1 } },
      })
    );
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: { emailVerified: now },
      })
    );
    expect(prisma.account.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", provider: "credentials" },
      data: { id_token: null },
    });
    expect(revokeConnectorTokens).toHaveBeenCalledWith("user-1");
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: null,
        targetUserId: "user-1",
        action: "auth.unproven_password_wiped",
        details: { provider: "google" },
      }),
      select: { id: true },
    });
  });
});

describe("replaceUnprovenPassword", () => {
  it("swaps the hash, revokes sessions and logs the reason", async () => {
    await replaceUnprovenPassword({
      userId: "user-1",
      passwordHash: "hash-2",
      action: "auth.unproven_password_replaced",
    });
    expect(prisma.account.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", provider: "credentials" },
      data: { id_token: "hash-2" },
    });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { sessionVersion: { increment: 1 } } })
    );
    expect(revokeConnectorTokens).toHaveBeenCalledWith("user-1");
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "auth.unproven_password_replaced",
        }),
      })
    );
  });
});

describe("isUnprovenPasswordAccount", () => {
  const withPassword = [{ provider: "credentials", id_token: "h" }];
  it("is true only for an unconfirmed account that has a password", () => {
    expect(
      isUnprovenPasswordAccount({ emailVerified: null, accounts: withPassword })
    ).toBe(true);
    expect(
      isUnprovenPasswordAccount({
        emailVerified: new Date(),
        accounts: withPassword,
      })
    ).toBe(false);
    expect(
      isUnprovenPasswordAccount({ emailVerified: null, accounts: [] })
    ).toBe(false);
    expect(
      isUnprovenPasswordAccount({
        emailVerified: null,
        accounts: [{ provider: "credentials", id_token: null }],
      })
    ).toBe(false);
  });
});

describe("unprovenPasswordReplaceable", () => {
  const now = new Date("2026-10-27T12:00:00Z");
  it("opens after exactly 24 hours", () => {
    expect(
      unprovenPasswordReplaceable(new Date("2026-10-26T12:00:01Z"), now)
    ).toBe(false);
    expect(
      unprovenPasswordReplaceable(new Date("2026-10-26T12:00:00Z"), now)
    ).toBe(true);
    expect(unprovenPasswordReplaceable(null, now)).toBe(true);
  });
});
