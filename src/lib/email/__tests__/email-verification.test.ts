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
    });
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
