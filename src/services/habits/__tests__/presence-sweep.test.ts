import { deliverPush } from "@/services/reminders/reminder-delivery";

import { canUseQuitHabits } from "@/lib/entitlements";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { runHabitPresenceSweep } from "../presence-sweep";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    featureFlag: { findUnique: jest.fn() },
    user: { findMany: jest.fn() },
    notificationSettings: { findMany: jest.fn() },
    userSettings: { findMany: jest.fn() },
    habitCompletion: { findMany: jest.fn() },
    habitPush: {
      createMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      groupBy: jest.fn(),
    },
    habitEvent: { create: jest.fn(), findMany: jest.fn() },
  },
}));
jest.mock("@/lib/feature-flags", () => ({ rolloutBucket: () => 0 }));
jest.mock("@/lib/entitlements", () => ({ canUseQuitHabits: jest.fn() }));
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

const db = prisma as unknown as {
  featureFlag: { findUnique: jest.Mock };
  user: { findMany: jest.Mock };
  notificationSettings: { findMany: jest.Mock };
  userSettings: { findMany: jest.Mock };
  habitCompletion: { findMany: jest.Mock };
  habitPush: {
    createMany: jest.Mock;
    delete: jest.Mock;
    deleteMany: jest.Mock;
    groupBy: jest.Mock;
  };
  habitEvent: { create: jest.Mock; findMany: jest.Mock };
};

