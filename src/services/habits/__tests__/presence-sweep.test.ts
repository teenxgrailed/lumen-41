import { getNotificationPrefs } from "@/services/notifications/preferences";
import { deliverPush } from "@/services/reminders/reminder-delivery";
import { Prisma } from "@prisma/client";

import { isFeatureEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

import { runHabitPresenceSweep } from "../presence-sweep";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    featureFlag: { findUnique: jest.fn() },
    user: { findMany: jest.fn() },
    notificationSettings: { findUnique: jest.fn() },
    habitPush: { create: jest.fn(), delete: jest.fn(), findFirst: jest.fn() },
    habitEvent: { create: jest.fn() },
  },
}));
jest.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock("@/services/reminders/reminder-delivery", () => ({
  deliverPush: jest.fn(),
}));
jest.mock("@/services/push/targets", () => ({
  PUSH_TARGET_SELECT: {},
  pushConfigured: () => true,
  pushTargetsOf: (user: { pushSubscriptions: unknown[] }) => [
    ...user.pushSubscriptions,
  ],
}));
jest.mock("@/services/notifications/preferences", () => ({
  ...jest.requireActual("@/services/notifications/preferences"),
  getNotificationPrefs: jest.fn(),
}));

const db = prisma as unknown as {
  featureFlag: { findUnique: jest.Mock };
  user: { findMany: jest.Mock };
  notificationSettings: { findUnique: jest.Mock };
  habitPush: { create: jest.Mock; delete: jest.Mock; findFirst: jest.Mock };
  habitEvent: { create: jest.Mock };
};

const prefs = (over: object = {}) => ({
  reminders: true,
  nudges: false,
  mentions: true,
  weeklyReview: true,
  system: true,
  focusEnded: true,
  channelInApp: true,
  channelPush: true,
  channelMac: true,
  emailNotifications: true,
  quietHours: false,
  quietStart: "22:00",
  quietEnd: "08:00",
  digest: false,
  digestTime: "08:00",
  timeZone: "Europe/Zurich",
  ...over,
});

const settings = (over: object = {}) => ({
  habitReminders: true,
  habitCheckin: false,
  habitCheckinTime: "21:00",
  habitMilestones: true,
  habitReengage: false,
  ...over,
});

const habit = (over: object = {}) => ({
  id: "h1",
  title: "Read",
  kind: "BUILD",
  at: "18:00",
  daysOfWeek: [],
  remindersEnabled: true,
  quitStartedAt: null,
  createdAt: new Date("2026-09-01T00:00:00Z"),
  completions: [],
  events: [],
  ...over,
});

function person(habits: object[]) {
  db.user.findMany.mockResolvedValue([
    {
      id: "u1",
      pushSubscriptions: [{ id: "s1" }],
      nativePushTokens: [],
      habits,
    },
  ]);
}

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError("dup", {
    code: "P2002",
    clientVersion: "test",
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  db.featureFlag.findUnique.mockResolvedValue({
    enabled: true,
    _count: { overrides: 0 },
  });
  jest.mocked(isFeatureEnabled).mockResolvedValue(true);
  jest.mocked(getNotificationPrefs).mockResolvedValue(prefs() as never);
  db.notificationSettings.findUnique.mockResolvedValue(settings());
  db.habitPush.create.mockResolvedValue({ id: "claim-1" });
  db.habitPush.findFirst.mockResolvedValue(null);
  db.habitPush.delete.mockResolvedValue({});
  jest.mocked(deliverPush).mockResolvedValue(true);
});

// 18:10 in Zurich (CET).
const AT_1810 = new Date("2026-11-04T17:10:00Z");

