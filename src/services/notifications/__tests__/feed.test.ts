import { prisma } from "@/lib/prisma";

import {
  ALL_READ_KEY,
  NotificationReadError,
  getNotificationFeed,
  markNotificationsRead,
  reminderFiresAt,
  safeLink,
} from "../feed";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    proactiveNudge: { findMany: jest.fn() },
    notification: { findMany: jest.fn() },
    agentAction: { findMany: jest.fn() },
    pageComment: { findMany: jest.fn() },
    pageAccessGrant: { findMany: jest.fn() },
    moodboardAccessGrant: { findMany: jest.fn() },
    calendarFeed: { findMany: jest.fn() },
    importRun: { findMany: jest.fn() },
    taskReminder: { findMany: jest.fn() },
    task: { findMany: jest.fn() },
    notificationRead: {
      findMany: jest.fn(),
      createMany: jest.fn(),
      upsert: jest.fn(),
    },
  },
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
const now = new Date("2026-10-16T10:00:00.000Z");
const at = (minutesAgo: number) =>
  new Date(now.getTime() - minutesAgo * 60_000);

const nudge = (id: string, minutesAgo: number, readAt: Date | null = null) => ({
  id,
  title: id,
  body: "",
  deepLink: "/today",
  readAt,
  createdAt: at(minutesAgo),
});

beforeEach(() => {
  jest.clearAllMocks();
  for (const model of [
    "proactiveNudge",
    "notification",
    "agentAction",
    "pageComment",
    "pageAccessGrant",
    "moodboardAccessGrant",
    "calendarFeed",
    "importRun",
    "taskReminder",
    "task",
    "notificationRead",
  ]) {
    db[model].findMany.mockResolvedValue([]);
  }
});

