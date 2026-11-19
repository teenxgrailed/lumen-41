import {
  morningTouchCoversDigest,
  resetTouchZoneCache,
  runDayPlanTouchSweep,
  sendDayPlanTouch,
} from "../touches";

type Row = Record<string, unknown>;

const state = {
  planSettings: [] as Row[],
  userSettings: [] as Row[],
  notificationSettings: [] as Row[],
  users: [] as Row[],
  flagOn: true,
  touchesOn: true,
  flagRow: true,
  adapters: 0,
  writes: 0,
  devices: [{ id: "device-1", endpoint: "e" }] as Row[],
};

const same = (a: unknown, b: unknown) =>
  a instanceof Date && b instanceof Date
    ? a.getTime() === b.getTime()
    : (a ?? null) === (b ?? null);

/** Only the `OR: [{f: null}, {f: {lt}}]` and `{f: value}` shapes the sweep uses. */
function matchWhere(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === "OR") {
      return (cond as Row[]).some((part) => matchWhere(row, part));
    }
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as Row;
      if ("lt" in c) {
        const v = row[key] as Date | null;
        return v != null && v.getTime() < (c.lt as Date).getTime();
      }
      if ("in" in c) return (c.in as unknown[]).includes(row[key]);
      return false;
    }
    return same(row[key], cond);
  });
}

jest.mock("@/lib/prisma", () => ({
  prisma: {
    featureFlag: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        state.flagRow
          ? {
              enabled:
                where.key === "day_plan_touches"
                  ? state.touchesOn
                  : state.flagOn,
              overrides: [],
            }
          : null,
    },
    user: { findMany: async () => state.users },
    userSettings: {
      findMany: async () => state.userSettings,
      groupBy: async () =>
        [...new Set(state.userSettings.map((r) => r.timeZone))].map(
          (timeZone) => ({ timeZone })
        ),
    },
    notificationSettings: { findMany: async () => state.notificationSettings },
    planSettings: {
      findMany: async () => state.planSettings,
      findUnique: async ({ where }: { where: Row }) =>
        state.planSettings.find((r) => r.userId === where.userId) ?? null,
      createMany: async ({ data }: { data: Row[] }) => {
        state.writes += 1;
        for (const d of data) {
          if (!state.planSettings.some((r) => r.userId === d.userId)) {
            state.planSettings.push({
              morningTime: "08:00",
              eveningTime: "21:00",
              morningOn: true,
              eveningOn: true,
              lastMorningAt: null,
              lastEveningAt: null,
              ...d,
            });
          }
        }
        return { count: 1 };
      },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        state.writes += 1;
        const rows = state.planSettings.filter((r) => matchWhere(r, where));
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      },
    },
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/feature-flags", () => ({
  dayPlanTouchesEnabled: async () => state.flagOn && state.touchesOn,
}));

const deliver = jest.fn();
const telegram = jest.fn();
const buildMessage = jest.fn();
jest.mock("@/services/channels/touch", () => ({
  sendChannelTouch: (...args: unknown[]) => telegram(...args),
}));
jest.mock("@/services/channels/render", () => ({
  buildTouchMessage: (...args: unknown[]) => buildMessage(...args),
}));
jest.mock("@/services/reminders/reminder-delivery", () => ({
  deliverPush: (...args: unknown[]) => deliver(...args),
}));
jest.mock("@/services/channels/registry", () => ({
  configuredAdapters: () => new Array(state.adapters).fill({}),
}));
jest.mock("@/services/push/targets", () => ({
  PUSH_TARGET_SELECT: {},
  pushConfigured: () => true,
  pushTargetsOf: (u: {
    pushSubscriptions?: unknown[];
    nativePushTokens?: unknown[];
  }) => [...(u.pushSubscriptions ?? []), ...(u.nativePushTokens ?? [])],
  loadPushTargets: async () => state.devices,
}));

const planMock = {
  getDayPlan: jest.fn(),
  buildDraft: jest.fn(),
  activateDayPlan: jest.fn(),
};
jest.mock("../plan", () => ({
  getDayPlan: (...args: unknown[]) => planMock.getDayPlan(...args),
  buildDraft: (...args: unknown[]) => planMock.buildDraft(...args),
  activateDayPlan: (...args: unknown[]) => planMock.activateDayPlan(...args),
}));

