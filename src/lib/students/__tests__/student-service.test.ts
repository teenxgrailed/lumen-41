import { Prisma } from "@prisma/client";

import { EmailService } from "@/lib/email/email-service";
import { prisma } from "@/lib/prisma";
import {
  type StudentUser,
  confirmStudentToken,
  requestStudentEmailLink,
  studentCheckoutCode,
  studentDiscountForCheckout,
  studentStanding,
} from "@/lib/students/student-service";
import { signStudentToken } from "@/lib/students/token";

jest.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: jest.fn(), update: jest.fn() } },
}));
jest.mock("@/lib/email/email-service", () => ({
  EmailService: { sendEmail: jest.fn().mockResolvedValue({ jobId: "job_1" }) },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const NOW = new Date("2026-10-29T12:00:00.000Z");
const CODE = "NEEDT-STUDENT-40";

function user(overrides: Partial<StudentUser> = {}): StudentUser {
  return {
    id: "u1",
    email: "ana@example.test",
    emailVerified: new Date("2026-10-01T00:00:00.000Z"),
    studentEmail: null,
    studentVerifiedAt: null,
    studentSource: null,
    studentDiscountCode: null,
    studentLapsedAt: null,
    ...overrides,
  };
}

const yearly = { plan: "pro", interval: "year" } as const;
const monthly = { plan: "pro", interval: "month" } as const;
const lifetime = { plan: "lifetime" } as const;

describe("student price at checkout", () => {
  beforeEach(() => jest.clearAllMocks());

  it("student email gets 40% at checkout", () => {
    const ana = user({ email: "ana@ethz.ch" });
    expect(studentCheckoutCode(yearly, ana, NOW, CODE)).toBe(CODE);
    expect(studentCheckoutCode(monthly, ana, NOW, CODE)).toBe(CODE);
  });

  it("gmail address gets no discount", () => {
    expect(
      studentCheckoutCode(yearly, user({ email: "ana@gmail.com" }), NOW, CODE)
    ).toBeNull();
  });

  it("lifetime checkout ignores the student code", () => {
    const verified = user({
      studentEmail: "ana@ethz.ch",
      studentVerifiedAt: NOW,
      studentSource: "auto",
    });
    expect(studentCheckoutCode(lifetime, verified, NOW, CODE)).toBeNull();
    expect(
      studentCheckoutCode(lifetime, user({ email: "ana@ethz.ch" }), NOW, CODE)
    ).toBeNull();
  });

  it("an unconfirmed sign-in address is not proof", () => {
    expect(
      studentCheckoutCode(
        yearly,
        user({ email: "ana@ethz.ch", emailVerified: null }),
        NOW,
        CODE
      )
    ).toBeNull();
  });

  it("a verified university address on a gmail account counts", () => {
    const ana = user({
      email: "ana@gmail.com",
      studentEmail: "ana@cs.ethz.ch",
      studentVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
      studentSource: "auto",
    });
    expect(studentStanding(ana, NOW, CODE).status).toBe("verified");
    expect(studentCheckoutCode(monthly, ana, NOW, CODE)).toBe(CODE);
  });

  it("a proof older than a year no longer counts", () => {
    const old = user({
      email: "ana@gmail.com",
      studentEmail: "ana@ethz.ch",
      studentVerifiedAt: new Date("2025-10-01T00:00:00.000Z"),
      studentSource: "auto",
    });
    expect(studentStanding(old, NOW, CODE).status).toBe("none");
    expect(studentCheckoutCode(yearly, old, NOW, CODE)).toBeNull();
  });

  it("a lapsed student pays the regular price", () => {
    const lapsed = user({
      email: "ana@ethz.ch",
      studentEmail: "ana@ethz.ch",
      studentVerifiedAt: new Date("2025-11-01T00:00:00.000Z"),
      studentSource: "auto",
      studentLapsedAt: NOW,
    });
    expect(studentStanding(lapsed, NOW, CODE).status).toBe("lapsed");
    expect(studentCheckoutCode(yearly, lapsed, NOW, CODE)).toBeNull();
  });

  it("support's personal code is used instead of the shared one", () => {
    const manual = user({
      studentVerifiedAt: new Date("2024-01-01T00:00:00.000Z"),
      studentSource: "manual",
      studentDiscountCode: "ANA-ONE-TIME",
    });
    expect(studentCheckoutCode(yearly, manual, NOW, CODE)).toBe("ANA-ONE-TIME");
    expect(studentCheckoutCode(yearly, manual, NOW, null)).toBe("ANA-ONE-TIME");
  });

  it("no code is sent while the shared code is not configured", () => {
    expect(
      studentCheckoutCode(yearly, user({ email: "ana@ethz.ch" }), NOW, null)
    ).toBeNull();
  });

  it("records the sign-in address as the student proof on first checkout", async () => {
    process.env.CREEM_STUDENT_DISCOUNT_CODE = CODE;
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(
      user({ email: "Ana@ETHZ.ch" })
    );
    await expect(studentDiscountForCheckout("u1", yearly, NOW)).resolves.toBe(
      CODE
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: expect.objectContaining({
        studentEmail: "ana@ethz.ch",
        studentVerifiedAt: NOW,
        studentSource: "auto",
      }),
    });
    delete process.env.CREEM_STUDENT_DISCOUNT_CODE;
  });

  it("one student address backs one account", async () => {
    process.env.CREEM_STUDENT_DISCOUNT_CODE = CODE;
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(
      user({ email: "ana@ethz.ch" })
    );
    (prisma.user.update as jest.Mock).mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "test",
      })
    );
    await expect(
      studentDiscountForCheckout("u1", yearly, NOW)
    ).resolves.toBeNull();
    delete process.env.CREEM_STUDENT_DISCOUNT_CODE;
  });

  it("never reads the account for a Lifetime checkout", async () => {
    await expect(
      studentDiscountForCheckout("u1", lifetime, NOW)
    ).resolves.toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

describe("adding a university email", () => {
  beforeEach(() => jest.clearAllMocks());

  it("mails a signed link to a university address", async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce({ email: "ana@gmail.com", emailVerified: NOW })
      .mockResolvedValueOnce(null);
    await expect(
      requestStudentEmailLink({
        userId: "u1",
        email: " Ana@CS.ethz.ch ",
        baseUrl: "https://use.needt.app",
        now: NOW,
      })
    ).resolves.toBe("sent");
    const mail = (EmailService.sendEmail as jest.Mock).mock.calls[0][0];
    expect(mail.to).toBe("ana@cs.ethz.ch");
    expect(mail.html).toContain(
      "https://use.needt.app/api/students/confirm?t="
    );
  });

  it("refuses an address that is not at a school we recognise", async () => {
    await expect(
      requestStudentEmailLink({
        userId: "u1",
        email: "ana@gmail.com",
        baseUrl: "https://use.needt.app",
        now: NOW,
      })
    ).resolves.toBe("not_university");
    expect(EmailService.sendEmail).not.toHaveBeenCalled();
  });

  it("refuses an address another account holds", async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce({ email: "ana@gmail.com", emailVerified: NOW })
      .mockResolvedValueOnce({ id: "someone-else" });
    await expect(
      requestStudentEmailLink({
        userId: "u1",
        email: "ana@ethz.ch",
        baseUrl: "https://use.needt.app",
        now: NOW,
      })
    ).resolves.toBe("taken");
  });

  it("the link confirms the address and clears a failed re-check", async () => {
    const token = signStudentToken(
      { userId: "u1", email: "ana@ethz.ch", purpose: "verify" },
      NOW.getTime()
    );
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "u1",
      studentEmail: null,
    });
    await expect(confirmStudentToken(token, NOW)).resolves.toBe("verified");
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: expect.objectContaining({
        studentEmail: "ana@ethz.ch",
        studentVerifiedAt: NOW,
        studentLapsedAt: null,
        studentRecheckSentAt: null,
      }),
    });
  });

  it("a re-check link only confirms the address the price rests on", async () => {
    const token = signStudentToken(
      { userId: "u1", email: "old@ethz.ch", purpose: "recheck" },
      NOW.getTime()
    );
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "u1",
      studentEmail: "new@ethz.ch",
    });
    await expect(confirmStudentToken(token, NOW)).resolves.toBe("invalid");
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
