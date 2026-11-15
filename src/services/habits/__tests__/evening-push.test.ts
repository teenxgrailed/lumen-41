import { deliverPush } from "@/services/reminders/reminder-delivery";

import { prisma } from "@/lib/prisma";

import {
  EVENING_KIND,
  eveningEnabled,
  eveningPrefOf,
  eveningText,
  inEveningWindow,
  openHabitCount,
  runHabitEveningPush,
  zonesInEveningWindow,
} from "../evening-push";
import { localClock } from "../presence";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    featureFlag: { findUnique: jest.fn() },
    user: { findMany: jest.fn() },
    notificationSettings: { findMany: jest.fn() },
    userSettings: { findMany: jest.fn(), groupBy: jest.fn() },
    habit: { findMany: jest.fn() },
    habitPush: { createMany: jest.fn(), delete: jest.fn() },
  },
}));
jest.mock("@/lib/feature-flags", () => ({ rolloutBucket: () => 0 }));
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
  userSettings: { findMany: jest.Mock; groupBy: jest.Mock };
  habit: { findMany: jest.Mock };
  habitPush: { createMany: jest.Mock; delete: jest.Mock };
};
const deliver = deliverPush as jest.Mock;

/** 20:05 in Zurich (CET, UTC+1) on Monday 16 Nov 2026; 14:05 in New York. */
const AT_2005_ZURICH = new Date("2026-11-16T19:05:00Z");
const DAY = "2026-11-16";
const TODAY = new Date(`${DAY}T00:00:00Z`);
const YESTERDAY = new Date("2026-11-15T00:00:00Z");

const open = (n: number, over: object = {}) =>
  Array.from({ length: n }, () => ({
    userId: "u1",
    daysOfWeek: [],
    quota: null,
    completions: [],
    ...over,
  }));

interface Setup {
  zone?: string | null;
  prefs?: unknown;
  habits?: object[];
  subscriptions?: object[];
  notification?: object | null;
}