/** Zurich is UTC+1 in November: 07:00Z is 08:00, 20:00Z is 21:00. */
const MORNING = new Date("2026-11-19T07:00:30Z");
const EVENING = new Date("2026-11-19T20:01:00Z");

const item = (title: string, isMain: boolean, over: Row = {}) => ({
  taskId: title,
  title,
  status: "todo",
  isMain,
  resolution: null,
  ...over,
});

const activePlan = (items: Row[], status = "active") => ({
  plan: { status, items },
});

beforeEach(() => {
  jest.clearAllMocks();
  state.planSettings = [];
  state.userSettings = [{ userId: "u1", timeZone: "Europe/Zurich" }];
  state.notificationSettings = [];
  state.users = [
    { id: "u1", pushSubscriptions: [{ id: "s1" }], nativePushTokens: [] },
  ];
  state.devices = [{ id: "device-1", endpoint: "e" }];
  telegram.mockResolvedValue(0);
  buildMessage.mockImplementation(async (_u: string, kind: string) => ({
    kind,
    text: `${kind} plan`,
    actions: [{ taskId: "t1", title: "Invoice", action: "done" }],
  }));
  state.flagOn = true;
  state.touchesOn = true;
  state.flagRow = true;
  state.adapters = 0;
  state.writes = 0;
  resetTouchZoneCache();
  deliver.mockResolvedValue(true);
  planMock.getDayPlan.mockResolvedValue(
    activePlan([
      item("Invoice", true),
      item("Call Anna", true),
      item("Gym", true),
      item("Read", false),
      item("Tidy", false),
    ])
  );
  planMock.buildDraft.mockResolvedValue({ plan: { items: [{}] } });
});

test("test_touches_default_to_8_and_21_local", async () => {
  // Not yet 08:00 and past the 30-minute window: nothing.
  await runDayPlanTouchSweep(new Date("2026-11-19T06:59:00Z"));
  await runDayPlanTouchSweep(new Date("2026-11-19T07:31:00Z"));
  expect(deliver).not.toHaveBeenCalled();

  await runDayPlanTouchSweep(MORNING);
  expect(deliver).toHaveBeenCalledTimes(1);
  expect(deliver.mock.calls[0][1]).toMatchObject({
    title: "Today",
    body: "Invoice, Call Anna, Gym +2",
    url: "/today",
  });
  expect(planMock.activateDayPlan).toHaveBeenCalledWith("u1", "2026-11-19");

  await runDayPlanTouchSweep(EVENING);
  expect(deliver).toHaveBeenCalledTimes(2);
  expect(deliver.mock.calls[1][1]).toMatchObject({
    title: "Close the day",
    body: "5 planned tasks left. Close the day.",
    url: "/today",
  });
  expect(planMock.buildDraft).toHaveBeenCalledWith(
    "u1",
    "2026-11-20",
    expect.anything()
  );
});

test("test_touch_is_sent_once_per_day", async () => {
  await runDayPlanTouchSweep(MORNING);
  await runDayPlanTouchSweep(new Date(MORNING.getTime() + 2 * 60_000));
  await Promise.all([
    runDayPlanTouchSweep(new Date(MORNING.getTime() + 3 * 60_000)),
    runDayPlanTouchSweep(new Date(MORNING.getTime() + 3 * 60_000)),
  ]);
  expect(deliver).toHaveBeenCalledTimes(1);

  // The next local day sends again.
  await runDayPlanTouchSweep(new Date("2026-11-20T07:00:30Z"));
  expect(deliver).toHaveBeenCalledTimes(2);
});

test("test_no_touch_without_time_zone", async () => {
  state.userSettings = [{ userId: "u1", timeZone: null }];
  await runDayPlanTouchSweep(MORNING);
  await runDayPlanTouchSweep(EVENING);
  state.userSettings = [];
  await runDayPlanTouchSweep(MORNING);
  expect(deliver).not.toHaveBeenCalled();
  expect(planMock.getDayPlan).not.toHaveBeenCalled();
});