describe("getNotificationFeed (activity)", () => {
  it("tells a person a moodboard was shared with them", async () => {
    db.moodboardAccessGrant.findMany.mockResolvedValue([
      {
        id: "mg1",
        moodboardId: "m9",
        createdAt: at(30),
        grantedBy: { name: "Anna Keller" },
        moodboard: { title: "SS27 drop" },
      },
    ]);
    const page = await getNotificationFeed({
      userId: "u1",
      group: "activity",
      now,
    });
    expect(page.items).toEqual([
      expect.objectContaining({
        key: "boardshare:mg1",
        kind: "share",
        title: "Anna Keller shared SS27 drop with you",
        link: "/moodboards/m9",
      }),
    ]);
  });

  it("merges every source newest first and shapes the rows", async () => {
    db.proactiveNudge.findMany.mockResolvedValue([
      {
        id: "n1",
        title: "3 tasks overdue",
        body: "Catch up",
        deepLink: "/today?task=t1",
        readAt: null,
        createdAt: at(30),
      },
    ]);
    db.agentAction.findMany.mockResolvedValue([
      {
        id: "a1",
        op: "task.create",
        input: { title: "Send the invoice" },
        actor: "mcp",
        createdAt: at(5),
      },
    ]);
    db.pageComment.findMany.mockResolvedValue([
      {
        id: "c1",
        body: "Agreed\n  on 13/12",
        createdAt: at(10),
        pageId: "p1",
        user: { name: "Lena Fischer" },
        page: { title: "Design rules" },
      },
    ]);
    db.pageAccessGrant.findMany.mockResolvedValue([
      {
        id: "g1",
        pageId: "p2",
        createdAt: at(60),
        grantedBy: { name: "Anna Keller" },
        page: { title: "Launch checklist" },
      },
    ]);
    db.calendarFeed.findMany.mockResolvedValue([
      { id: "f1", name: "Work", error: "invalid_grant", updatedAt: at(90) },
    ]);
    db.importRun.findMany.mockResolvedValue([
      {
        id: "i1",
        source: "todoist",
        status: "done",
        counts: { done: 12, skipped: 2, failed: 0 },
        finishedAt: at(120),
      },
    ]);

    const page = await getNotificationFeed({
      userId: "u1",
      group: "activity",
      now,
    });

    expect(page.items.map((i) => i.key)).toEqual([
      "action:a1",
      "comment:c1",
      "nudge:n1",
      "share:g1",
      "sync:f1",
      "import:i1",
    ]);
    expect(page.items[0]).toMatchObject({
      kind: "agent",
      title: "Needt added a task",
      body: "Send the invoice",
      link: "/tasks",
      unread: true,
    });
    expect(page.items[1]).toMatchObject({
      actor: "Lena Fischer",
      title: "Lena Fischer commented on Design rules",
      body: "Agreed on 13/12",
      link: "/pages/p1",
    });
    expect(page.items[4]).toMatchObject({ link: "/connections" });
    expect(page.items[5]).toMatchObject({
      title: "Todoist import finished",
      body: "12 imported, 2 skipped",
    });
    expect(page.unreadCount).toBe(6);
    expect(page.nextBefore).toBeNull();
  });

  it("scopes agent actions and imports to the workspace", async () => {
    await getNotificationFeed({
      userId: "u1",
      group: "activity",
      now,
      workspace: {
        enabled: true,
        workspaceId: "w1",
        workspaceKind: "TEAM",
        role: "EDITOR",
        dataScope: { mode: "workspace", workspaceId: "w1" },
      } as never,
    });
    expect(db.agentAction.findMany.mock.calls[0][0].where).toMatchObject({
      userId: "u1",
      workspaceId: "w1",
    });
    expect(db.importRun.findMany.mock.calls[0][0].where).toMatchObject({
      userId: "u1",
      workspaceId: "w1",
    });
  });

  it("reads each source once, bounded by the window (no per-row queries)", async () => {
    db.pageComment.findMany.mockResolvedValue(
      Array.from({ length: 40 }, (_, i) => ({
        id: `c${i}`,
        body: "x",
        createdAt: at(i + 1),
        pageId: "p",
        user: { name: "A" },
        page: { title: "T" },
      }))
    );
    await getNotificationFeed({ userId: "u1", group: "activity", now });
    for (const model of [
      "proactiveNudge",
      "notification",
      "agentAction",
      "pageComment",
      "pageAccessGrant",
      "moodboardAccessGrant",
      "calendarFeed",
      "importRun",
      "notificationRead",
    ]) {
      expect(db[model].findMany).toHaveBeenCalledTimes(1);
    }
    expect(
      db.proactiveNudge.findMany.mock.calls[0][0].where.createdAt.gte
    ).toEqual(new Date("2026-09-16T10:00:00.000Z"));
    expect(db.pageComment.findMany.mock.calls[0][0].take).toBe(100);
  });

  it("unread follows the source's readAt, per-key marks and the all mark", async () => {
    db.proactiveNudge.findMany.mockResolvedValue([
      nudge("n1", 20, at(1)),
      nudge("n2", 30),
      nudge("n3", 40),
      nudge("n4", 50),
    ]);
    db.notificationRead.findMany.mockResolvedValue([
      { key: "nudge:n2", readAt: at(2) },
      { key: ALL_READ_KEY, readAt: at(45) },
    ]);
    const page = await getNotificationFeed({
      userId: "u1",
      group: "activity",
      now,
    });
    const unread = Object.fromEntries(page.items.map((i) => [i.key, i.unread]));
    // n1 is read at its source, n2 by key, n4 is older than the all mark.
    expect(unread).toEqual({
      "nudge:n1": false,
      "nudge:n2": false,
      "nudge:n3": true,
      "nudge:n4": false,
    });
    expect(page.unreadCount).toBe(1);
  });

  it("pages by before and reports nextBefore", async () => {
    db.proactiveNudge.findMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => nudge(`n${i}`, i + 1))
    );
    const ask = (before?: string | null) =>
      getNotificationFeed({
        userId: "u1",
        group: "activity",
        now,
        limit: 2,
        before,
      });
    const first = await ask();
    expect(first.items.map((i) => i.key)).toEqual(["nudge:n0", "nudge:n1"]);
    expect(first.nextBefore).toBe(first.items[1].at);
    const second = await ask(first.nextBefore);
    expect(second.items.map((i) => i.key)).toEqual(["nudge:n2", "nudge:n3"]);
    const last = await ask(second.nextBefore);
    expect(last.items.map((i) => i.key)).toEqual(["nudge:n4"]);
    expect(last.nextBefore).toBeNull();
  });

  it("never trusts a deep link from data", () => {
    expect(safeLink("//evil.example")).toBe("/today");
    expect(safeLink("https://evil.example")).toBe("/today");
    expect(safeLink("/tasks?x=1")).toBe("/tasks?x=1");
  });
});

