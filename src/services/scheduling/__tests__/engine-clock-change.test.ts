import {
  CalendarBusyBlock,
  SchedulableTask,
  SchedulingPreferences,
  scheduleTasks,
} from "../engine";

/**
 * The engine walks the process's local days, so each case sets TZ first.
 * Regression: stepping a day by adding 24 * 60 minutes from local midnight
 * lands on 23:00 the same day on a 25-hour day, so the day loop never advanced
 * and the scheduler hung.
 */
const everyDay = Object.fromEntries(
  [0, 1, 2, 3, 4, 5, 6].map((d) => [
    String(d),
    { start: "09:00", end: "17:00" },
  ])
);

const prefs: SchedulingPreferences = {
  workHours: everyDay,
  bufferMinutes: 0,
  maxDeepWorkPerDay: 600,
  minBreakMinutes: 0,
  autoRescheduleOnMiss: true,
  enableBodyDoubling: false,
  enableTaskBatching: false,
  hardStopTime: "17:00",
  bufferMultiplier: 1,
};

function task(overrides: Partial<SchedulableTask>): SchedulableTask {
  return {
    id: "task",
    title: "Task",
    assigneeId: "user-1",
    status: "todo",
    createdAt: new Date("2026-01-01T08:00:00.000Z"),
    estimatedMinutes: 60,
    priority: "MEDIUM",
    energyRequired: "MEDIUM",
    ...overrides,
  };
}

/** Busy for the whole working day on a local date. */
function busyDay(y: number, m: number, d: number): CalendarBusyBlock {
  return {
    id: `busy-${y}-${m}-${d}`,
    title: "Busy",
    start: new Date(y, m, d, 0, 0, 0),
    end: new Date(y, m, d + 1, 0, 0, 0),
    source: "calendar",
  };
}

const wall = (d: Date) => [
  d.getFullYear(),
  d.getMonth(),
  d.getDate(),
  d.getHours(),
  d.getMinutes(),
];

const originalTZ = process.env.TZ;
afterAll(() => {
  if (originalTZ === undefined) delete process.env.TZ;
  else process.env.TZ = originalTZ;
});

const cases = [
  {
    zone: "Europe/Zurich",
    label: "25-hour day, 25 Oct 2026",
    // Sat 24 Oct 18:00 -> change day is Sun 25 Oct
    now: [2026, 9, 24, 18, 0],
    change: [2026, 9, 25],
    next: [2026, 9, 26],
  },
  {
    zone: "Europe/Zurich",
    label: "23-hour day, 29 Mar 2026",
    now: [2026, 2, 28, 18, 0],
    change: [2026, 2, 29],
    next: [2026, 2, 30],
  },
  {
    zone: "America/New_York",
    label: "25-hour day, 1 Nov 2026",
    now: [2026, 9, 31, 18, 0],
    change: [2026, 10, 1],
    next: [2026, 10, 2],
  },
  {
    zone: "America/New_York",
    label: "23-hour day, 8 Mar 2026",
    now: [2026, 2, 7, 18, 0],
    change: [2026, 2, 8],
    next: [2026, 2, 9],
  },
] as const;

describe.each(cases)("clock change: $zone, $label", (c) => {
  beforeAll(() => {
    process.env.TZ = c.zone;
  });

  const nowOf = () =>
    new Date(c.now[0], c.now[1], c.now[2], c.now[3], c.now[4]);

  it("places a task on the clock-change day at wall-clock work hours", () => {
    const result = scheduleTasks({
      tasks: [task({ id: "a" })],
      busyBlocks: [],
      energyProfile: { windows: [] },
      prefs,
      now: nowOf(),
    });

    expect(result.blocks).toHaveLength(1);
    expect(wall(result.blocks[0].start)).toEqual([...c.change, 9, 0]);
    expect(wall(result.blocks[0].end)).toEqual([...c.change, 10, 0]);
  });

  it("crosses the clock-change day when it is full and lands on the next morning", () => {
    const result = scheduleTasks({
      tasks: [task({ id: "a" })],
      busyBlocks: [busyDay(c.change[0], c.change[1], c.change[2])],
      energyProfile: { windows: [] },
      prefs,
      now: nowOf(),
    });

    expect(result.unscheduled).toEqual([]);
    expect(wall(result.blocks[0].start)).toEqual([...c.next, 9, 0]);
  });

  it("terminates and keeps every block on wall-clock work hours with many tasks", () => {
    const tasks = Array.from({ length: 40 }, (_, i) =>
      task({ id: `t${String(i).padStart(2, "0")}`, estimatedMinutes: 120 })
    );
    const result = scheduleTasks({
      tasks,
      busyBlocks: [],
      energyProfile: { windows: [] },
      prefs,
      now: nowOf(),
    });

    // 4 two-hour tasks fit in one 09:00-17:00 day; 40 tasks need 10 days.
    expect(result.blocks).toHaveLength(40);
    expect(result.unscheduled).toEqual([]);
    const days = new Set<string>();
    for (const block of result.blocks) {
      expect(block.start.getHours()).toBeGreaterThanOrEqual(9);
      expect(
        block.end.getHours() * 60 + block.end.getMinutes()
      ).toBeLessThanOrEqual(17 * 60);
      expect(block.start.getDate()).toBe(block.end.getDate());
      days.add(`${block.start.getMonth()}-${block.start.getDate()}`);
    }
    expect(days.size).toBe(10);
    // Blocks never overlap.
    const sorted = [...result.blocks].sort(
      (a, b) => a.start.getTime() - b.start.getTime()
    );
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i].start.getTime()).toBeGreaterThanOrEqual(
        sorted[i - 1].end.getTime()
      );
    }
    // The clock-change day is used exactly once, in full.
    const onChangeDay = result.blocks.filter(
      (b) =>
        b.start.getMonth() === c.change[1] && b.start.getDate() === c.change[2]
    );
    expect(onChangeDay).toHaveLength(4);
  });

  it("the hard-deadline overflow path steps past the clock-change day", () => {
    const deadline = new Date(c.next[0], c.next[1], c.next[2], 12, 0);
    const result = scheduleTasks({
      tasks: [task({ id: "late", hardDeadline: true, deadline })],
      // No work hours at all, so the normal search finds nothing and the
      // overflow search runs. The change day is busy from 07:00 on.
      busyBlocks: [
        {
          id: "busy-change",
          title: "Busy",
          start: new Date(c.change[0], c.change[1], c.change[2], 7, 0),
          end: new Date(c.change[0], c.change[1], c.change[2], 23, 59),
          source: "calendar",
        },
      ],
      energyProfile: { windows: [] },
      prefs: { ...prefs, workHours: {} },
      now: nowOf(),
    });

    expect(result.unscheduled).toEqual([]);
    expect(wall(result.blocks[0].start)).toEqual([...c.next, 7, 0]);
  });
});