function setup({
  zone = "Europe/Zurich",
  prefs = {},
  habits = open(3),
  subscriptions = [{ id: "s1" }],
  notification = null,
}: Setup = {}) {
  db.featureFlag.findUnique.mockResolvedValue({
    enabled: true,
    rolloutPercentage: 100,
    overrides: [],
  });
  db.user.findMany.mockResolvedValue([
    { id: "u1", pushSubscriptions: subscriptions, nativePushTokens: [] },
  ]);
  db.notificationSettings.findMany.mockResolvedValue(
    notification ? [{ userId: "u1", ...notification }] : []
  );
  db.userSettings.groupBy.mockResolvedValue([
    { timeZone: zone ?? "Europe/Zurich" },
  ]);
  db.userSettings.findMany.mockResolvedValue([
    { userId: "u1", timeZone: zone, prefs },
  ]);
  db.habit.findMany.mockResolvedValue(habits);
  db.habitPush.createMany.mockResolvedValue({ count: 1 });
  db.habitPush.delete.mockResolvedValue({});
  deliver.mockResolvedValue(true);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("the push", () => {
  it("says how many habits are left, once, at 20:00 in the person's zone", async () => {
    setup();
    const out = await runHabitEveningPush(AT_2005_ZURICH);
    expect(out.pushed).toBe(1);
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver.mock.calls[0][1]).toMatchObject({
      body: "3 habits left today",
      url: "/habits",
      tag: `evening:${DAY}`,
    });
    expect(db.habitPush.createMany.mock.calls[0][0].data[0]).toMatchObject({
      userId: "u1",
      scope: "user",
      kind: EVENING_KIND,
      dayKey: DAY,
    });
  });

  it("counts only the habits still open", async () => {
    setup({
      habits: [
        ...open(2),
        ...open(1, { completions: [{ date: TODAY }] }),
        ...open(1, { daysOfWeek: [3] }), // Wednesday only; today is Monday
      ],
    });
    await runHabitEveningPush(AT_2005_ZURICH);
    expect(deliver.mock.calls[0][1].body).toBe("2 habits left today");
  });

  it("is sent only when habits are left", async () => {
    setup({ habits: open(2, { completions: [{ date: TODAY }] }) });
    const out = await runHabitEveningPush(AT_2005_ZURICH);
    expect(out.pushed).toBe(0);
    expect(deliver).not.toHaveBeenCalled();
    expect(db.habitPush.createMany).not.toHaveBeenCalled();
  });

  it("is sent once a day: a claimed day is not sent again", async () => {
    setup();
    db.habitPush.createMany.mockResolvedValue({ count: 0 });
    const out = await runHabitEveningPush(AT_2005_ZURICH);
    expect(out.pushed).toBe(0);
    expect(deliver).not.toHaveBeenCalled();
  });

  it("gives the day's claim back when no device was reached", async () => {
    setup();
    db.habitPush.createMany.mockImplementation(async ({ data }) => {
      expect(data[0].id).toBeTruthy();
      return { count: 1 };
    });
    deliver.mockResolvedValue(false);
    const out = await runHabitEveningPush(AT_2005_ZURICH);
    expect(out.pushed).toBe(0);
    expect(db.habitPush.delete).toHaveBeenCalledTimes(1);
  });

  it("waits for 20:00 in each person's own zone", async () => {
    setup({ zone: "America/New_York" }); // 14:05 there
    await runHabitEveningPush(AT_2005_ZURICH);
    expect(deliver).not.toHaveBeenCalled();
    setup({ zone: "America/New_York" });
    // 20:05 in New York is 01:05Z the next day
    await runHabitEveningPush(new Date("2026-11-17T01:05:00Z"));
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(db.habitPush.createMany.mock.calls[0][0].data[0].dayKey).toBe(DAY);
  });

  it("does not send at 21:00 or at 19:55", async () => {
    setup();
    await runHabitEveningPush(new Date("2026-11-16T20:00:00Z")); // 21:00
    await runHabitEveningPush(new Date("2026-11-16T18:55:00Z")); // 19:55
    expect(deliver).not.toHaveBeenCalled();
  });

  it("never reaches a person with no push subscription", async () => {
    setup({ subscriptions: [] });
    const out = await runHabitEveningPush(AT_2005_ZURICH);
    expect(out.pushed).toBe(0);
    expect(deliver).not.toHaveBeenCalled();
    expect(db.habitPush.createMany).not.toHaveBeenCalled();
  });

  it("is off when the person switched it off", async () => {
    setup({ prefs: { habitEveningPush: false } });
    await runHabitEveningPush(AT_2005_ZURICH);
    expect(deliver).not.toHaveBeenCalled();
  });

  it("is on when the person switched it on", async () => {
    setup({ prefs: { habitEveningPush: true } });
    await runHabitEveningPush(AT_2005_ZURICH);
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it("does not guess a zone for a person who has none stored", async () => {
    setup({ zone: null });
    await runHabitEveningPush(AT_2005_ZURICH);
    expect(deliver).not.toHaveBeenCalled();
  });

  it("stays quiet in quiet hours, with push switched off, or in digest mode", async () => {
    setup({
      notification: {
        quietHours: true,
        quietStart: "19:00",
        quietEnd: "08:00",
      },
    });
    await runHabitEveningPush(AT_2005_ZURICH);
    setup({ notification: { channelPush: false } });
    await runHabitEveningPush(AT_2005_ZURICH);
    setup({ notification: { digest: true } });
    await runHabitEveningPush(AT_2005_ZURICH);
    expect(deliver).not.toHaveBeenCalled();
  });
});

describe("who is loaded", () => {
  it("only people in a zone where it is 20:00-20:29 now, and not already sent today", async () => {
    setup();
    await runHabitEveningPush(AT_2005_ZURICH);
    const where = db.user.findMany.mock.calls[0][0].where;
    expect(where.userSettings).toEqual({
      is: { timeZone: { in: ["Europe/Zurich"] } },
    });
    expect(where.HabitPush.none.kind).toBe(EVENING_KIND);
    expect(where.HabitPush.none.createdAt.gte).toBeInstanceOf(Date);
  });

  it("nobody is read when no stored zone is in the window", async () => {
    setup({ zone: "America/New_York" });
    const out = await runHabitEveningPush(AT_2005_ZURICH);
    expect(out).toEqual({ users: 0, pushed: 0 });
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it("picks the zones in the window, aliases included", () => {
    const zones = [
      "Europe/Zurich",
      "Europe/Kiev",
      "America/New_York",
      "Asia/Tokyo",
      "UTC",
    ];
    // 19:05Z: 20:05 Zurich, 21:05 Kyiv, 14:05 New York, 04:05 Tokyo, 19:05 UTC
    expect(zonesInEveningWindow(zones, AT_2005_ZURICH)).toEqual([
      "Europe/Zurich",
    ]);
    // 18:10Z: 19:10 Zurich, 20:10 Kyiv
    expect(
      zonesInEveningWindow(zones, new Date("2026-11-16T18:10:00Z"))
    ).toEqual(["Europe/Kiev"]);
    // 20:10Z: 20:10 UTC
    expect(
      zonesInEveningWindow(zones, new Date("2026-11-16T20:10:00Z"))
    ).toEqual(["UTC"]);
  });
});

describe("the flag", () => {
  it("off: no row is read and nothing is sent", async () => {
    setup();
    db.featureFlag.findUnique.mockResolvedValue(null);
    const out = await runHabitEveningPush(AT_2005_ZURICH);
    expect(out).toEqual({ users: 0, pushed: 0 });
    expect(db.user.findMany).not.toHaveBeenCalled();
    expect(deliver).not.toHaveBeenCalled();
  });

  it("disabled with no override that turns it on: the same", async () => {
    setup();
    db.featureFlag.findUnique.mockResolvedValue({
      enabled: false,
      rolloutPercentage: 100,
      overrides: [{ userId: "u1", enabled: false }],
    });
    await runHabitEveningPush(AT_2005_ZURICH);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it("an override can turn it on for one account only", async () => {
    setup();
    db.featureFlag.findUnique.mockResolvedValue({
      enabled: false,
      rolloutPercentage: 0,
      overrides: [{ userId: "u1", enabled: true }],
    });
    await runHabitEveningPush(AT_2005_ZURICH);
    expect(db.user.findMany.mock.calls[0][0].where.id).toEqual({ in: ["u1"] });
    expect(deliver).toHaveBeenCalledTimes(1);
  });
});

describe("the rules", () => {
  const clock = localClock(AT_2005_ZURICH, "Europe/Zurich");

  it("the window is 20:00 to 20:29", () => {
    const at = (iso: string) => localClock(new Date(iso), "Europe/Zurich");
    expect(inEveningWindow(at("2026-11-16T18:59:00Z"))).toBe(false);
    expect(inEveningWindow(at("2026-11-16T19:00:00Z"))).toBe(true);
    expect(inEveningWindow(at("2026-11-16T19:29:00Z"))).toBe(true);
    expect(inEveningWindow(at("2026-11-16T19:30:00Z"))).toBe(false);
  });

  it("a stored choice wins; the default is on only with a subscription", () => {
    expect(eveningEnabled(false, true)).toBe(false);
    expect(eveningEnabled(true, false)).toBe(true);
    expect(eveningEnabled(undefined, true)).toBe(true);
    expect(eveningEnabled(undefined, false)).toBe(false);
    expect(eveningEnabled("yes", false)).toBe(false);
  });

  it("reads the choice from prefs, or nothing", () => {
    expect(eveningPrefOf({ habitEveningPush: false })).toBe(false);
    expect(eveningPrefOf({ habitEveningPush: "no" })).toBeUndefined();
    expect(eveningPrefOf({})).toBeUndefined();
    expect(eveningPrefOf(null)).toBeUndefined();
    expect(eveningPrefOf([])).toBeUndefined();
  });

  it("a per-week habit whose week is met is not left", () => {
    const keys = ["2026-11-15", "2026-11-14", "2026-11-13"];
    expect(
      openHabitCount(
        [{ daysOfWeek: [], quota: 3, completionKeys: keys }],
        clock
      )
    ).toBe(0);
    expect(
      openHabitCount(
        [{ daysOfWeek: [], quota: 4, completionKeys: keys }],
        clock
      )
    ).toBe(1);
    // outside the last seven days it does not count
    expect(
      openHabitCount(
        [{ daysOfWeek: [], quota: 1, completionKeys: ["2026-11-01"] }],
        clock
      )
    ).toBe(1);
    expect(YESTERDAY.toISOString().slice(0, 10)).toBe("2026-11-15");
  });

  it("words one and many", () => {
    expect(eveningText(1).body).toBe("1 habit left today");
    expect(eveningText(3).body).toBe("3 habits left today");
  });
});
