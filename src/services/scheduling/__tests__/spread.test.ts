import {
  SPREAD_DEFAULT_MINUTES,
  dayInZone,
  spreadAcrossDays,
  spreadMinutes,
  spreadOrder,
  taskDayInZone,
} from "../spread";
import { freeWorkingMinutes, loadSpreadDays } from "../spread-capacity";

const findEvents = jest.fn();
const findTasks = jest.fn();
const personal = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    autoScheduleSettings: {
      findUnique: jest.fn(async () => ({ excludedCalendars: "[]" })),
    },
    calendarEvent: { findMany: (...args: unknown[]) => findEvents(...args) },
    task: { findMany: (...args: unknown[]) => findTasks(...args) },
  },
}));
jest.mock("@/services/scheduling/busy-feeds", () => ({
  ...jest.requireActual("@/services/scheduling/busy-feeds"),
  resolveBusyFeedIds: jest.fn(async () => ["feed-1"]),
  pushedBlockExternalIds: jest.fn(async () => new Set(["pushed-1"])),
}));
jest.mock("@/services/personal-time/service", () => ({
  personalBusyBlocks: (...args: unknown[]) => personal(...args),
}));
// Monday to Friday 09:00–17:00, the weekend off.
jest.mock("@/lib/work-week-server", () => ({
  loadWeekHours: jest.fn(async () =>
    [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      day,
      on: day >= 1 && day <= 5,
      ranges: [{ start: "09:00", end: "17:00" }],
    }))
  ),
}));

const at = (iso: string) => new Date(iso);

describe("spreadAcrossDays", () => {
  const days = [
    { date: "2026-10-23", free: 30 },
    { date: "2026-10-24", free: 0 },
    { date: "2026-10-26", free: 90 },
    { date: "2026-10-27", free: 480 },
  ];

  it("gives each task the first day with room, in the order given", () => {
    const r = spreadAcrossDays(
      [
        { id: "a", minutes: 30 },
        { id: "b", minutes: 60 },
        { id: "c", minutes: 60 },
        { id: "d", minutes: 30 },
      ],
      days
    );
    expect(r.placed).toEqual([
      { id: "a", date: "2026-10-23" },
      { id: "b", date: "2026-10-26" },
      { id: "c", date: "2026-10-27" },
      { id: "d", date: "2026-10-26" },
    ]);
    expect(r.unplaced).toEqual([]);
  });

  it("leaves a task that fits on no day where it is", () => {
    const r = spreadAcrossDays([{ id: "big", minutes: 600 }], days);
    expect(r.placed).toEqual([]);
    expect(r.unplaced).toEqual(["big"]);
  });

  it("an overbooked day (negative room) takes nothing", () => {
    const r = spreadAcrossDays(
      [{ id: "a", minutes: 5 }],
      [
        { date: "2026-10-23", free: -840 },
        { date: "2026-10-24", free: 60 },
      ]
    );
    expect(r.placed).toEqual([{ id: "a", date: "2026-10-24" }]);
  });

  it("does not change the days it was given", () => {
    const input = [{ date: "2026-10-23", free: 60 }];
    spreadAcrossDays([{ id: "a", minutes: 60 }], input);
    expect(input[0].free).toBe(60);
  });
});

describe("spreadOrder and spreadMinutes", () => {
  it("takes higher priority first, then the earlier due day, then the order given", () => {
    const tasks = [
      { id: "low", priorityLevel: "LOW", dueDate: at("2026-10-01T00:00Z") },
      { id: "m2", priorityLevel: "MEDIUM", dueDate: null },
      { id: "m1", priorityLevel: "MEDIUM", dueDate: at("2026-10-20T00:00Z") },
      { id: "urgent", priorityLevel: "URGENT", dueDate: null },
      { id: "m3", priorityLevel: "MEDIUM", dueDate: null },
    ];
    expect(spreadOrder(tasks).map((t) => t.id)).toEqual([
      "urgent",
      "m1",
      "m2",
      "m3",
      "low",
    ]);
  });

  it("an unestimated task takes the scheduler's default", () => {
    expect(spreadMinutes({ estimatedMinutes: 45 })).toBe(45);
    expect(spreadMinutes({ estimatedMinutes: null, duration: 20 })).toBe(20);
    expect(spreadMinutes({})).toBe(SPREAD_DEFAULT_MINUTES);
  });
});