let prefState: Record<string, unknown> = {};
let settingState: Record<string, unknown> = {};
const setPrefs = (over: object = {}) => {
  prefState = prefs(over);
};
const setSettings = (over: object = {}) => {
  settingState = settings(over);
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

type Fixture = {
  id: string;
  completions?: { date: Date }[];
  events?: object[];
};

/** The person's habits as the sweep reads them: bare, then the batched reads. */
function person(habits: object[]) {
  const all = habits as Fixture[];
  db.user.findMany.mockResolvedValue([
    {
      id: "u1",
      pushSubscriptions: [{ id: "s1" }],
      nativePushTokens: [],
      habits: all.map(({ completions, events, ...bare }) => {
        void completions;
        void events;
        return bare;
      }),
    },
  ]);
  db.habitCompletion.findMany.mockResolvedValue(
    all.flatMap((h) =>
      (h.completions ?? []).map((c) => ({ habitId: h.id, date: c.date }))
    )
  );
  db.habitEvent.findMany.mockResolvedValue(
    all.flatMap((h) => (h.events ?? []).map((e) => ({ habitId: h.id, ...e })))
  );
}

beforeEach(() => {
  jest.resetAllMocks();
  db.featureFlag.findUnique.mockResolvedValue({
    enabled: true,
    rolloutPercentage: 100,
    overrides: [],
  });
  setPrefs();
  setSettings();
  db.notificationSettings.findMany.mockImplementation(async () => {
    const { timeZone: _zone, ...row } = prefState;
    void _zone;
    return [{ userId: "u1", ...row, ...settingState }];
  });
  db.userSettings.findMany.mockImplementation(async () => [
    { userId: "u1", timeZone: prefState.timeZone },
  ]);
  jest.mocked(canUseQuitHabits).mockResolvedValue({
    allowed: true,
    upgradeRequired: false,
    plan: "PRO",
  } as never);
  db.habitCompletion.findMany.mockResolvedValue([]);
  db.habitEvent.findMany.mockResolvedValue([]);
  db.habitPush.createMany.mockResolvedValue({ count: 1 });
  db.habitPush.groupBy.mockResolvedValue([]);
  db.habitPush.delete.mockResolvedValue({});
  db.habitPush.deleteMany.mockResolvedValue({ count: 0 });
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
    db.featureFlag.findUnique.mockResolvedValue({
      enabled: true,
      rolloutPercentage: 100,
      overrides: [{ userId: "u1", enabled: false }],
    });
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
      // The open app's island closes the push by this tag.
      tag: "rem:h1:2026-11-04",
    });
    expect(db.habitPush.createMany.mock.calls[0][0].data[0]).toMatchObject({
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
    setPrefs({ timeZone: "America/Los_Angeles" });
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
    db.habitPush.createMany.mockResolvedValueOnce({ count: 0 });
    const second = await runHabitPresenceSweep(
      new Date(AT_1810.getTime() + 5 * 60_000)
    );
    expect(second.pushed).toBe(0);
    expect(deliverPush).toHaveBeenCalledTimes(1);
    expect(db.habitPush.delete).not.toHaveBeenCalled();
  });

  it("claims with skipDuplicates, so an existing row is a count of 0 and not a thrown error", async () => {
    person([habit()]);
    await runHabitPresenceSweep(AT_1810);
    expect(db.habitPush.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });

  it("claims before it sends, and releases the claim when nothing was delivered", async () => {
    person([habit()]);
    jest.mocked(deliverPush).mockResolvedValue(false);
    const result = await runHabitPresenceSweep(AT_1810);
    expect(result.pushed).toBe(0);
    expect(db.habitPush.delete).toHaveBeenCalledWith({
      where: { id: db.habitPush.createMany.mock.calls[0][0].data[0].id },
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
    setSettings({ habitReminders: false });
    await runHabitPresenceSweep(AT_1810);
    expect(deliverPush).not.toHaveBeenCalled();
  });

  describe("quiet hours", () => {
    it("sends nothing inside them", async () => {
      person([habit({ at: "22:30" })]);
      setPrefs({ quietHours: true });
      // 22:40 in Zurich.
      await runHabitPresenceSweep(new Date("2026-11-04T21:40:00Z"));
      expect(deliverPush).not.toHaveBeenCalled();
    });

    it("sends outside them", async () => {
      person([habit()]);
      setPrefs({ quietHours: true });
      await runHabitPresenceSweep(AT_1810);
      expect(deliverPush).toHaveBeenCalledTimes(1);
    });

    it("quiet hours follow the person's zone", async () => {
      person([habit({ at: "03:00" })]);
      setPrefs({ quietHours: true, timeZone: "UTC" });
      await runHabitPresenceSweep(new Date("2026-11-04T03:10:00Z"));
      expect(deliverPush).not.toHaveBeenCalled();
    });

    it("the push channel and the Reminders switch also hold it back", async () => {
      person([habit()]);
      setPrefs({ channelPush: false });
      await runHabitPresenceSweep(AT_1810);
      setPrefs({ reminders: false });
      await runHabitPresenceSweep(AT_1810);
      expect(deliverPush).not.toHaveBeenCalled();
    });
  });

  describe("evening check-in", () => {
    it("is one push per day at the chosen time, counting what is open", async () => {
      person([habit({ at: null }), habit({ id: "h2", at: null })]);
      setSettings({ habitCheckin: true, habitCheckinTime: "21:00" });
      // 21:05 in Zurich.
      await runHabitPresenceSweep(new Date("2026-11-04T20:05:00Z"));
      expect(deliverPush).toHaveBeenCalledTimes(1);
      expect(jest.mocked(deliverPush).mock.calls[0][1]).toMatchObject({
        title: "Evening check-in",
        body: "2 habits are still open today.",
      });
      expect(db.habitPush.createMany.mock.calls[0][0].data[0]).toMatchObject({
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
      setSettings({ habitCheckin: true });
      await runHabitPresenceSweep(new Date("2026-11-04T20:05:00Z"));
      expect(deliverPush).not.toHaveBeenCalled();
    });
  });

  describe("QUIT milestones", () => {
    // 09:10 in Zurich.
    const AT_0910 = new Date("2026-11-04T08:10:00Z");
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
      const result = await runHabitPresenceSweep(AT_0910);
      expect(result.pushed).toBe(1);
      expect(jest.mocked(deliverPush).mock.calls[0][1]).toMatchObject({
        title: "7 days in",
        body: "No sugar",
      });
      expect(db.habitPush.createMany.mock.calls[0][0].data[0]).toMatchObject({
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
      db.habitPush.createMany.mockResolvedValue({ count: 0 });
      const result = await runHabitPresenceSweep(AT_0910);
      expect(result.pushed).toBe(0);
      expect(db.habitEvent.create).not.toHaveBeenCalled();
    });

    it("says nothing between milestones, nor on the day of a relapse", async () => {
      person([quit("2026-10-30T08:00:00Z")]); // 5 days
      await runHabitPresenceSweep(AT_0910);
      person([
        {
          ...quit("2026-10-01T08:00:00Z"),
          events: [{ type: "RELAPSE", at: new Date("2026-11-04T08:00:00Z") }],
        },
      ]); // relapse today: streak 0
      await runHabitPresenceSweep(AT_0910);
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
      setSettings({ habitReengage: true });
      await runHabitPresenceSweep(NOON);
      expect(deliverPush).toHaveBeenCalledTimes(1);
      expect(jest.mocked(deliverPush).mock.calls[0][1]).toMatchObject({
        title: "Your habits are here",
      });
    });

    it("waits out the cooldown", async () => {
      person([quiet()]);
      setSettings({ habitReengage: true });
      db.habitPush.groupBy.mockResolvedValue([
        {
          userId: "u1",
          _max: { createdAt: new Date("2026-11-01T12:00:00Z") },
        },
      ]);
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
    const rows = (extra: object = {}) =>
      ["bad", "u1"].map((userId) => {
        const { timeZone: _zone, ...row } = prefState;
        void _zone;
        return { userId, ...row, ...settingState, ...extra };
      });
    db.notificationSettings.findMany.mockImplementation(async () => rows());
    db.userSettings.findMany.mockImplementation(async () =>
      ["bad", "u1"].map((userId) => ({ userId, timeZone: prefState.timeZone }))
    );
    db.habitPush.createMany.mockRejectedValueOnce(new Error("db down"));
    const result = await runHabitPresenceSweep(AT_1810);
    expect(result).toEqual({ users: 2, pushed: 1 });
  });

  describe("a run is cheap", () => {
    it("reads the flag once and restricts the query to overrides when it is off for all", async () => {
      db.featureFlag.findUnique.mockResolvedValue({
        enabled: false,
        rolloutPercentage: 0,
        overrides: [
          { userId: "u1", enabled: true },
          { userId: "u2", enabled: false },
        ],
      });
      person([habit()]);
      await runHabitPresenceSweep(AT_1810);
      expect(db.featureFlag.findUnique).toHaveBeenCalledTimes(1);
      expect(db.user.findMany.mock.calls[0][0].where).toMatchObject({
        id: { in: ["u1"] },
      });
    });

    it("loads preferences once for the page, not once per person", async () => {
      person([habit()]);
      await runHabitPresenceSweep(AT_1810);
      expect(db.notificationSettings.findMany).toHaveBeenCalledTimes(1);
      expect(db.userSettings.findMany).toHaveBeenCalledTimes(1);
    });

    it("loads completions only for people with something due now", async () => {
      person([habit({ at: "07:00" })]); // 07:00 is not 18:10
      await runHabitPresenceSweep(AT_1810);
      expect(db.habitCompletion.findMany).not.toHaveBeenCalled();
      expect(db.habitEvent.findMany).not.toHaveBeenCalled();
    });

    it("keeps paging until a page comes back short", async () => {
      const full = Array.from({ length: 200 }, (_, i) => ({
        id: `p${String(i).padStart(3, "0")}`,
        pushSubscriptions: [{ id: "s" }],
        nativePushTokens: [],
        habits: [],
      }));
      db.user.findMany
        .mockResolvedValueOnce(full)
        .mockResolvedValueOnce(full)
        .mockResolvedValueOnce(full.slice(0, 3));
      const result = await runHabitPresenceSweep(AT_1810);
      expect(db.user.findMany).toHaveBeenCalledTimes(3);
      expect(result.users).toBe(403);
    });
  });

  describe("QUIT is Pro", () => {
    const AT_0910 = new Date("2026-11-04T08:10:00Z");
    const quit = () =>
      habit({
        id: "q1",
        title: "No sugar",
        kind: "QUIT",
        at: null,
        quitStartedAt: new Date("2026-10-28T08:00:00Z"),
      });

    it("sends no milestone and records no event for a Free account", async () => {
      person([quit()]);
      jest.mocked(canUseQuitHabits).mockResolvedValue({
        allowed: false,
        upgradeRequired: true,
        plan: "FREE",
      } as never);
      const result = await runHabitPresenceSweep(AT_0910);
      expect(result.pushed).toBe(0);
      expect(db.habitEvent.create).not.toHaveBeenCalled();
    });

    it("keeps BUILD reminders for a Free account", async () => {
      person([habit()]);
      jest.mocked(canUseQuitHabits).mockResolvedValue({
        allowed: false,
        upgradeRequired: true,
        plan: "FREE",
      } as never);
      expect((await runHabitPresenceSweep(AT_1810)).pushed).toBe(1);
    });

    it("looks the plan up once, and reads relapses, for a Pro account with a milestone due", async () => {
      person([quit()]);
      await runHabitPresenceSweep(AT_0910);
      expect(canUseQuitHabits).toHaveBeenCalledTimes(1);
      expect(db.habitEvent.findMany).toHaveBeenCalledTimes(1);
      expect(db.habitEvent.findMany.mock.calls[0][0].where).toMatchObject({
        habitId: { in: ["q1"] },
      });
    });

    it("skips the relapse read for a Free account at 09:00", async () => {
      person([quit()]);
      jest.mocked(canUseQuitHabits).mockResolvedValue({
        allowed: false,
        upgradeRequired: true,
        plan: "FREE",
      } as never);
      await runHabitPresenceSweep(AT_0910);
      expect(canUseQuitHabits).toHaveBeenCalledTimes(1);
      expect(db.habitEvent.findMany).not.toHaveBeenCalled();
    });

    it("does not check the plan when no milestone or check-in is due", async () => {
      person([quit()]);
      await runHabitPresenceSweep(AT_1810); // evening: no milestone, check-in off
      expect(canUseQuitHabits).not.toHaveBeenCalled();
    });

    it("does not check the plan for a person with no QUIT habit", async () => {
      person([habit({ at: "09:00" })]);
      await runHabitPresenceSweep(AT_0910);
      expect(canUseQuitHabits).not.toHaveBeenCalled();
    });

    it("checks the plan for the check-in count when QUIT habits exist", async () => {
      person([habit({ at: null }), quit()]);
      setSettings({ habitCheckin: true });
      await runHabitPresenceSweep(new Date("2026-11-04T20:05:00Z"));
      expect(canUseQuitHabits).toHaveBeenCalledTimes(1);
      expect(jest.mocked(deliverPush).mock.calls[0][1]).toMatchObject({
        body: "2 habits are still open today.",
      });
    });

    it("does not count QUIT habits in a Free account's check-in", async () => {
      person([habit({ at: null }), quit()]);
      setSettings({ habitCheckin: true });
      jest.mocked(canUseQuitHabits).mockResolvedValue({
        allowed: false,
        upgradeRequired: true,
        plan: "FREE",
      } as never);
      await runHabitPresenceSweep(new Date("2026-11-04T20:05:00Z"));
      expect(jest.mocked(deliverPush).mock.calls[0][1]).toMatchObject({
        body: "1 habit is still open today.",
      });
    });
  });

  it("announces a milestone only around 09:00, not in the evening", async () => {
    person([
      habit({
        id: "q1",
        kind: "QUIT",
        at: null,
        quitStartedAt: new Date("2026-10-28T08:00:00Z"),
      }),
    ]);
    await runHabitPresenceSweep(AT_1810);
    expect(deliverPush).not.toHaveBeenCalled();
  });

  it("a failing follow-up does not hide the person's other pushes", async () => {
    person([
      habit({ at: "09:00" }),
      habit({
        id: "q1",
        kind: "QUIT",
        at: null,
        quitStartedAt: new Date("2026-10-28T08:00:00Z"),
      }),
    ]);
    // 09:10: the 09:00 reminder and the milestone are both due; the
    // milestone's event write fails after its push is out.
    db.habitEvent.create.mockRejectedValue(new Error("write failed"));
    const result = await runHabitPresenceSweep(
      new Date("2026-11-04T08:10:00Z")
    );
    expect(result.pushed).toBe(2);
    expect(logger.error).toHaveBeenCalled();
  });

  it("logs a warning and stops when the page cap is hit", async () => {
    const full = Array.from({ length: 200 }, (_, i) => ({
      id: `p${String(i).padStart(3, "0")}`,
      pushSubscriptions: [{ id: "s" }],
      nativePushTokens: [],
      habits: [],
    }));
    db.user.findMany.mockResolvedValue(full);
    const result = await runHabitPresenceSweep(AT_1810);
    expect(db.user.findMany).toHaveBeenCalledTimes(500);
    expect(result.users).toBe(500 * 200);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("page cap"),
      { pages: 500, users: 500 * 200 },
      expect.any(String)
    );
  });

  it("catches and logs a prune failure without failing the sweep", async () => {
    person([habit()]);
    db.habitPush.deleteMany.mockRejectedValue(new Error("db down"));
    const result = await runHabitPresenceSweep(
      new Date("2026-11-04T17:05:00Z")
    );
    expect(result.pushed).toBe(1);
    expect(logger.error).toHaveBeenCalledWith(
      "Habit presence prune failed",
      { error: "db down" },
      expect.any(String)
    );
  });

  it("prunes dedup rows older than 30 days once an hour", async () => {
    person([habit()]);
    await runHabitPresenceSweep(new Date("2026-11-04T17:05:00Z"));
    expect(db.habitPush.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date("2026-10-05T17:05:00.000Z") } },
    });
    db.habitPush.deleteMany.mockClear();
    await runHabitPresenceSweep(new Date("2026-11-04T17:30:00Z"));
    expect(db.habitPush.deleteMany).not.toHaveBeenCalled();
  });
});
