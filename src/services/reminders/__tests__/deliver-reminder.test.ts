import { EmailService } from "@/lib/email/email-service";
import { prisma } from "@/lib/prisma";

import { deliverTaskReminder } from "../reminder-delivery";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    taskReminder: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    notificationSettings: { findUnique: jest.fn() },
    userSettings: { findUnique: jest.fn() },
  },
}));
jest.mock("@/lib/email/email-service", () => ({
  EmailService: { sendEmail: jest.fn() },
}));
jest.mock("@/lib/queue/enqueue", () => ({
  scheduleReminderDelivery: jest.fn(),
}));
jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn().mockResolvedValue(undefined),
    error: jest.fn(),
  },
}));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const now = new Date("2026-10-27T13:50:00.000Z");
const start = new Date("2026-10-27T14:00:00.000Z");

function reminder(over: object = {}) {
  return {
    id: "r1",
    userId: "u1",
    taskId: "t1",
    eventId: null,
    title: null,
    kind: "BEFORE_START",
    offsetMinutes: 10,
    atTime: null,
    fireAt: null,
    snoozedUntil: null,
    channels: ["email"],
    deliveredAt: null,
    canceledAt: null,
    task: {
      id: "t1",
      title: "Write the brief",
      isArchived: false,
      status: "todo",
      scheduledStart: start,
      deadline: null,
      dueDate: null,
    },
    event: null,
    user: {
      email: "a@b.test",
      emailVerified: new Date(),
      pushSubscriptions: [],
      userSettings: { timeZone: "UTC" },
    },
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  db.taskReminder.updateMany.mockResolvedValue({ count: 1 });
  db.userSettings.findUnique.mockResolvedValue({ timeZone: "UTC" });
  db.notificationSettings.findUnique.mockResolvedValue(null);
});

describe("deliverTaskReminder", () => {
  it("skips a job whose task has moved later, without claiming it", async () => {
    db.taskReminder.findUnique.mockResolvedValue(
      reminder({
        task: {
          ...reminder().task,
          scheduledStart: new Date("2026-10-27T16:00:00.000Z"),
        },
      })
    );
    await expect(deliverTaskReminder("r1", now)).resolves.toEqual({
      delivered: false,
      skipped: true,
    });
    expect(db.taskReminder.updateMany).not.toHaveBeenCalled();
  });

  it("cancels the reminder of a completed task", async () => {
    db.taskReminder.findUnique.mockResolvedValue(
      reminder({ task: { ...reminder().task, status: "completed" } })
    );
    await deliverTaskReminder("r1", now);
    expect(db.taskReminder.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { canceledAt: now },
    });
    expect(EmailService.sendEmail).not.toHaveBeenCalled();
  });

  it("sends when due, and marks it delivered", async () => {
    db.taskReminder.findUnique.mockResolvedValue(reminder());
    await expect(deliverTaskReminder("r1", now)).resolves.toEqual({
      delivered: true,
      skipped: false,
    });
    expect(EmailService.sendEmail).toHaveBeenCalledTimes(1);
    expect(db.taskReminder.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deliveryStatus: "DELIVERED" }),
      })
    );
  });

  it("stays quiet in quiet hours but still lands in the bell", async () => {
    db.notificationSettings.findUnique.mockResolvedValue({
      quietHours: true,
      quietStart: "13:00",
      quietEnd: "15:00",
    });
    db.taskReminder.findUnique.mockResolvedValue(reminder());
    await expect(deliverTaskReminder("r1", now)).resolves.toEqual({
      delivered: true,
      skipped: false,
    });
    expect(EmailService.sendEmail).not.toHaveBeenCalled();
  });
});
