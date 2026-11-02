import { processStudentRechecks } from "@/services/students/student-recheck";

import { EmailService } from "@/lib/email/email-service";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany: jest.fn(), updateMany: jest.fn() },
    adminAuditLog: { create: jest.fn() },
  },
}));
jest.mock("@/lib/email/email-service", () => ({
  EmailService: { sendEmail: jest.fn().mockResolvedValue({ jobId: "job" }) },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

/* A one-row database that understands the filters the sweep uses, so the
   test walks a real timeline with fixed dates. */
type Row = {
  id: string;
  email: string;
  studentEmail: string | null;
  studentVerifiedAt: Date | null;
  studentRecheckSentAt: Date | null;
  studentLapsedAt: Date | null;
  subscription: {
    plan: string;
    status: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: Date | null;
    interval: string;
    creemSubscriptionId: string;
  };
};

type Cond = {
  not?: null;
  lte?: Date;
  gt?: Date;
} | null;

function matches(value: unknown, cond: unknown): boolean {
  if (cond === null) return value === null;
  if (typeof cond !== "object" || cond instanceof Date) return value === cond;
  const c = cond as Exclude<Cond, null>;
  if ("not" in c && c.not === null && value === null) return false;
  if (c.lte && !(value instanceof Date && value <= c.lte)) return false;
  if (c.gt && !(value instanceof Date && value > c.gt)) return false;
  return true;
}

function where(
  row: Record<string, unknown>,
  w: Record<string, unknown>
): boolean {
  return Object.entries(w).every(([key, cond]) =>
    key === "subscription"
      ? where(row.subscription as Record<string, unknown>, cond as never)
      : matches(row[key], cond)
  );
}

let row: Row;

function install() {
  (prisma.user.findMany as jest.Mock).mockImplementation(
    async ({ where: w }: { where: Record<string, unknown> }) =>
      where(row as never, w) ? [{ ...row }] : []
  );
  (prisma.user.updateMany as jest.Mock).mockImplementation(
    async ({
      where: w,
      data,
    }: {
      where: Record<string, unknown>;
      data: Partial<Row>;
    }) => {
      if (!where(row as never, w)) return { count: 0 };
      row = { ...row, ...data };
      return { count: 1 };
    }
  );
}

const sent = () =>
  (EmailService.sendEmail as jest.Mock).mock.calls.map(
    ([m]: [{ to: string; subject: string }]) => `${m.to}: ${m.subject}`
  );

describe("yearly student re-check", () => {
  // A yearly student who proved their address on 2025-11-26 and renews on
  // 2026-11-26.
  const verifiedAt = new Date("2025-11-26T09:00:00.000Z");
  const renewsAt = new Date("2026-11-26T09:00:00.000Z");

  beforeEach(() => {
    jest.clearAllMocks();
    row = {
      id: "u1",
      email: "ana@gmail.com",
      studentEmail: "ana@ethz.ch",
      studentVerifiedAt: verifiedAt,
      studentRecheckSentAt: null,
      studentLapsedAt: null,
      subscription: {
        plan: "PRO",
        status: "ACTIVE",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: renewsAt,
        interval: "year",
        creemSubscriptionId: "sub_1",
      },
    };
    install();
  });

  it("does nothing before eleven months", async () => {
    await processStudentRechecks(new Date("2026-10-01T12:00:00.000Z"));
    expect(sent()).toEqual([]);
    expect(row.studentRecheckSentAt).toBeNull();
  });

  it("mails the one-click confirm once, however often it runs", async () => {
    const day = new Date("2026-10-27T12:00:00.000Z");
    await processStudentRechecks(day);
    await processStudentRechecks(new Date("2026-10-27T13:00:00.000Z"));
    expect(sent()).toEqual(["ana@ethz.ch: Are you still a student?"]);
    expect(row.studentRecheckSentAt).toEqual(day);
    const mail = (EmailService.sendEmail as jest.Mock).mock.calls[0][0];
    expect(mail.html).toContain("/api/students/confirm?t=");
  });

  it("failed yearly check removes the discount at renewal", async () => {
    await processStudentRechecks(new Date("2026-10-27T12:00:00.000Z"));
    // Not confirmed. Fourteen days before the renewal:
    const notice = new Date("2026-11-12T10:00:00.000Z");
    await processStudentRechecks(notice);
    // ...and the hourly runs after it change nothing more.
    await processStudentRechecks(new Date("2026-11-12T11:00:00.000Z"));
    await processStudentRechecks(new Date("2026-11-13T10:00:00.000Z"));

    expect(row.studentLapsedAt).toEqual(notice);
    expect(sent()).toEqual([
      "ana@ethz.ch: Are you still a student?",
      "ana@gmail.com: Your student price ends at your next renewal",
    ]);
    const mail = (EmailService.sendEmail as jest.Mock).mock.calls[1][0];
    expect(mail.text).toContain("26 Nov 2026");
    expect(mail.text).toContain("$59 / year");
    // Creem cannot drop the discount by API: support gets the to-do, once.
    expect(prisma.adminAuditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        targetUserId: "u1",
        action: "student.discount_removal_required",
        details: {
          creemSubscriptionId: "sub_1",
          renewsAt: renewsAt.toISOString(),
        },
      }),
    });
  });

  it("a confirmed re-check keeps the price", async () => {
    await processStudentRechecks(new Date("2026-10-27T12:00:00.000Z"));
    // What api/students/confirm writes.
    row = {
      ...row,
      studentVerifiedAt: new Date("2026-10-30T08:00:00.000Z"),
      studentRecheckSentAt: null,
    };
    await processStudentRechecks(new Date("2026-11-12T10:00:00.000Z"));
    expect(row.studentLapsedAt).toBeNull();
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it("never gives short notice: a renewal under 12 days away waits", async () => {
    row = {
      ...row,
      studentRecheckSentAt: new Date("2026-10-20T12:00:00.000Z"),
    };
    await processStudentRechecks(new Date("2026-11-18T10:00:00.000Z"));
    expect(row.studentLapsedAt).toBeNull();
    expect(sent()).toEqual([]);
  });

  it("does not lapse when the notice could not be sent", async () => {
    row = {
      ...row,
      studentRecheckSentAt: new Date("2026-10-27T12:00:00.000Z"),
    };
    (EmailService.sendEmail as jest.Mock).mockRejectedValueOnce(
      new Error("smtp down")
    );
    await processStudentRechecks(new Date("2026-11-12T10:00:00.000Z"));
    expect(row.studentLapsedAt).toBeNull();
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it("leaves a cancelled subscription alone", async () => {
    row.subscription.cancelAtPeriodEnd = true;
    await processStudentRechecks(new Date("2026-10-27T12:00:00.000Z"));
    expect(sent()).toEqual([]);
  });
});
