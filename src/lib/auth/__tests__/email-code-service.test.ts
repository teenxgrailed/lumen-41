import { Prisma } from "@prisma/client";

import { requestUtm } from "@/lib/attribution-server";
import {
  checkEmailCode,
  consumeEmailCode,
  discardEmailCodes,
  issueEmailCode,
} from "@/lib/auth/email-code";
import {
  isEmailCodeLocked,
  recordWrongEmailCode,
} from "@/lib/auth/email-code-lock";
import {
  AGE_CONFIRM_REQUIRED_ERROR,
  authorizeEmailCode,
  sendLoginCode,
} from "@/lib/auth/email-code-service";
import { isPublicSignupEnabled } from "@/lib/auth/public-signup";
import { areSignupsOpen } from "@/lib/auth/signups";
import { claimUnconfirmedAccountByProvider } from "@/lib/auth/unproven-password";
import { EmailService } from "@/lib/email/email-service";
import { prisma } from "@/lib/prisma";
import { markEmailVerifiedAndStartTrial } from "@/lib/trials/trial-service";
import { sendUmamiSignupCompleted } from "@/lib/umami-server";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    emailLoginCode: { findFirst: jest.fn() },
  },
}));
jest.mock("@/lib/attribution-server", () => ({
  requestUtm: jest.fn().mockResolvedValue({ utm_source: "x" }),
}));
jest.mock("@/lib/auth/email-code", () => ({
  ...jest.requireActual("@/lib/auth/email-code"),
  issueEmailCode: jest.fn(),
  checkEmailCode: jest.fn(),
  consumeEmailCode: jest.fn(),
  discardEmailCodes: jest.fn(),
}));
jest.mock("@/lib/auth/email-code-lock", () => ({
  isEmailCodeLocked: jest.fn(),
  recordWrongEmailCode: jest.fn(),
}));
jest.mock("@/lib/auth/signups", () => ({ areSignupsOpen: jest.fn() }));
jest.mock("@/lib/auth/public-signup", () => ({
  isPublicSignupEnabled: jest.fn(),
}));
jest.mock("@/lib/auth/unproven-password", () => ({
  ...jest.requireActual("@/lib/auth/unproven-password"),
  claimUnconfirmedAccountByProvider: jest.fn(),
}));
jest.mock("@/lib/email/email-service", () => ({
  EmailService: { sendEmail: jest.fn() },
}));
jest.mock("@/lib/trials/trial-service", () => ({
  markEmailVerifiedAndStartTrial: jest.fn(),
}));
jest.mock("@/lib/umami-server", () => ({
  sendUmamiSignupCompleted: jest.fn(),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const findFirst = jest.mocked(prisma.user.findFirst);
const create = jest.mocked(prisma.user.create);
const update = jest.mocked(prisma.user.update);

const EMAIL = "person@example.com";
const baseUser = {
  id: "u1",
  email: EMAIL,
  name: "person",
  role: "user",
  isActive: true,
  sandboxKind: null,
  emailVerified: new Date("2026-11-01T00:00:00Z"),
  accounts: [] as { provider: string; id_token: string | null }[],
};

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(requestUtm).mockResolvedValue({ utm_source: "x" });
  jest.mocked(isEmailCodeLocked).mockResolvedValue(false);
  jest.mocked(areSignupsOpen).mockResolvedValue(true);
  jest.mocked(isPublicSignupEnabled).mockResolvedValue(true);
  jest.mocked(issueEmailCode).mockResolvedValue({
    code: "123456",
    expiresAt: new Date(),
  });
  jest.mocked(checkEmailCode).mockResolvedValue({ status: "ok", id: "c1" });
  jest.mocked(consumeEmailCode).mockResolvedValue(true);
  jest.mocked(EmailService.sendEmail).mockResolvedValue({ jobId: "j" });
});

describe("sendLoginCode", () => {
  it("mails a code to an existing account", async () => {
    findFirst.mockResolvedValue(baseUser as never);
    expect(await sendLoginCode(EMAIL)).toBe("sent");
    const mail = jest.mocked(EmailService.sendEmail).mock.calls[0][0];
    expect(mail.to).toBe(EMAIL);
    expect(mail.subject).toContain("123456");
    expect(mail.html).toContain("123456");
  });

  it("mails a code to a new address while sign-up is open", async () => {
    findFirst.mockResolvedValue(null);
    expect(await sendLoginCode(EMAIL)).toBe("sent");
  });

  it("sends nothing to a new address while sign-ups are closed", async () => {
    findFirst.mockResolvedValue(null);
    jest.mocked(areSignupsOpen).mockResolvedValue(false);
    expect(await sendLoginCode(EMAIL)).toBe("skipped");
    expect(issueEmailCode).not.toHaveBeenCalled();
    expect(EmailService.sendEmail).not.toHaveBeenCalled();
  });

  it("sends nothing to a new address while public sign-up is off", async () => {
    findFirst.mockResolvedValue(null);
    jest.mocked(isPublicSignupEnabled).mockResolvedValue(false);
    expect(await sendLoginCode(EMAIL)).toBe("skipped");
  });

  it("sends nothing to a sandbox or a deactivated account", async () => {
    findFirst.mockResolvedValue({ ...baseUser, sandboxKind: "demo" } as never);
    expect(await sendLoginCode(EMAIL)).toBe("skipped");
    findFirst.mockResolvedValue({ ...baseUser, isActive: false } as never);
    expect(await sendLoginCode(EMAIL)).toBe("skipped");
    expect(EmailService.sendEmail).not.toHaveBeenCalled();
  });

  it("sends nothing to an address locked for the day", async () => {
    findFirst.mockResolvedValue(baseUser as never);
    jest.mocked(isEmailCodeLocked).mockResolvedValue(true);
    expect(await sendLoginCode(EMAIL)).toBe("skipped");
    expect(issueEmailCode).not.toHaveBeenCalled();
  });

  it("does the same lookups on a refusal as on a send (timing)", async () => {
    findFirst.mockResolvedValue(null);
    jest.mocked(areSignupsOpen).mockResolvedValue(false);
    await sendLoginCode(EMAIL);
    expect(prisma.emailLoginCode.findFirst).toHaveBeenCalledTimes(1);
  });

  it("drops the code when the mail cannot be sent", async () => {
    findFirst.mockResolvedValue(baseUser as never);
    jest.mocked(EmailService.sendEmail).mockRejectedValue(new Error("down"));
    await expect(sendLoginCode(EMAIL)).rejects.toThrow("down");
    expect(discardEmailCodes).toHaveBeenCalledWith(EMAIL);
  });
});

describe("authorizeEmailCode: sign-in", () => {
  it("signs in an existing, confirmed account without a trial or event", async () => {
    findFirst.mockResolvedValue(baseUser as never);
    const user = await authorizeEmailCode({ email: EMAIL, code: "123456" });
    expect(user).toMatchObject({ id: "u1", isNew: false });
    expect(consumeEmailCode).toHaveBeenCalledWith("c1");
    expect(markEmailVerifiedAndStartTrial).not.toHaveBeenCalled();
    expect(sendUmamiSignupCompleted).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(update.mock.calls[0][0].data).toHaveProperty("lastAuthenticatedAt");
  });

  it("confirms an unconfirmed account and starts its trial", async () => {
    findFirst.mockResolvedValue({ ...baseUser, emailVerified: null } as never);
    await authorizeEmailCode({ email: EMAIL, code: "123456" });
    expect(markEmailVerifiedAndStartTrial).toHaveBeenCalledTimes(1);
    expect(claimUnconfirmedAccountByProvider).not.toHaveBeenCalled();
  });

  it("wipes a password nobody proved before it confirms the address", async () => {
    findFirst.mockResolvedValue({
      ...baseUser,
      emailVerified: null,
      accounts: [{ provider: "credentials", id_token: "hash" }],
    } as never);
    await authorizeEmailCode({ email: EMAIL, code: "123456" });
    expect(claimUnconfirmedAccountByProvider).toHaveBeenCalledTimes(1);
    expect(markEmailVerifiedAndStartTrial).toHaveBeenCalledTimes(1);
  });

  it("refuses a wrong, expired or spent code with null", async () => {
    jest.mocked(checkEmailCode).mockResolvedValue({ status: "invalid" });
    expect(
      await authorizeEmailCode({ email: EMAIL, code: "123456" })
    ).toBeNull();
    expect(consumeEmailCode).not.toHaveBeenCalled();
  });

  it("counts a wrong code toward the daily lock, but not a missing one", async () => {
    jest.mocked(checkEmailCode).mockResolvedValue({ status: "wrong" });
    await authorizeEmailCode({ email: EMAIL, code: "123456" });
    expect(recordWrongEmailCode).toHaveBeenCalledWith(EMAIL);
    jest.mocked(recordWrongEmailCode).mockClear();
    jest.mocked(checkEmailCode).mockResolvedValue({ status: "invalid" });
    await authorizeEmailCode({ email: EMAIL, code: "123456" });
    expect(recordWrongEmailCode).not.toHaveBeenCalled();
  });

  it("refuses a locked address, even with the right code", async () => {
    jest.mocked(isEmailCodeLocked).mockResolvedValue(true);
    findFirst.mockResolvedValue(baseUser as never);
    expect(
      await authorizeEmailCode({ email: EMAIL, code: "123456" })
    ).toBeNull();
    expect(checkEmailCode).not.toHaveBeenCalled();
    expect(consumeEmailCode).not.toHaveBeenCalled();
  });

  it("refuses when someone spent the code first", async () => {
    findFirst.mockResolvedValue(baseUser as never);
    jest.mocked(consumeEmailCode).mockResolvedValue(false);
    expect(
      await authorizeEmailCode({ email: EMAIL, code: "123456" })
    ).toBeNull();
  });

  it("refuses a malformed code before touching the database", async () => {
    expect(await authorizeEmailCode({ email: EMAIL, code: "12" })).toBeNull();
    expect(checkEmailCode).not.toHaveBeenCalled();
  });

  it("refuses a sandbox account even with a right code", async () => {
    findFirst.mockResolvedValue({
      ...baseUser,
      sandboxKind: "review",
    } as never);
    expect(
      await authorizeEmailCode({ email: EMAIL, code: "123456" })
    ).toBeNull();
    expect(consumeEmailCode).not.toHaveBeenCalled();
  });

  it("refuses a deactivated account", async () => {
    findFirst.mockResolvedValue({ ...baseUser, isActive: false } as never);
    expect(
      await authorizeEmailCode({ email: EMAIL, code: "123456" })
    ).toBeNull();
  });
});

describe("authorizeEmailCode: sign-up", () => {
  const input = {
    email: EMAIL,
    code: "123456",
    ageConfirmed: true,
    timeZone: "Europe/Zurich",
    locale: "en-CH",
  };

  it("creates a confirmed account, starts the trial and fires the event once", async () => {
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({
      id: "new1",
      email: EMAIL,
      name: "person",
      role: "user",
    } as never);
    const user = await authorizeEmailCode(input);
    expect(user).toMatchObject({ id: "new1", isNew: true });
    const data = create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.emailVerified).toBeInstanceOf(Date);
    expect(data.ageConfirmedAt).toBeInstanceOf(Date);
    expect(data).toHaveProperty("userSettings");
    expect(data).toHaveProperty("autoScheduleSettings");
    expect(markEmailVerifiedAndStartTrial).toHaveBeenCalledTimes(1);
    expect(sendUmamiSignupCompleted).toHaveBeenCalledTimes(1);
    expect(sendUmamiSignupCompleted).toHaveBeenCalledWith("email-code", {
      utm_source: "x",
    });
  });

  it("asks for the age confirmation and keeps the code", async () => {
    findFirst.mockResolvedValue(null);
    await expect(
      authorizeEmailCode({ ...input, ageConfirmed: undefined })
    ).rejects.toThrow(AGE_CONFIRM_REQUIRED_ERROR);
    await expect(
      authorizeEmailCode({ ...input, ageConfirmed: false })
    ).rejects.toThrow(AGE_CONFIRM_REQUIRED_ERROR);
    expect(consumeEmailCode).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("creates nothing while sign-ups are closed", async () => {
    findFirst.mockResolvedValue(null);
    jest.mocked(areSignupsOpen).mockResolvedValue(false);
    expect(await authorizeEmailCode(input)).toBeNull();
    expect(create).not.toHaveBeenCalled();
    expect(consumeEmailCode).not.toHaveBeenCalled();
  });

  it("does not ask a returning person for the age confirmation", async () => {
    findFirst.mockResolvedValue(baseUser as never);
    await expect(
      authorizeEmailCode({ ...input, ageConfirmed: undefined })
    ).resolves.toMatchObject({ isNew: false });
  });

  it("gives the winner of a create race the full existing-account treatment", async () => {
    const raced = () =>
      create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("dup", {
          code: "P2002",
          clientVersion: "x",
        })
      );
    /* A password account nobody confirmed: wiped, confirmed, trial. */
    findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      ...baseUser,
      emailVerified: null,
      accounts: [{ provider: "credentials", id_token: "hash" }],
    } as never);
    raced();
    const user = await authorizeEmailCode(input);
    expect(user).toMatchObject({ id: "u1", isNew: false });
    expect(claimUnconfirmedAccountByProvider).toHaveBeenCalledTimes(1);
    expect(markEmailVerifiedAndStartTrial).toHaveBeenCalledTimes(1);
    expect(sendUmamiSignupCompleted).not.toHaveBeenCalled();
    expect(update.mock.calls[0][0].data).toHaveProperty("lastAuthenticatedAt");
  });

  it("refuses a create-race winner that may not use codes", async () => {
    findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...baseUser, sandboxKind: "demo" } as never);
    create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "x",
      })
    );
    expect(await authorizeEmailCode(input)).toBeNull();
  });
});
