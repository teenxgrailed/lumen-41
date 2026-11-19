import { runDayPlanTouchSweep, sendDayPlanTouch } from "../touches";

type Row = Record<string, unknown>;

const state = {
  planSettings: [] as Row[],
  userSettings: [] as Row[],
  notificationSettings: [] as Row[],
  users: [] as Row[],
  flagOn: true,
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
      findUnique: async () => ({ enabled: state.flagOn, overrides: [] }),
    },
    user: { findMany: async () => state.users },
    userSettings: { findMany: async () => state.userSettings },
    notificationSettings: { findMany: async () => state.notificationSettings },
    planSettings: {
      findMany: async () => state.planSettings,
      findUnique: async ({ where }: { where: Row }) =>
        state.planSettings.find((r) => r.userId === where.userId) ?? null,
      createMany: async ({ data }: { data: Row[] }) => {
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
  dayPlanEnabled: async () => state.flagOn,
}));

const deliver = jest.fn();
jest.mock("@/services/reminders/reminder-delivery", () => ({
  deliverPush: (...args: unknown[]) => deliver(...args),
}));
jest.mock("@/services/push/targets", () => ({
  PUSH_TARGET_SELECT: {},
  pushConfigured: () => true,
  pushTargetsOf: () => [],
  loadPushTargets: async () => [{ id: "device-1", endpoint: "e" }],
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
  state.users = [{ id: "u1" }];
  state.flagOn = true;
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
  // Not yet 08:00 and past the 5-minute window: nothing.
  await runDayPlanTouchSweep(new Date("2026-11-19T06:59:00Z"));
  await runDayPlanTouchSweep(new Date("2026-11-19T07:05:00Z"));
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
