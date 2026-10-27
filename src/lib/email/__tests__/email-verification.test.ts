import { revokeConnectorTokens } from "@/services/connectors/auth";

import { forgetSessionState } from "@/lib/auth/session-version";
import { newDate } from "@/lib/date-utils";
import { EmailService } from "@/lib/email/email-service";
import {
  confirmEmailVerification,
  sendEmailVerification,
} from "@/lib/email/email-verification";
import { prisma } from "@/lib/prisma";

const tx = {
  verificationToken: {
    findUnique: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  account: { updateMany: jest.fn() },
  adminAuditLog: { create: jest.fn() },
  subscription: { upsert: jest.fn() },
  trialGrant: {
    createMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
};

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(),
    user: { findUnique: jest.fn() },
    verificationToken: {
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));
jest.mock("bcryptjs", () => ({
  hash: jest.fn().mockResolvedValue("new-password-hash"),
}));
jest.mock("@/services/connectors/auth", () => ({
  revokeConnectorTokens: jest.fn().mockResolvedValue({ count: 0 }),
}));
jest.mock("@/lib/auth/session-version", () => ({
  forgetSessionState: jest.fn(),
}));
jest.mock("@/lib/email/email-service", () => ({
  EmailService: { sendEmail: jest.fn() },
}));

describe("email verification confirmation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RATE_LIMIT_HASH_SECRET = "trial-test-secret";
    jest
      .mocked(prisma.$transaction)
      .mockImplementation(async (operation) =>
        (operation as unknown as (client: typeof tx) => Promise<unknown>)(tx)
      );
    tx.verificationToken.delete.mockResolvedValue({});
    tx.verificationToken.deleteMany.mockResolvedValue({ count: 1 });
    tx.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "person@example.com",
      emailVerified: null,
      accounts: [],
    });
    tx.account.updateMany.mockResolvedValue({ count: 1 });
    tx.adminAuditLog.create.mockResolvedValue({});
    tx.user.update.mockResolvedValue({});
    tx.subscription.upsert.mockResolvedValue({});
    tx.trialGrant.findFirst.mockResolvedValue(null);
    tx.trialGrant.createMany.mockResolvedValue({ count: 1 });
    tx.trialGrant.findUnique.mockResolvedValue({
      id: "trial-1",
      userId: "user-1",
    });
  });

  it("consumes a valid token and starts the trial in one transaction", async () => {
    tx.verificationToken.findUnique.mockResolvedValueOnce({
      identifier: "person@example.com",
      token: "stored-hash",
      expires: newDate("2026-09-17T11:00:00.000Z"),
    });

    await expect(
      confirmEmailVerification({
        email: "PERSON@example.com",
        token: "raw-token",
        now: newDate("2026-09-16T12:00:00.000Z"),
      })
    ).resolves.toEqual({ status: "verified", trial: true });
    expect(tx.verificationToken.deleteMany).toHaveBeenCalledWith({
      where: { identifier: "person@example.com" },
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { emailVerified: newDate("2026-09-16T12:00:00.000Z") },
    });
  });

  describe("an account created with a password nobody has proven yet", () => {
    const now = newDate("2026-09-16T12:00:00.000Z");
    const link = (extra: object = {}) => ({
      email: "person@example.com",
      token: "raw-token",
      now,
      ...extra,
    });

    beforeEach(() => {
      tx.verificationToken.findUnique.mockResolvedValue({
        identifier: "person@example.com",
        token: "stored-hash",
        expires: newDate("2026-09-17T11:00:00.000Z"),
      });
      tx.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: "person@example.com",
        emailVerified: null,
        accounts: [{ provider: "credentials", id_token: "attacker-hash" }],
      });
    });

    it("in the signing-up browser keeps the password and the sessions", async () => {
      await expect(
        confirmEmailVerification(link({ sameSession: true }))
      ).resolves.toEqual({ status: "verified", trial: true });
      expect(tx.account.updateMany).not.toHaveBeenCalled();
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { emailVerified: now },
      });
      expect(revokeConnectorTokens).not.toHaveBeenCalled();
    });

    it("in any other browser asks for a password and spends nothing", async () => {
      await expect(
        confirmEmailVerification(link({ sameSession: false }))
      ).resolves.toEqual({ status: "password_required", trial: false });
      expect(tx.user.update).not.toHaveBeenCalled();
      expect(tx.account.updateMany).not.toHaveBeenCalled();
      expect(tx.verificationToken.deleteMany).not.toHaveBeenCalled();
    });

    it("in any other browser, with a new password: replaces it, signs every earlier session out, logs it", async () => {
      await expect(
        confirmEmailVerification(
          link({ sameSession: false, newPassword: "Fresh-Pass-1" })
        )
      ).resolves.toEqual({ status: "verified", trial: true });
      expect(tx.account.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1", provider: "credentials" },
        data: { id_token: "new-password-hash" },
      });
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { emailVerified: now, sessionVersion: { increment: 1 } },
      });
      expect(tx.adminAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          targetUserId: "user-1",
          action: "auth.unproven_password_reset_on_confirm",
        }),
      });
      expect(forgetSessionState).toHaveBeenCalledWith("user-1");
      expect(revokeConnectorTokens).toHaveBeenCalledWith("user-1");
    });

    it("an account with no password (provider sign-up) confirms anywhere", async () => {
      tx.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: "person@example.com",
        emailVerified: null,
        accounts: [],
      });
      await expect(
        confirmEmailVerification(link({ sameSession: false }))
      ).resolves.toEqual({ status: "verified", trial: true });
      expect(tx.account.updateMany).not.toHaveBeenCalled();
    });
  });

  it("rejects expired and already-consumed tokens", async () => {
    tx.verificationToken.findUnique
      .mockResolvedValueOnce({
        identifier: "person@example.com",
        token: "stored-hash",
        expires: newDate("2026-09-16T11:59:59.000Z"),
      })
      .mockResolvedValueOnce(null);

    await expect(
      confirmEmailVerification({
        email: "person@example.com",
        token: "expired",
        now: newDate("2026-09-16T12:00:00.000Z"),
      })
    ).resolves.toEqual({ status: "expired", trial: false });
    await expect(
      confirmEmailVerification({
        email: "person@example.com",
        token: "expired",
        now: newDate("2026-09-16T12:00:00.000Z"),
      })
    ).resolves.toEqual({ status: "invalid", trial: false });
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});

describe("email verification delivery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(prisma.user.findUnique).mockResolvedValue({
      email: "person@example.com",
      emailVerified: null,
      name: "Person",
    } as never);
    jest.mocked(prisma.verificationToken.deleteMany).mockResolvedValue({
      count: 0,
    });
    jest.mocked(prisma.verificationToken.create).mockResolvedValue({} as never);
  });

  it("keeps older active links when delivery of a replacement fails", async () => {
    jest
      .mocked(EmailService.sendEmail)
      .mockRejectedValue(new Error("Resend down"));

    await expect(
      sendEmailVerification({
        userId: "user-1",
        baseUrl: "https://use.needt.app",
      })
    ).rejects.toThrow("Resend down");

    const deletionCalls = jest.mocked(prisma.verificationToken.deleteMany).mock
      .calls;
    expect(deletionCalls).toEqual([
      [
        {
          where: {
            identifier: "person@example.com",
            expires: { lt: expect.any(Date) },
          },
        },
      ],
      [
        {
          where: {
            identifier: "person@example.com",
            token: expect.any(String),
          },
        },
      ],
    ]);
  });
});
