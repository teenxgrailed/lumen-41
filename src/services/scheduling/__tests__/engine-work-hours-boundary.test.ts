import {
  EnergyProfile,
  SchedulableTask,
  SchedulingPreferences,
  scheduleTasks,
} from "../engine";

/**
 * The work day is a half-open window: a block may end exactly at the day's
 * end, but nothing starts at or after it. A task that started at the end of
 * the day (18:00 local in a 09:00-18:00 day) would sit outside work hours.
 */

const TZ = "Europe/Zurich";

const prefs: SchedulingPreferences = {
  workHours: {
    "1": { start: "09:00", end: "18:00" },
    "2": { start: "09:00", end: "18:00" },
  },
  bufferMinutes: 0,
  maxDeepWorkPerDay: 600,
  minBreakMinutes: 0,
  autoRescheduleOnMiss: true,
  enableBodyDoubling: false,
  enableTaskBatching: false,
  hardStopTime: "18:00",
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
    estimatedMinutes: 30,
    priority: "MEDIUM",
    energyRequired: "MEDIUM",
    ...over,
  };
}

// Monday 19 Oct 2026, 17:00 local (Zurich is UTC+2): 15:00Z.
const now = new Date("2026-10-19T15:00:00.000Z");
const dayEnd = new Date("2026-10-19T16:00:00.000Z"); // 18:00 local
const tuesdayUtc = new Date("2026-10-20T00:00:00.000Z");

describe("work-hours end boundary", () => {
  it("does not start a block at the end of the work day", () => {
    const result = scheduleTasks({
      tasks: [task({ id: "a" }), task({ id: "b" }), task({ id: "c" })],
      busyBlocks: [],
      energyProfile,
      prefs,
      now,
    });
    expect(result.blocks.length).toBe(3);
    for (const block of result.blocks) {
      // Either wholly inside Monday's window, or on a later day.
      const insideMonday = block.start < dayEnd && block.end <= dayEnd;
      expect(insideMonday || block.start >= tuesdayUtc).toBe(true);
    }
  });

  it("pushes a task that does not fit before 18:00 to the next day", () => {
    const result = scheduleTasks({
      tasks: [task({ id: "long", estimatedMinutes: 90 })],
      busyBlocks: [],
      energyProfile,
      prefs,
      now,
    });
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].start >= tuesdayUtc).toBe(true);
  });

  it("an event over the end of the day keeps the task out of it", () => {
    const result = scheduleTasks({
      tasks: [task({ id: "a" })],
      busyBlocks: [
        {
          id: "rest",
          title: "Busy",
          start: new Date("2026-10-19T15:00:00.000Z"),
          end: new Date("2026-10-19T21:30:00.000Z"),
          source: "calendar",
        },
      ],
      energyProfile,
      prefs,
      now,
    });
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].start >= tuesdayUtc).toBe(true);
  });
});
