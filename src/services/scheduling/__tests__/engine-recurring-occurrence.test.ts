import {
  EnergyProfile,
  SchedulableTask,
  SchedulingPreferences,
  scheduleTasks,
} from "../engine";

/**
 * A recurring master carries its current occurrence in its due date. The
 * planner must not place it before that day: a weekly-Sunday task that was
 * just completed on a Thursday appears on Sunday, not again today.
 */

const prefs: SchedulingPreferences = {
  workHours: Object.fromEntries(
    [0, 1, 2, 3, 4, 5, 6].map((d) => [
      String(d),
      { start: "09:00", end: "17:00" },
    ])
  ),
  bufferMinutes: 0,
  maxDeepWorkPerDay: 240,
  minBreakMinutes: 0,
  autoRescheduleOnMiss: true,
  enableBodyDoubling: false,
  enableTaskBatching: false,
  hardStopTime: "17:00",
  bufferMultiplier: 1,
  timeZone: "Europe/Zurich",
};
const energyProfile: EnergyProfile = { windows: [] };

function task(over: Partial<SchedulableTask>): SchedulableTask {
  return {
    id: "t",
    title: "German mini-test",
    assigneeId: "u",
    status: "todo",
    createdAt: new Date("2026-10-01T08:00:00.000Z"),
    estimatedMinutes: 30,
    priority: "MEDIUM",
    energyRequired: "MEDIUM",
    ...over,
  };
}

// Thursday 29 Oct 2026, 10:00 Zurich.
const now = new Date("2026-10-29T09:00:00.000Z");
const sunday = new Date("2026-11-01T00:00:00.000Z");
const sundayStart = new Date("2026-10-31T23:00:00.000Z");
const sundayEnd = new Date("2026-11-01T23:00:00.000Z");

const run = (tasks: SchedulableTask[]) =>
  scheduleTasks({ tasks, busyBlocks: [], energyProfile, prefs, now });

describe("recurring master is not placed before its occurrence", () => {
  it("waits for the occurrence day", () => {
    const result = run([
      task({
        isRecurring: true,
        recurrenceRule: "FREQ=WEEKLY;BYDAY=SU",
        deadline: sunday,
      }),
    ]);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].start >= sundayStart).toBe(true);
    expect(result.blocks[0].end <= sundayEnd).toBe(true);
    expect(result.atRisk ?? []).toEqual([]);
  });

  it("an occurrence that is today or overdue is still placed from now", () => {
    const result = run([
      task({
        isRecurring: true,
        recurrenceRule: "FREQ=DAILY",
        deadline: new Date("2026-10-29T00:00:00.000Z"),
      }),
    ]);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].start >= now).toBe(true);
  });

  it("a plain task with the same due date is unchanged", () => {
    const result = run([task({ deadline: sunday })]);
    expect(result.blocks[0].start < sundayStart).toBe(true);
  });
});