test("test_touch_off_sends_nothing", async () => {
  state.planSettings = [
    {
      userId: "u1",
      morningTime: "08:00",
      eveningTime: "21:00",
      morningOn: true,
      eveningOn: false,
      lastMorningAt: null,
      lastEveningAt: null,
    },
  ];
  await runDayPlanTouchSweep(EVENING);
  expect(deliver).not.toHaveBeenCalled();
  // The morning one is still on.
  await runDayPlanTouchSweep(MORNING);
  expect(deliver).toHaveBeenCalledTimes(1);

  state.flagOn = false;
  await runDayPlanTouchSweep(new Date("2026-11-20T07:00:30Z"));
  expect(deliver).toHaveBeenCalledTimes(1);
});

test("custom times use the person's own clock", async () => {
  state.planSettings = [
    {
      userId: "u1",
      morningTime: "06:30",
      eveningTime: "22:15",
      morningOn: true,
      eveningOn: true,
      lastMorningAt: null,
      lastEveningAt: null,
    },
  ];
  await runDayPlanTouchSweep(MORNING);
  expect(deliver).not.toHaveBeenCalled();
  await runDayPlanTouchSweep(new Date("2026-11-19T05:31:00Z"));
  expect(deliver).toHaveBeenCalledTimes(1);
  await runDayPlanTouchSweep(new Date("2026-11-19T21:16:00Z"));
  expect(deliver).toHaveBeenCalledTimes(2);
});

test("morning is skipped when there is no plan and no candidate", async () => {
  planMock.getDayPlan.mockResolvedValue({ plan: null });
  planMock.buildDraft.mockResolvedValue({ plan: { items: [] } });
  await runDayPlanTouchSweep(MORNING);
  expect(deliver).not.toHaveBeenCalled();
});

test("quiet hours hold the touch back", async () => {
  state.notificationSettings = [
    {
      userId: "u1",
      quietHours: true,
      quietStart: "20:00",
      quietEnd: "09:00",
    },
  ];
  await runDayPlanTouchSweep(MORNING);
  await runDayPlanTouchSweep(EVENING);
  expect(deliver).not.toHaveBeenCalled();
});

test("a failed delivery gives the claim back for the next sweep", async () => {
  deliver.mockResolvedValueOnce(false);
  await runDayPlanTouchSweep(MORNING);
  expect(deliver).toHaveBeenCalledTimes(1);
  await runDayPlanTouchSweep(new Date(MORNING.getTime() + 60_000));
  expect(deliver).toHaveBeenCalledTimes(2);
});

test("test_plan_system_sends_only_two_touches", async () => {
  // Every 5 minutes for 24 hours, with plan data present all day.
  const start = new Date("2026-11-18T23:00:00Z").getTime();
  for (let i = 0; i < 24 * 12; i += 1) {
    await runDayPlanTouchSweep(new Date(start + i * 5 * 60_000 + 20_000));
  }
  const titles = deliver.mock.calls.map((call) => call[1].title);
  // One Zurich day (19 Nov) holds one of each; the sweep's 24h span starts at
  // 00:00 local, so exactly one morning and one evening.
  expect(titles.sort()).toEqual(["Close the day", "Today"]);
});

test("sendDayPlanTouch is the single fan-out and reports delivery", async () => {
  expect(
    await sendDayPlanTouch("u1", "morning", {
      title: "Today",
      body: "x",
      url: "/today",
    })
  ).toBe(true);
  deliver.mockResolvedValue(false);
  expect(
    await sendDayPlanTouch("u1", "evening", {
      title: "t",
      body: "x",
      url: "/today",
    })
  ).toBe(false);
});

test("test_touches_off_until_ui_ships", async () => {
  state.touchesOn = false;
  await runDayPlanTouchSweep(MORNING);
  await runDayPlanTouchSweep(EVENING);
  expect(deliver).not.toHaveBeenCalled();
  expect(planMock.getDayPlan).not.toHaveBeenCalled();
  expect(planMock.buildDraft).not.toHaveBeenCalled();
  // Nothing was claimed either, so turning it on later still sends that day.
  expect(state.planSettings).toEqual([]);
  state.touchesOn = true;
  await runDayPlanTouchSweep(MORNING);
  expect(deliver).toHaveBeenCalledTimes(1);
});