describe("getNotificationFeed (reminders)", () => {
  const times = (over: object) => ({
    scheduledStart: null,
    deadline: null,
    dueDate: null,
    ...over,
  });

  it("computes when a reminder fires like the worker and skips what is out of range", async () => {
    db.taskReminder.findMany.mockResolvedValue([
      {
        id: "r1",
        kind: "BEFORE_DEADLINE",
        offsetMinutes: 60,
        taskId: "t1",
        task: {
          title: "File taxes",
          ...times({ deadline: new Date("2026-10-16T15:00:00.000Z") }),
        },
      },
      {
        id: "r2",
        kind: "BEFORE_START",
        offsetMinutes: 10,
        taskId: "t2",
        task: {
          title: "Too far",
          ...times({ scheduledStart: new Date("2026-12-01T09:00:00.000Z") }),
        },
      },
      {
        id: "r3",
        kind: "BEFORE_START",
        offsetMinutes: 10,
        taskId: "t3",
        task: { title: "No time", ...times({}) },
      },
    ]);
    db.task.findMany.mockResolvedValue([
      {
        id: "t1",
        title: "File taxes",
        dueDate: new Date("2026-10-16T15:00:00.000Z"),
      },
      {
        id: "t4",
        title: "Pay rent",
        dueDate: new Date("2026-10-14T00:00:00.000Z"),
      },
    ]);
    const page = await getNotificationFeed({
      userId: "u1",
      group: "reminders",
      now,
    });
    expect(page.items.map((i) => [i.key, i.title, i.body])).toEqual([
      ["due:t4", "Pay rent", "Overdue"],
      ["reminder:r1", "File taxes", "Due soon"],
    ]);
    expect(page.items[1].at).toBe("2026-10-16T14:00:00.000Z");
    expect(page.items.every((i) => !i.unread)).toBe(true);
    expect(page.nextBefore).toBeNull();
    expect(db.taskReminder.findMany.mock.calls[0][0].where).toMatchObject({
      userId: "u1",
      canceledAt: null,
      deliveryStatus: "PENDING",
    });
  });

  it("reminderFiresAt mirrors the worker", () => {
    expect(
      reminderFiresAt({
        kind: "BEFORE_START",
        offsetMinutes: 10,
        task: {
          scheduledStart: new Date("2026-10-16T09:00:00.000Z"),
          deadline: null,
          dueDate: null,
        },
      })?.toISOString()
    ).toBe("2026-10-16T08:50:00.000Z");
  });
});

describe("markNotificationsRead", () => {
  it("stores the all mark under the reserved key", async () => {
    await markNotificationsRead({ userId: "u1", all: true, now });
    expect(db.notificationRead.upsert).toHaveBeenCalledWith({
      where: { userId_key: { userId: "u1", key: ALL_READ_KEY } },
      create: { userId: "u1", key: ALL_READ_KEY, readAt: now },
      update: { readAt: now },
    });
  });

  it("stores unique keys for the caller only", async () => {
    db.notificationRead.createMany.mockResolvedValue({ count: 2 });
    await markNotificationsRead({ userId: "u1", keys: ["a", "b", "a"], now });
    expect(db.notificationRead.createMany).toHaveBeenCalledWith({
      data: [
        { userId: "u1", key: "a", readAt: now },
        { userId: "u1", key: "b", readAt: now },
      ],
      skipDuplicates: true,
    });
  });

  it.each([
    [undefined],
    [[]],
    [["*"]],
    [[""]],
    [[1]],
    [["x".repeat(201)]],
    [Array.from({ length: 201 }, (_, i) => `k${i}`)],
  ])("refuses bad keys %#", async (keys) => {
    await expect(
      markNotificationsRead({ userId: "u1", keys })
    ).rejects.toBeInstanceOf(NotificationReadError);
    expect(db.notificationRead.createMany).not.toHaveBeenCalled();
  });
});
