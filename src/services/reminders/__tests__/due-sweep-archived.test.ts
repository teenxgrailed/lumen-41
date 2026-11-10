import { findDueReminderIds } from "../reminder-delivery";

const findMany = jest.fn();

jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn().mockResolvedValue(undefined),
    error: jest.fn(),
  },
}));
jest.mock("@/lib/email/email-service", () => ({
  EmailService: { sendEmail: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    taskReminder: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: (...a: unknown[]) => findMany(...a),
    },
  },
}));

describe("findDueReminderIds", () => {
  it("keeps the archived task and event filter in the sweep query", async () => {
    findMany.mockResolvedValue([]);
    await findDueReminderIds(new Date("2026-11-10T10:00:00Z"));
    const where = findMany.mock.calls[0][0].where;
    expect(where.canceledAt).toBeNull();
    expect(where.deliveredAt).toBeNull();
    const json = JSON.stringify(where.AND);
    expect(json).toContain('"isArchived":false');
    expect(json).toContain('"archivedAt":null');
  });
});