describe("runHabitPresenceSweep", () => {
  it("does nothing while the flag cannot be on for anybody", async () => {
    db.featureFlag.findUnique.mockResolvedValue(null);
    expect(await runHabitPresenceSweep(AT_1810)).toEqual({
      users: 0,
      pushed: 0,
    });
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it("skips a person the flag is off for", async () => {
    person([habit()]);
    jest.mocked(isFeatureEnabled).mockResolvedValue(false);
    expect((await runHabitPresenceSweep(AT_1810)).pushed).toBe(0);
    expect(deliverPush).not.toHaveBeenCalled();
  });

  it("reminds at the habit's time in the person's zone", async () => {
    person([habit()]);
    const result = await runHabitPresenceSweep(AT_1810);
    expect(result.pushed).toBe(1);
    expect(deliverPush).toHaveBeenCalledTimes(1);
    expect(jest.mocked(deliverPush).mock.calls[0][1]).toMatchObject({
      title: "Read",
    });
    expect(db.habitPush.create.mock.calls[0][0].data).toMatchObject({
      userId: "u1",
      habitId: "h1",
      scope: "h1",
      kind: "reminder",
      dayKey: "2026-11-04",
    });
  });

  it("is not yet time an hour earlier, and not any more an hour later", async () => {
    person([habit()]);
    await runHabitPresenceSweep(new Date("2026-11-04T16:50:00Z")); // 17:50
    await runHabitPresenceSweep(new Date("2026-11-04T18:05:00Z")); // 19:05
    expect(deliverPush).not.toHaveBeenCalled();
  });

  it("uses the person's zone, not the server's", async () => {
    person([habit()]);
    jest
      .mocked(getNotificationPrefs)
      .mockResolvedValue(prefs({ timeZone: "America/Los_Angeles" }) as never);
    // 17:10Z is 09:10 in Los Angeles: not 18:00 yet.
    await runHabitPresenceSweep(AT_1810);
    expect(deliverPush).not.toHaveBeenCalled();
    // 02:10Z next day is 18:10 in Los Angeles.
    await runHabitPresenceSweep(new Date("2026-11-05T02:10:00Z"));
    expect(deliverPush).toHaveBeenCalledTimes(1);
  });

  it("sends a wall time skipped by the spring change once, after it", async () => {
    person([habit({ at: "02:30" })]);
    await runHabitPresenceSweep(new Date("2026-03-29T01:05:00Z")); // 03:05 CEST
    expect(deliverPush).toHaveBeenCalledTimes(1);
  });

  it("sends one push of a kind per habit per day: a second run is claimed already", async () => {
    person([habit()]);
    await runHabitPresenceSweep(AT_1810);
    db.habitPush.create.mockRejectedValueOnce(uniqueViolation());
    const second = await runHabitPresenceSweep(
      new Date(AT_1810.getTime() + 5 * 60_000)
    );
    expect(second.pushed).toBe(0);
    expect(deliverPush).toHaveBeenCalledTimes(1);
    expect(db.habitPush.delete).not.toHaveBeenCalled();
  });

  it("claims before it sends, and releases the claim when nothing was delivered", async () => {
    person([habit()]);
    jest.mocked(deliverPush).mockResolvedValue(false);
    const result = await runHabitPresenceSweep(AT_1810);
    expect(result.pushed).toBe(0);
    expect(db.habitPush.delete).toHaveBeenCalledWith({
      where: { id: "claim-1" },
    });
  });

  it("does not remind about a habit done today, switched off, or not today", async () => {
    person([
      habit({
        id: "a",
        completions: [{ date: new Date("2026-11-04T00:00:00Z") }],
      }),
      habit({ id: "b", remindersEnabled: false }),
      habit({ id: "c", daysOfWeek: [1] }), // Mondays; 4 Nov 2026 is a Wednesday
    ]);
    await runHabitPresenceSweep(AT_1810);
    expect(deliverPush).not.toHaveBeenCalled();
  });

  it("respects the global habit-reminders switch", async () => {
    person([habit()]);
    db.notificationSettings.findUnique.mockResolvedValue(
      settings({ habitReminders: false })
    );
    await runHabitPresenceSweep(AT_1810);
    expect(deliverPush).not.toHaveBeenCalled();
  });

  describe("quiet hours", () => {
    it("sends nothing inside them", async () => {
      person([habit({ at: "22:30" })]);
      jest
        .mocked(getNotificationPrefs)
        .mockResolvedValue(prefs({ quietHours: true }) as never);
      // 22:40 in Zurich.
      await runHabitPresenceSweep(new Date("2026-11-04T21:40:00Z"));
      expect(deliverPush).not.toHaveBeenCalled();
    });

    it("sends outside them", async () => {
      person([habit()]);
      jest
        .mocked(getNotificationPrefs)
        .mockResolvedValue(prefs({ quietHours: true }) as never);
      await runHabitPresenceSweep(AT_1810);
      expect(deliverPush).toHaveBeenCalledTimes(1);
    });

    it("quiet hours follow the person's zone", async () => {
      person([habit({ at: "03:00" })]);
      jest
        .mocked(getNotificationPrefs)
        .mockResolvedValue(
          prefs({ quietHours: true, timeZone: "UTC" }) as never
        );
      await runHabitPresenceSweep(new Date("2026-11-04T03:10:00Z"));
      expect(deliverPush).not.toHaveBeenCalled();
    });

    it("the push channel and the Reminders switch also hold it back", async () => {
      person([habit()]);
      jest
        .mocked(getNotificationPrefs)
        .mockResolvedValue(prefs({ channelPush: false }) as never);
      await runHabitPresenceSweep(AT_1810);
      jest
        .mocked(getNotificationPrefs)
        .mockResolvedValue(prefs({ reminders: false }) as never);
      await runHabitPresenceSweep(AT_1810);
      expect(deliverPush).not.toHaveBeenCalled();
    });
  });

  describe("evening check-in", () => {
    it("is one push per day at the chosen time, counting what is open", async () => {
      person([habit({ at: null }), habit({ id: "h2", at: null })]);
      db.notificationSettings.findUnique.mockResolvedValue(
        settings({ habitCheckin: true, habitCheckinTime: "21:00" })
      );
      // 21:05 in Zurich.
      await runHabitPresenceSweep(new Date("2026-11-04T20:05:00Z"));
      expect(deliverPush).toHaveBeenCalledTimes(1);
      expect(jest.mocked(deliverPush).mock.calls[0][1]).toMatchObject({
        title: "Evening check-in",
        body: "2 habits are still open today.",
      });
      expect(db.habitPush.create.mock.calls[0][0].data).toMatchObject({
        scope: "user",
        kind: "checkin",
      });
    });

    it("stays quiet when everything is done", async () => {
      person([
        habit({
          at: null,
          completions: [{ date: new Date("2026-11-04T00:00:00Z") }],
        }),
      ]);
      db.notificationSettings.findUnique.mockResolvedValue(
        settings({ habitCheckin: true })
      );
      await runHabitPresenceSweep(new Date("2026-11-04T20:05:00Z"));
      expect(deliverPush).not.toHaveBeenCalled();
    });
  });

  describe("QUIT milestones", () => {
    const quit = (start: string) =>
      habit({
        id: "q1",
        title: "No sugar",
        kind: "QUIT",
        at: null,
        quitStartedAt: new Date(start),
      });

    it("announces a milestone once, and records it as an event", async () => {
      person([quit("2026-10-28T08:00:00Z")]); // 7 days on 4 Nov
      const result = await runHabitPresenceSweep(AT_1810);
      expect(result.pushed).toBe(1);
      expect(jest.mocked(deliverPush).mock.calls[0][1]).toMatchObject({
        title: "7 days in",
        body: "No sugar",
      });
      expect(db.habitPush.create.mock.calls[0][0].data).toMatchObject({
        scope: "q1:7",
        kind: "milestone",
        dayKey: "2026-10-28",
      });
      expect(db.habitEvent.create.mock.calls[0][0].data).toMatchObject({
        habitId: "q1",
        type: "MILESTONE",
      });
    });

    it("does not repeat it: the claim is already taken", async () => {
      person([quit("2026-10-28T08:00:00Z")]);
      db.habitPush.create.mockRejectedValue(uniqueViolation());
      const result = await runHabitPresenceSweep(AT_1810);
      expect(result.pushed).toBe(0);
      expect(db.habitEvent.create).not.toHaveBeenCalled();
    });

    it("says nothing between milestones, nor on the day of a relapse", async () => {
      person([quit("2026-10-30T08:00:00Z")]); // 5 days
      await runHabitPresenceSweep(AT_1810);
      person([
        {
          ...quit("2026-10-01T08:00:00Z"),
          events: [{ type: "RELAPSE", at: new Date("2026-11-04T08:00:00Z") }],
        },
      ]); // relapse today: streak 0
      await runHabitPresenceSweep(AT_1810);
      expect(deliverPush).not.toHaveBeenCalled();
    });
  });

  describe("re-engage", () => {
    // 12:10 in Zurich.
    const NOON = new Date("2026-11-04T11:10:00Z");
    const quiet = () =>
      habit({
        at: null,
        completions: [{ date: new Date("2026-11-01T00:00:00Z") }],
      });

    it("is off by default", async () => {
      person([quiet()]);
      await runHabitPresenceSweep(NOON);
      expect(deliverPush).not.toHaveBeenCalled();
    });

    it("sends one soft push after 3 days without a check-in when switched on", async () => {
      person([quiet()]);
      db.notificationSettings.findUnique.mockResolvedValue(
        settings({ habitReengage: true })
      );
      await runHabitPresenceSweep(NOON);
      expect(deliverPush).toHaveBeenCalledTimes(1);
      expect(jest.mocked(deliverPush).mock.calls[0][1]).toMatchObject({
        title: "Your habits are here",
      });
    });

    it("waits out the cooldown", async () => {
      person([quiet()]);
      db.notificationSettings.findUnique.mockResolvedValue(
        settings({ habitReengage: true })
      );
      db.habitPush.findFirst.mockResolvedValue({
        createdAt: new Date("2026-11-01T12:00:00Z"),
      });
      await runHabitPresenceSweep(NOON);
      expect(deliverPush).not.toHaveBeenCalled();
    });
  });

  it("one failing person does not stop the others", async () => {
    db.user.findMany.mockResolvedValue([
      {
        id: "bad",
        pushSubscriptions: [{ id: "s0" }],
        nativePushTokens: [],
        habits: [habit()],
      },
      {
        id: "u1",
        pushSubscriptions: [{ id: "s1" }],
        nativePushTokens: [],
        habits: [habit()],
      },
    ]);
    jest
      .mocked(isFeatureEnabled)
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValue(true);
    const result = await runHabitPresenceSweep(AT_1810);
    expect(result).toEqual({ users: 2, pushed: 1 });
  });
});