describe("taskDayInZone", () => {
  const tz = "Europe/Berlin";
  const today = "2026-10-23";

  it("reads a bare date as that date, anything else in the zone", () => {
    expect(dayInZone(at("2026-10-23T00:00:00.000Z"), tz)).toBe("2026-10-23");
    // Midnight Berlin (CEST) is 22:00Z the day before.
    expect(dayInZone(at("2026-10-22T22:00:00.000Z"), tz)).toBe("2026-10-23");
    expect(dayInZone(null, tz)).toBeNull();
  });

  it("follows the one rule: due today or before wins, then a day ahead it is placed on", () => {
    const due = (d: string | null, s: string | null = null) =>
      taskDayInZone(
        { dueDate: d ? at(d) : null, scheduledStart: s ? at(s) : null },
        today,
        tz
      );
    expect(due("2026-10-20T00:00:00.000Z", "2026-10-26T08:00:00Z")).toBe(
      "2026-10-20"
    );
    expect(due("2026-10-22T22:00:00.000Z", "2026-10-26T08:00:00Z")).toBe(today);
    expect(due(null, "2026-10-26T08:00:00Z")).toBe("2026-10-26");
    expect(due("2026-10-29T00:00:00.000Z", "2026-10-20T08:00:00Z")).toBe(
      "2026-10-29"
    );
    expect(due(null, "2026-10-20T08:00:00Z")).toBeNull();
  });
});

describe("freeWorkingMinutes", () => {
  const window = {
    start: at("2026-10-23T07:00:00Z"),
    end: at("2026-10-23T15:00:00Z"),
  };

  it("counts the working time from now on, less what is busy", () => {
    const busy = [
      { start: at("2026-10-23T13:30:00Z"), end: at("2026-10-23T14:00:00Z") },
      // overlaps the first, counted once
      { start: at("2026-10-23T13:45:00Z"), end: at("2026-10-23T14:15:00Z") },
      // before now: takes nothing
      { start: at("2026-10-23T08:00:00Z"), end: at("2026-10-23T09:00:00Z") },
    ];
    expect(freeWorkingMinutes([window], busy, at("2026-10-23T13:00:00Z"))).toBe(
      120 - 45
    );
  });

  it("a window that has ended gives nothing", () => {
    expect(freeWorkingMinutes([window], [], at("2026-10-23T16:00:00Z"))).toBe(
      0
    );
  });
});

describe("loadSpreadDays", () => {
  beforeEach(() => {
    findEvents.mockReset();
    findTasks.mockReset();
    personal.mockReset();
  });

  it("gives each day its own hours less events, personal time and what is already on it", async () => {
    // Friday 23 October, 15:00 in Berlin (13:00Z, CEST).
    findEvents.mockResolvedValue([
      {
        start: at("2026-10-23T13:30:00Z"),
        end: at("2026-10-23T14:00:00Z"),
        externalEventId: null,
      },
      // the echo of a pushed task block is the task, not busy time
      {
        start: at("2026-10-27T08:00:00Z"),
        end: at("2026-10-27T16:00:00Z"),
        externalEventId: "pushed-1",
      },
    ]);
    // Lunch on Monday 12:00–13:00 Berlin (CET after the switch).
    personal.mockResolvedValue([
      {
        start: at("2026-10-26T11:00:00Z"),
        end: at("2026-10-26T12:00:00Z"),
      },
    ]);
    findTasks.mockResolvedValue([
      // due today, 60 min
      {
        dueDate: at("2026-10-22T22:00:00Z"),
        scheduledStart: null,
        estimatedMinutes: 60,
        duration: null,
      },
      // due Monday, 2 h
      {
        dueDate: at("2026-10-25T23:00:00Z"),
        scheduledStart: null,
        estimatedMinutes: 120,
        duration: null,
      },
    ]);

    const days = await loadSpreadDays({
      userId: "user-1",
      workspace: { dataScope: { mode: "personal" } } as never,
      timeZone: "Europe/Berlin",
      today: "2026-10-23",
      days: 5,
      now: at("2026-10-23T13:00:00Z"),
      exclude: new Set(["moving"]),
    });

    expect(days).toEqual([
      // 15:00–17:00 left, less the 30 min event, less the 60 min task
      { date: "2026-10-23", free: 30 },
      { date: "2026-10-24", free: 0 },
      // the night the clocks change still reads as one Sunday
      { date: "2026-10-25", free: 0 },
      // eight hours, less lunch, less the 2 h task due that day
      { date: "2026-10-26", free: 480 - 60 - 120 },
      { date: "2026-10-27", free: 480 },
    ]);
    expect(findTasks.mock.calls[0][0].where).toMatchObject({
      id: { notIn: ["moving"] },
      noSlot: false,
      status: { not: "completed" },
    });
  });
});