test("morningTouchCoversDigest follows what was really sent", async () => {
  const digest = { digestTime: "08:00", timeZone: "Europe/Zurich" };
  const now = new Date("2026-11-19T07:30:00Z");
  expect(await morningTouchCoversDigest("u1", digest, now)).toBe(false);
  await runDayPlanTouchSweep(MORNING);
  expect(await morningTouchCoversDigest("u1", digest, now)).toBe(true);
  state.touchesOn = false;
  expect(await morningTouchCoversDigest("u1", digest, now)).toBe(false);
});

test("a morning touch that is switched off never covers the digest", async () => {
  state.planSettings = [
    {
      userId: "u1",
      morningTime: "08:00",
      eveningTime: "21:00",
      morningOn: false,
      eveningOn: true,
      lastMorningAt: null,
      lastEveningAt: null,
    },
  ];
  await runDayPlanTouchSweep(MORNING);
  expect(
    await morningTouchCoversDigest(
      "u1",
      { digestTime: "08:00", timeZone: "Europe/Zurich" },
      new Date("2026-11-19T07:30:00Z")
    )
  ).toBe(false);
});

test("test_linked_telegram_gets_the_morning_touch", async () => {
  telegram.mockResolvedValue(1);
  state.users = [
    {
      id: "u1",
      pushSubscriptions: [{ id: "s1" }],
      nativePushTokens: [],
      channelLinks: [{ id: "l1" }],
    },
  ];
  await runDayPlanTouchSweep(MORNING);
  expect(telegram).toHaveBeenCalledTimes(1);
  expect(telegram.mock.calls[0][0]).toBe("u1");
  expect(telegram.mock.calls[0][1]).toMatchObject({
    kind: "morning",
    text: "morning plan",
    actions: [{ taskId: "t1", action: "done" }],
  });
});

test("test_push_and_telegram_count_as_one_touch", async () => {
  telegram.mockResolvedValue(1);
  state.users = [
    {
      id: "u1",
      pushSubscriptions: [{ id: "s1" }],
      nativePushTokens: [],
      channelLinks: [{ id: "l1" }],
    },
  ];
  await runDayPlanTouchSweep(MORNING);
  await runDayPlanTouchSweep(new Date(MORNING.getTime() + 60_000));
  expect(deliver).toHaveBeenCalledTimes(1);
  expect(telegram).toHaveBeenCalledTimes(1);

  // Push fails but Telegram delivers: still sent, claim kept.
  state.planSettings = [];
  deliver.mockResolvedValue(false);
  await runDayPlanTouchSweep(new Date("2026-11-20T07:00:30Z"));
  await runDayPlanTouchSweep(new Date("2026-11-20T07:02:00Z"));
  expect(telegram).toHaveBeenCalledTimes(2);

  // Every channel fails: the claim is released and the next sweep retries.
  telegram.mockResolvedValue(0);
  await runDayPlanTouchSweep(new Date("2026-11-21T07:00:30Z"));
  await runDayPlanTouchSweep(new Date("2026-11-21T07:02:00Z"));
  expect(telegram).toHaveBeenCalledTimes(4);
});

test("test_touch_reaches_telegram_without_push_device", async () => {
  telegram.mockResolvedValue(1);
  state.users = [
    {
      id: "u1",
      pushSubscriptions: [],
      nativePushTokens: [],
      channelLinks: [{ id: "l1" }],
    },
  ];
  state.devices = [];
  await runDayPlanTouchSweep(MORNING);
  expect(deliver).not.toHaveBeenCalled();
  expect(telegram).toHaveBeenCalledTimes(1);
});

test("test_moving_touch_time_after_it_was_sent_sends_nothing_more", async () => {
  await runDayPlanTouchSweep(MORNING);
  expect(deliver).toHaveBeenCalledTimes(1);
  state.planSettings[0].morningTime = "08:10";
  await runDayPlanTouchSweep(new Date("2026-11-19T07:12:00Z"));
  state.planSettings[0].morningTime = "07:50";
  await runDayPlanTouchSweep(new Date("2026-11-19T06:55:00Z"));
  expect(deliver).toHaveBeenCalledTimes(1);
});

