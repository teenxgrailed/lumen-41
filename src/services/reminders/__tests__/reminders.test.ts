import { prisma } from "@/lib/prisma";
import { scheduleReminderDelivery } from "@/lib/queue/enqueue";

import {
  createReminder,
  reminderCreateSchema,
  rescheduleRemindersFor,
  updateReminder,
} from "../reminders";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    task: { findFirst: jest.fn() },
    calendarEvent: { findFirst: jest.fn() },
    taskReminder: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    userSettings: { findUnique: jest.fn() },
  },
}));
jest.mock("@/lib/entitlements", () => ({
  getPlan: jest.fn().mockResolvedValue("PRO"),
  limitStatus: jest.requireActual("@/lib/entitlements").limitStatus,
}));
jest.mock("@/lib/queue/enqueue", () => ({
  scheduleReminderDelivery: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const schedule = jest.mocked(scheduleReminderDelivery);
const now = new Date("2026-10-27T10:00:00.000Z");
const start = new Date("2026-10-27T14:00:00.000Z");

const row = (over: object = {}) => ({
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
  channels: ["push", "email"],
  deliveryStatus: "PENDING",
  deliveredAt: null,
  canceledAt: null,
  task: {
    id: "t1",
    title: "Write the brief",
    status: "todo",
    isArchived: false,
    scheduledStart: start,
    deadline: null,
    dueDate: null,
  },
  event: null,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  db.userSettings.findUnique.mockResolvedValue({ timeZone: "UTC" });
  db.task.findFirst.mockResolvedValue({ id: "t1" });
  db.taskReminder.findFirst.mockResolvedValue(null);
  db.taskReminder.count.mockResolvedValue(0);
});

describe("reminderCreateSchema", () => {
  it("takes a relative reminder on a task, an absolute one on its own", () => {
    expect(
      reminderCreateSchema.safeParse({ taskId: "t1", offsetMinutes: 10 })
        .success
    ).toBe(true);
    expect(
      reminderCreateSchema.safeParse({
        title: "Call back",
        at: "2026-10-28T09:00:00+01:00",
      }).success
    ).toBe(true);
  });
  it("refuses a relative one with nothing to anchor it, or both anchors", () => {
    expect(
      reminderCreateSchema.safeParse({ title: "x", offsetMinutes: 5 }).success
    ).toBe(false);
    expect(
      reminderCreateSchema.safeParse({
        taskId: "t1",
        eventId: "e1",
        offsetMinutes: 5,
      }).success
    ).toBe(false);
    expect(
      reminderCreateSchema.safeParse({ taskId: "t1", atTime: "9:00" }).success
    ).toBe(false);
  });
});

describe("createReminder", () => {
  it("stores the spec and schedules a delayed job at its fire time", async () => {
    db.taskReminder.create.mockImplementation(({ data }) =>
      Promise.resolve(row(data))
    );
    const result = await createReminder("u1", {
      taskId: "t1",
      offsetMinutes: 10,
    });
    expect(result.ok).toBe(true);
    expect(db.taskReminder.create.mock.calls[0][0].data).toMatchObject({
      userId: "u1",
      taskId: "t1",
      kind: "BEFORE_START",
      offsetMinutes: 10,
      atTime: null,
    });
    expect(schedule).toHaveBeenCalledWith(
      "r1",
      new Date("2026-10-27T13:50:00.000Z")
    );
    if (result.ok) expect(result.value.label).toBe("10 min before");
  });

  it("keys an absolute reminder by its minute", async () => {
    db.taskReminder.create.mockImplementation(({ data }) =>
      Promise.resolve(row(data))
    );
    await createReminder("u1", {
      taskId: "t1",
      at: "2026-10-27T16:00:00.000Z",
    });
    const data = db.taskReminder.create.mock.calls[0][0].data;
    expect(data.kind).toBe("AT_TIME");
    expect(data.fireAt).toEqual(new Date("2026-10-27T16:00:00.000Z"));
    expect(data.offsetMinutes).toBe(
      -Math.floor(Date.parse("2026-10-27T16:00:00.000Z") / 60_000)
    );
  });

  it("refuses a task that is not the person's", async () => {
    db.task.findFirst.mockResolvedValue(null);
    const result = await createReminder("u1", {
      taskId: "t1",
      offsetMinutes: 10,
    });
    expect(result).toMatchObject({ ok: false, status: 404 });
    expect(db.taskReminder.create).not.toHaveBeenCalled();
  });

  it("holds Free to its one reminder per task", async () => {
    const { getPlan } = jest.requireMock("@/lib/entitlements");
    getPlan.mockResolvedValueOnce("FREE");
    db.taskReminder.count.mockResolvedValue(1);
    const result = await createReminder("u1", {
      taskId: "t1",
      offsetMinutes: 30,
    });
    expect(result).toMatchObject({ ok: false, status: 403 });
  });
});

describe("updateReminder (snooze)", () => {
  it("re-arms a delivered reminder for the snooze time", async () => {
    db.taskReminder.findFirst.mockResolvedValue(
      row({ deliveredAt: now, deliveryStatus: "DELIVERED" })
    );
    const until = "2026-10-28T09:00:00.000Z";
    db.taskReminder.update.mockImplementation(({ data }) =>
      Promise.resolve(row(data))
    );
    const result = await updateReminder("u1", "r1", { snoozeUntil: until });
    expect(result.ok).toBe(true);
    expect(db.taskReminder.update.mock.calls[0][0].data).toMatchObject({
      snoozedUntil: new Date(until),
      deliveredAt: null,
      deliveryStatus: "PENDING",
    });
    expect(schedule).toHaveBeenCalledWith("r1", new Date(until));
  });
});

describe("rescheduleRemindersFor", () => {
  it("schedules pending reminders at the task's new time", async () => {
    db.taskReminder.findMany.mockResolvedValue([row()]);
    await expect(rescheduleRemindersFor({ taskId: "t1" }, now)).resolves.toBe(
      1
    );
    expect(schedule).toHaveBeenCalledWith(
      "r1",
      new Date("2026-10-27T13:50:00.000Z")
    );
  });

  it("re-arms a fired reminder when the task moved later", async () => {
    db.taskReminder.findMany.mockResolvedValue([
      row({
        deliveredAt: new Date("2026-10-27T09:00:00.000Z"),
        deliveryStatus: "DELIVERED",
      }),
    ]);
    await rescheduleRemindersFor({ taskId: "t1" }, now);
    expect(db.taskReminder.update.mock.calls[0][0].data).toMatchObject({
      deliveredAt: null,
      deliveryStatus: "PENDING",
    });
  });

  it("leaves a fired reminder alone when its time has passed", async () => {
    db.taskReminder.findMany.mockResolvedValue([
      row({
        deliveredAt: new Date("2026-10-27T13:51:00.000Z"),
        deliveryStatus: "DELIVERED",
      }),
    ]);
    await rescheduleRemindersFor(
      { taskId: "t1" },
      new Date("2026-10-27T13:55:00.000Z")
    );
    expect(db.taskReminder.update).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });
});
