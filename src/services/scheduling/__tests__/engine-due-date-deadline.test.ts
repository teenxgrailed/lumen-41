import {
  CalendarBusyBlock,
  EnergyProfile,
  SchedulableTask,
  SchedulingPreferences,
  scheduleTasks,
} from "../engine";

/**
 * A due date is a deadline the scheduler must beat, not a hint. A date-only due
 * date (stored as UTC midnight) means the whole due day in the person's zone.
 * When nothing fits before it, the earliest slot is still used and the task is
 * reported as at risk rather than silently placed later.
 */

const TZ = "Europe/Zurich";

const prefs: SchedulingPreferences = {
  workHours: Object.fromEntries(
    [1, 2, 3, 4, 5].map((d) => [String(d), { start: "09:00", end: "17:00" }])
  ),
  bufferMinutes: 0,
  maxDeepWorkPerDay: 120,
  minBreakMinutes: 0,
  autoRescheduleOnMiss: true,
  enableBodyDoubling: false,
  enableTaskBatching: false,
  hardStopTime: "17:00",
  bufferMultiplier: 1,
  timeZone: TZ,
};

const energyProfile: EnergyProfile = { windows: [] };

function task(over: Partial<SchedulableTask>): SchedulableTask {
  return {
    id: "t",
    title: "T",
    assigneeId: "u",
    status: "todo",
    createdAt: new Date("2026-10-01T08:00:00.000Z"),
    estimatedMinutes: 60,
    priority: "MEDIUM",
    energyRequired: "MEDIUM",
    ...over,
  };
}

// Wednesday 28 Oct 2026, 09:00 Zurich (UTC+1 after the clock change).
const now = new Date("2026-10-28T08:00:00.000Z");
// "30.10" as the app stores a date-only due date.
const dueFriday = new Date("2026-10-30T00:00:00.000Z");
// End of Friday 30 Oct in Zurich.
const endOfFriday = new Date("2026-10-30T23:00:00.000Z");
const monday = new Date("2026-11-01T23:00:00.000Z"); // Mon 2 Nov 00:00 local

function busyDay(id: string, startUtc: string, endUtc: string) {
  return {
    id,
    title: "Busy",
    start: new Date(startUtc),
    end: new Date(endUtc),
    source: "calendar",
  } as CalendarBusyBlock;
}

function run(tasks: SchedulableTask[], busyBlocks: CalendarBusyBlock[] = []) {
  return scheduleTasks({ tasks, busyBlocks, energyProfile, prefs, now });
}

describe("due date as a deadline", () => {
  it("keeps a HIGH-energy task before its due date when the daily deep-work cap would push it past it", () => {
    // Three URGENT deep-work tasks use the 120 min cap on Wed, Thu and Fri.
    const blockers = ["a", "b", "c"].map((id) =>
      task({
        id,
        priority: "URGENT",
        energyRequired: "HIGH",
        estimatedMinutes: 120,
      })
    );
    const target = task({
      id: "sample-budget",
      title: "Decide on sample budget",
      energyRequired: "HIGH",
      estimatedMinutes: 120,
      deadline: dueFriday,
    });

    const result = run([...blockers, target]);
    const placed = result.blocks.filter((b) => b.taskId === "sample-budget");

    expect(placed).toHaveLength(1);
    expect(placed[0].end <= endOfFriday).toBe(true);
    expect(result.atRisk ?? []).toEqual([]);
  });

  it("reads a date-only due date as the whole due day, not its UTC midnight", () => {
    // Everything is busy until 16:00 on Friday; only 16:00-17:00 is free.
    const busy = [
      busyDay("wed-thu-fri", "2026-10-28T08:00:00Z", "2026-10-30T15:00:00Z"),
    ];
    const result = run(
      [task({ id: "x", estimatedMinutes: 30, deadline: dueFriday })],
      busy
    );
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].start.toISOString()).toBe(
      "2026-10-30T15:00:00.000Z"
    );
    expect(result.atRisk ?? []).toEqual([]);
  });

  it("places a hard deadline on its due day when the deadline is date-only", () => {
    const busy = [
      busyDay("wed-thu-fri", "2026-10-28T08:00:00Z", "2026-10-30T15:00:00Z"),
    ];
    const result = run(
      [
        task({
          id: "h",
          estimatedMinutes: 30,
          deadline: dueFriday,
          hardDeadline: true,
        }),
      ],
      busy
    );
    expect(result.unscheduled).toEqual([]);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].end <= endOfFriday).toBe(true);
  });

  it("schedules the earliest slot and flags the task at risk when nothing fits before the due date", () => {
    // Wed to Fri are fully busy.
    const busy = [
      busyDay("wed-thu-fri", "2026-10-28T08:00:00Z", "2026-10-30T16:00:00Z"),
    ];
    const result = run(
      [
        task({
          id: "late",
          title: "Decide on sample budget",
          estimatedMinutes: 60,
          deadline: dueFriday,
        }),
      ],
      busy
    );

    expect(result.unscheduled).toEqual([]);
    expect(result.blocks).toHaveLength(1);
    // Monday 2 Nov 09:00 Zurich is the earliest work slot after the busy days.
    expect(result.blocks[0].start.toISOString()).toBe(
      "2026-11-02T08:00:00.000Z"
    );
    expect(result.blocks[0].start >= monday).toBe(true);
    expect(result.atRisk).toEqual([
      expect.objectContaining({
        taskId: "late",
        reason: "DEADLINE_AT_RISK",
      }),
    ]);
  });

  it("flags an overdue task at risk and still schedules it as early as possible", () => {
    const result = run([
      task({
        id: "overdue",
        deadline: new Date("2026-10-26T00:00:00.000Z"),
      }),
    ]);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].start.toISOString()).toBe(
      "2026-10-28T08:00:00.000Z"
    );
    expect(result.atRisk?.map((r) => r.taskId)).toEqual(["overdue"]);
  });
});