test("test_changing_time_zone_after_touch_sends_nothing_more", async () => {
  await runDayPlanTouchSweep(MORNING);
  expect(deliver).toHaveBeenCalledTimes(1);
  // Athens is two hours ahead: 07:10Z is 09:10 there, inside a 09:00 window.
  state.userSettings = [{ userId: "u1", timeZone: "Europe/Athens" }];
  state.planSettings[0].morningTime = "09:00";
  await runDayPlanTouchSweep(new Date("2026-11-19T07:10:00Z"));
  expect(deliver).toHaveBeenCalledTimes(1);
});

test("test_dst_repeated_hour_sends_once", async () => {
  // 25 Oct 2026: Zurich clocks go 03:00 CEST back to 02:00 CET, so 02:30
  // happens twice (00:30Z and 01:30Z).
  state.planSettings = [
    {
      userId: "u1",
      morningTime: "02:30",
      eveningTime: "21:00",
      morningOn: true,
      eveningOn: true,
      lastMorningAt: null,
      lastEveningAt: null,
    },
  ];
  await runDayPlanTouchSweep(new Date("2026-10-25T00:35:00Z"));
  await runDayPlanTouchSweep(new Date("2026-10-25T01:35:00Z"));
  await runDayPlanTouchSweep(new Date("2026-10-25T01:55:00Z"));
  expect(deliver).toHaveBeenCalledTimes(1);
});

test("test_touch_catches_up_after_a_missed_sweep", async () => {
  // No sweep ran at 08:00 to 08:20; the 08:25 one still sends it.
  await runDayPlanTouchSweep(new Date("2026-11-19T07:25:00Z"));
  expect(deliver).toHaveBeenCalledTimes(1);
  // A failed delivery is retried by a later sweep inside the same window.
  deliver.mockResolvedValue(false);
  await runDayPlanTouchSweep(new Date("2026-11-20T07:00:30Z"));
  deliver.mockResolvedValue(true);
  await runDayPlanTouchSweep(new Date("2026-11-20T07:20:00Z"));
  expect(deliver).toHaveBeenCalledTimes(3);
});

test("test_invalid_time_zone_does_not_stop_the_sweep", async () => {
  state.users = [
    { id: "bad", pushSubscriptions: [{ id: "s0" }], nativePushTokens: [] },
    { id: "boom", pushSubscriptions: [{ id: "s2" }], nativePushTokens: [] },
    { id: "u1", pushSubscriptions: [{ id: "s1" }], nativePushTokens: [] },
  ];
  state.userSettings = [
    { userId: "bad", timeZone: "Mars/Olympus" },
    { userId: "boom", timeZone: "Europe/Zurich" },
    { userId: "u1", timeZone: "Europe/Zurich" },
  ];
  planMock.getDayPlan.mockImplementation(async (userId: string) => {
    if (userId === "boom") throw new Error("db down");
    return activePlan([item("Invoice", true)]);
  });
  await runDayPlanTouchSweep(MORNING);
  const claimed = state.planSettings.map((r) => r.userId);
  expect(claimed).not.toContain("bad");
  // The failing person released their claim; the next person still got it.
  expect(deliver).toHaveBeenCalledTimes(1);
  expect(
    state.planSettings.find((r) => r.userId === "boom")?.lastMorningAt
  ).toBeNull();
});

test("with no flag row at all (the shipping state) nothing is read or written", async () => {
  state.flagRow = false;
  await runDayPlanTouchSweep(MORNING);
  await runDayPlanTouchSweep(EVENING);
  expect(state.writes).toBe(0);
  expect(planMock.getDayPlan).not.toHaveBeenCalled();
  expect(planMock.buildDraft).not.toHaveBeenCalled();
  expect(deliver).not.toHaveBeenCalled();
});

test("the sweep stands down when neither push nor a messenger is configured", async () => {
  const targets = jest.requireMock("@/services/push/targets");
  const original = targets.pushConfigured;
  targets.pushConfigured = () => false;
  try {
    await runDayPlanTouchSweep(MORNING);
    expect(deliver).not.toHaveBeenCalled();
    expect(state.writes).toBe(0);
  } finally {
    targets.pushConfigured = original;
  }
});
