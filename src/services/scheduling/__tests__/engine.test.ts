import {
  CalendarBusyBlock,
  EnergyProfile,
  SchedulableTask,
  SchedulingPreferences,
  scheduleTasks,
} from "../engine";

const mondayMorning = new Date(2026, 6, 6, 8, 0, 0);

const prefs: SchedulingPreferences = {
  workHours: {
    "1": { start: "09:00", end: "17:00" },
  },
  bufferMinutes: 0,
  maxDeepWorkPerDay: 240,
  minBreakMinutes: 0,
  autoRescheduleOnMiss: true,
  enableBodyDoubling: false,
  enableTaskBatching: true,
  hardStopTime: "17:00",
  bufferMultiplier: 1,
};

const energyProfile: EnergyProfile = {
  windows: [
    {
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "12:00",
      energyLevel: "HIGH",
    },
    {
      dayOfWeek: 1,
      startTime: "13:00",
      endTime: "17:00",
      energyLevel: "LOW",
    },
  ],
};

function task(overrides: Partial<SchedulableTask>): SchedulableTask {
  return {
    id: "task",
    title: "Task",
    assigneeId: "user-1",
    status: "todo",
    createdAt: new Date("2026-07-01T08:00:00.000Z"),
    estimatedMinutes: 60,
    priority: "MEDIUM",
    energyRequired: "MEDIUM",
    ...overrides,
  };
}

function busy(overrides: Partial<CalendarBusyBlock>): CalendarBusyBlock {
  return {
    id: "busy",
    title: "Busy",
    start: new Date(2026, 6, 6, 9, 0, 0),
    end: new Date(2026, 6, 6, 10, 0, 0),
    source: "calendar",
    ...overrides,
  };
}

describe("scheduleTasks", () => {
  it("reports NO_ASSIGNEE without placing an unassigned task", () => {
    const result = scheduleTasks({
      tasks: [task({ id: "unassigned", assigneeId: null })],
      busyBlocks: [],
      energyProfile,
      prefs,
      now: mondayMorning,
    });

    expect(result.blocks).toHaveLength(0);
    expect(result.unscheduled).toEqual([
      expect.objectContaining({
        taskId: "unassigned",
        reason: "NO_ASSIGNEE",
      }),
    ]);
  });

  it("uses the documented scheduling hierarchy", () => {
    const result = scheduleTasks({
      tasks: [
        task({
          id: "low-hard",
          title: "Low hard",
          priority: "LOW",
          hardDeadline: true,
          deadline: new Date(2026, 6, 8, 17, 0, 0),
        }),
        task({
          id: "high-soft",
          title: "High soft",
          priority: "HIGH",
          deadline: new Date(2026, 6, 7, 17, 0, 0),
        }),
        task({ id: "urgent", title: "Urgent", priority: "URGENT" }),
        task({ id: "high-none", title: "High none", priority: "HIGH" }),
      ],
      busyBlocks: [],
      energyProfile,
      prefs,
      now: mondayMorning,
    });

    expect(result.blocks.map((block) => block.taskId)).toEqual([
      "urgent",
      "low-hard",
      "high-soft",
      "high-none",
    ]);
  });

  it("uses duration, availability, recurrence, and id as stable tie-breakers", () => {
    const result = scheduleTasks({
      tasks: [
        task({ id: "same-b", title: "Same", estimatedMinutes: 30 }),
        task({
          id: "later",
          title: "Same",
          estimatedMinutes: 20,
          availableFrom: new Date(2026, 6, 6, 10, 0, 0),
        }),
        task({
          id: "recurring",
          title: "Same",
          estimatedMinutes: 20,
          isRecurring: true,
        }),
        task({ id: "same-a", title: "Same", estimatedMinutes: 30 }),
        task({ id: "short", title: "Same", estimatedMinutes: 20 }),
      ],
      busyBlocks: [],
      energyProfile,
      prefs,
      now: mondayMorning,
    });

    expect(result.blocks.map((block) => block.taskId)).toEqual([
      "recurring",
      "short",
      "later",
      "same-a",
      "same-b",
    ]);
  });

  it("orders nearer deadlines before later deadlines", () => {
    const result = scheduleTasks({
      tasks: [
        task({
          id: "later",
          title: "Later",
          deadline: new Date("2026-07-20T17:00:00.000Z"),
        }),
        task({
          id: "soon",
          title: "Soon",
          deadline: new Date("2026-07-07T17:00:00.000Z"),
        }),
      ],
      busyBlocks: [],
      energyProfile,
      prefs,
      now: mondayMorning,
    });

    expect(result.blocks.map((block) => block.taskId)).toEqual([
      "soon",
      "later",
    ]);
  });

  it("places dependency blockers before dependent tasks", () => {
    const result = scheduleTasks({
      tasks: [
        task({
          id: "dependent",
          title: "Dependent",
          priority: "URGENT",
          dependsOnId: "blocker",
        }),
        task({
          id: "blocker",
          title: "Blocker",
          priority: "LOW",
        }),
      ],
      busyBlocks: [],
      energyProfile,
      prefs,
      now: mondayMorning,
    });

    const blocker = result.blocks.find((block) => block.taskId === "blocker");
    const dependent = result.blocks.find(
      (block) => block.taskId === "dependent"
    );

    expect(blocker).toBeDefined();
    expect(dependent).toBeDefined();
    expect(blocker!.end <= dependent!.start).toBe(true);
  });

  it("requires every blocker in a multi-task dependency chain", () => {
    const result = scheduleTasks({
      tasks: [
        task({
          id: "dependent",
          title: "Dependent",
          priority: "URGENT",
          dependencyIds: ["blocker-a", "blocker-b"],
        }),
        task({ id: "blocker-a", title: "Blocker A", priority: "LOW" }),
        task({ id: "blocker-b", title: "Blocker B", priority: "LOW" }),
      ],
      busyBlocks: [],
      energyProfile,
      prefs,
      now: mondayMorning,
    });
    const dependent = result.blocks.find(
      (block) => block.taskId === "dependent"
    )!;
    const blockers = result.blocks.filter((block) =>
      ["blocker-a", "blocker-b"].includes(block.taskId)
    );
    expect(blockers).toHaveLength(2);
    expect(blockers.every((block) => block.end <= dependent.start)).toBe(true);
  });

  it("reports DEPENDENCY_BLOCKED when an unfinished blocker is unavailable", () => {
    const result = scheduleTasks({
      tasks: [
        task({
          id: "dependent",
          title: "Dependent",
          dependencyIds: ["external-blocker"],
        }),
      ],
      busyBlocks: [],
      energyProfile,
      prefs,
      now: mondayMorning,
    });
    expect(result.blocks).toHaveLength(0);
    expect(result.unscheduled).toEqual([
      expect.objectContaining({
        taskId: "dependent",
        reason: "DEPENDENCY_BLOCKED",
      }),
    ]);
  });

  it("prefers high-energy windows for high-focus tasks", () => {
    const result = scheduleTasks({
      tasks: [
        task({
          id: "deep-work",
          title: "Deep Work",
          energyRequired: "HIGH",
        }),
      ],
      busyBlocks: [],
      energyProfile,
      prefs,
      now: mondayMorning,
    });

    expect(result.blocks[0].start.getHours()).toBe(9);
  });

  it("avoids calendar busy blocks", () => {
    const result = scheduleTasks({
      tasks: [task({ id: "write", title: "Write" })],
      busyBlocks: [busy({})],
      energyProfile,
      prefs,
      now: mondayMorning,
    });

    expect(result.blocks[0].start.getHours()).toBe(10);
  });

  it("does not place a task before its available start", () => {
    const availableFrom = new Date(2026, 6, 6, 13, 0, 0);
    const result = scheduleTasks({
      tasks: [task({ id: "later", availableFrom })],
      busyBlocks: [],
      energyProfile,
      prefs,
      now: mondayMorning,
    });

    expect(result.blocks[0].start.getTime()).toBeGreaterThanOrEqual(
      availableFrom.getTime()
    );
  });

  it("reports an earliest start beyond the planning horizon", () => {
    const result = scheduleTasks({
      tasks: [
        task({
          id: "future",
          availableFrom: new Date(2026, 7, 1, 9, 0, 0),
        }),
      ],
      busyBlocks: [],
      energyProfile,
      prefs,
      now: mondayMorning,
    });

    expect(result.blocks).toHaveLength(0);
    expect(result.unscheduled).toEqual([
      expect.objectContaining({
        taskId: "future",
        reason: "BEFORE_EARLIEST_START",
      }),
    ]);
  });

  it("reports an earliest start at or after a hard deadline", () => {
    const boundary = new Date(2026, 6, 6, 13, 0, 0);
    const result = scheduleTasks({
      tasks: [
        task({
          id: "not-actionable-in-time",
          availableFrom: boundary,
          deadline: boundary,
          hardDeadline: true,
        }),
      ],
      busyBlocks: [],
      energyProfile,
      prefs,
      now: mondayMorning,
    });

    expect(result.blocks).toHaveLength(0);
    expect(result.unscheduled).toEqual([
      expect.objectContaining({
        taskId: "not-actionable-in-time",
        reason: "DEADLINE_IMPOSSIBLE",
      }),
    ]);
  });

  it("reports a hard deadline that cannot contain the task duration", () => {
    const result = scheduleTasks({
      tasks: [
        task({
          id: "too-long",
          estimatedMinutes: 120,
          deadline: new Date(2026, 6, 6, 9, 0, 0),
          hardDeadline: true,
        }),
      ],
      busyBlocks: [],
      energyProfile,
      prefs,
      now: mondayMorning,
    });

    expect(result.unscheduled[0]?.reason).toBe("DEADLINE_IMPOSSIBLE");
  });

  it("reports when energy limits prevent an otherwise valid slot", () => {
    const result = scheduleTasks({
      tasks: [task({ id: "energy-limited", energyRequired: "HIGH" })],
      busyBlocks: [],
      energyProfile,
      prefs: { ...prefs, maxDeepWorkPerDay: 0 },
      now: mondayMorning,
    });

    expect(result.unscheduled[0]?.reason).toBe("ENERGY_WINDOW_UNAVAILABLE");
  });

  it("allows a soft deadline to fall back to the nearest later slot", () => {
    const result = scheduleTasks({
      tasks: [
        task({
          id: "soft-deadline",
          deadline: new Date(2026, 6, 6, 9, 30, 0),
        }),
      ],
      busyBlocks: [busy({})],
      energyProfile,
      prefs,
      now: mondayMorning,
    });

    expect(result.unscheduled).toHaveLength(0);
    expect(result.blocks[0].start.getHours()).toBe(10);
  });

  it("rejects placement after a hard deadline", () => {
    const result = scheduleTasks({
      tasks: [
        task({
          id: "hard-deadline",
          deadline: new Date(2026, 6, 6, 9, 30, 0),
          hardDeadline: true,
        }),
      ],
      busyBlocks: [
        busy({
          start: new Date(2026, 6, 6, 8, 0, 0),
          end: new Date(2026, 6, 6, 9, 30, 0),
        }),
      ],
      energyProfile,
      prefs,
      now: mondayMorning,
    });

    expect(result.blocks).toHaveLength(0);
    expect(result.unscheduled).toEqual([
      expect.objectContaining({
        taskId: "hard-deadline",
        reason: "HARD_DEADLINE_MISSED",
      }),
    ]);
  });

  it("does not place a hard deadline outside the Work Schedule", () => {
    const result = scheduleTasks({
      tasks: [
        task({
          id: "hard-overflow",
          hardDeadline: true,
          deadline: new Date(2026, 6, 6, 11, 0, 0),
        }),
      ],
      busyBlocks: [
        busy({
          start: new Date(2026, 6, 6, 8, 0, 0),
          end: new Date(2026, 6, 6, 10, 0, 0),
        }),
      ],
      energyProfile,
      prefs: {
        ...prefs,
        workHours: { "1": { start: "09:00", end: "10:00" } },
      },
      now: mondayMorning,
    });

    expect(result.blocks).toHaveLength(0);
    expect(result.unscheduled).toEqual([
      expect.objectContaining({
        taskId: "hard-overflow",
        reason: "HARD_DEADLINE_MISSED",
      }),
    ]);
  });

  it("still places a hard deadline inside work hours past the deep-work cap", () => {
    const result = scheduleTasks({
      tasks: [
        task({
          id: "hard-deep",
          estimatedMinutes: 60,
          energyRequired: "HIGH",
          hardDeadline: true,
          deadline: new Date(2026, 6, 6, 12, 0, 0),
        }),
      ],
      busyBlocks: [],
      energyProfile,
      prefs: { ...prefs, maxDeepWorkPerDay: 0 },
      now: mondayMorning,
    });

    expect(result.unscheduled).toHaveLength(0);
    expect(result.blocks).toHaveLength(1);
  });

  it("leaves a hard deadline unplaced instead of using the evening or night", () => {
    // Monday's work hours are full and the deadline is Tuesday before work
    // starts, so the only free minutes are outside work hours.
    const result = scheduleTasks({
      tasks: [
        task({
          id: "hard-night",
          estimatedMinutes: 60,
          hardDeadline: true,
          deadline: new Date(2026, 6, 7, 8, 0, 0),
        }),
      ],
      busyBlocks: [
        busy({
          start: new Date(2026, 6, 6, 8, 0, 0),
          end: new Date(2026, 6, 6, 23, 59, 0),
        }),
      ],
      energyProfile,
      prefs: { ...prefs, hardStopTime: "22:00" },
      now: mondayMorning,
    });

    expect(result.blocks).toHaveLength(0);
    expect(result.unscheduled).toEqual([
      expect.objectContaining({ reason: "HARD_DEADLINE_MISSED" }),
    ]);
  });

  it("does not use overflow time for a soft deadline", () => {
    const result = scheduleTasks({
      tasks: [
        task({
          id: "soft-no-overflow",
          deadline: new Date(2026, 6, 6, 11, 0, 0),
        }),
      ],
      busyBlocks: [
        busy({
          start: new Date(2026, 6, 6, 9, 0, 0),
          end: new Date(2026, 6, 6, 10, 0, 0),
        }),
      ],
      energyProfile,
      prefs: {
        ...prefs,
        workHours: { "1": { start: "09:00", end: "10:00" } },
      },
      now: mondayMorning,
    });

    expect(result.blocks[0].start).toEqual(new Date(2026, 6, 13, 9, 0, 0));
  });

  it("reports an explicit non-positive duration", () => {
    const result = scheduleTasks({
      tasks: [task({ id: "no-duration", estimatedMinutes: 0 })],
      busyBlocks: [],
      energyProfile,
      prefs,
      now: mondayMorning,
    });

    expect(result.unscheduled).toEqual([
      expect.objectContaining({
        taskId: "no-duration",
        reason: "NO_DURATION",
      }),
    ]);
  });

  it("splits large tasks into bounded chunks", () => {
    const result = scheduleTasks({
      tasks: [
        task({
          id: "big",
          title: "Big",
          estimatedMinutes: 120,
          minChunkMinutes: 30,
          maxChunkMinutes: 45,
        }),
      ],
      busyBlocks: [],
      energyProfile,
      prefs,
      now: mondayMorning,
    });

    expect(result.blocks).toHaveLength(3);
    expect(
      result.blocks.map(
        (block) => (block.end.getTime() - block.start.getTime()) / 60_000
      )
    ).toEqual([45, 45, 30]);
  });

  it("reports overcommitment when tasks do not fit", () => {
    const result = scheduleTasks({
      tasks: [
        task({ id: "one", title: "One", estimatedMinutes: 60 }),
        task({ id: "two", title: "Two", estimatedMinutes: 60 }),
      ],
      busyBlocks: [
        busy({
          id: "future-1",
          start: new Date(2026, 6, 13, 9, 0, 0),
          end: new Date(2026, 6, 13, 10, 0, 0),
        }),
        busy({
          id: "future-2",
          start: new Date(2026, 6, 20, 9, 0, 0),
          end: new Date(2026, 6, 20, 10, 0, 0),
        }),
      ],
      energyProfile,
      prefs: {
        ...prefs,
        workHours: { "1": { start: "09:00", end: "10:00" } },
      },
      now: mondayMorning,
    });

    expect(result.blocks).toHaveLength(1);
    expect(result.unscheduled).toEqual([
      {
        taskId: "two",
        title: "Two",
        reason: "NO_WORKING_TIME",
      },
    ]);
  });

  it("keeps frozen blocks untouched and schedules around them", () => {
    const result = scheduleTasks({
      tasks: [
        task({
          id: "frozen",
          title: "Frozen",
          isFrozen: true,
          scheduledStart: new Date(2026, 6, 6, 9, 0, 0),
          scheduledEnd: new Date(2026, 6, 6, 10, 0, 0),
        }),
        task({ id: "next", title: "Next" }),
      ],
      busyBlocks: [],
      energyProfile,
      prefs,
      now: mondayMorning,
    });

    expect(result.frozenBlocks[0].start.getHours()).toBe(9);
    expect(result.blocks[0].start.getHours()).toBe(10);
  });

  it("uses each task's selected saved schedule", () => {
    const result = scheduleTasks({
      tasks: [
        task({
          id: "late-task",
          title: "Late task",
          scheduleId: "evenings",
          estimatedMinutes: 30,
        }),
      ],
      busyBlocks: [],
      energyProfile,
      prefs: {
        ...prefs,
        defaultScheduleId: "work",
        workHoursBySchedule: {
          work: { "1": [{ start: "09:00", end: "12:00" }] },
          evenings: { "1": [{ start: "15:00", end: "17:00" }] },
        },
      },
      now: mondayMorning,
    });

    expect(result.blocks[0].start.getHours()).toBe(15);
  });

  it("keeps the selected schedule for recurring tasks", () => {
    const result = scheduleTasks({
      tasks: [
        task({
          id: "recurring-evening",
          title: "Recurring evening task",
          scheduleId: "evenings",
          isRecurring: true,
          recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
          estimatedMinutes: 30,
        }),
      ],
      busyBlocks: [],
      energyProfile,
      prefs: {
        ...prefs,
        defaultScheduleId: "work",
        workHoursBySchedule: {
          work: { "1": [{ start: "09:00", end: "12:00" }] },
          evenings: { "1": [{ start: "15:00", end: "17:00" }] },
        },
      },
      now: mondayMorning,
    });

    expect(result.blocks[0]).toMatchObject({
      taskId: "recurring-evening",
    });
    expect(result.blocks[0].start.getHours()).toBe(15);
  });

  it("supports multiple intervals on the same day", () => {
    const result = scheduleTasks({
      tasks: [
        task({
          id: "afternoon",
          title: "Afternoon",
          estimatedMinutes: 60,
          energyRequired: "LOW",
        }),
      ],
      busyBlocks: [
        busy({
          start: new Date(2026, 6, 6, 9, 0, 0),
          end: new Date(2026, 6, 6, 12, 0, 0),
        }),
      ],
      energyProfile,
      prefs: {
        ...prefs,
        workHours: {
          "1": [
            { start: "09:00", end: "12:00" },
            { start: "13:30", end: "17:00" },
          ],
        },
      },
      now: mondayMorning,
    });

    expect(result.blocks[0].start.getHours()).toBe(13);
    expect(result.blocks[0].start.getMinutes()).toBe(30);
  });

  it("intersects one-off flexible-hours blocks with regular schedules", () => {
    const result = scheduleTasks({
      tasks: [
        task({
          id: "after-block",
          title: "After block",
          estimatedMinutes: 30,
        }),
      ],
      busyBlocks: [],
      energyProfile,
      prefs: {
        ...prefs,
        flexibleHoursOverrides: [
          {
            date: "2026-07-06",
            kind: "BLOCK_HOURS",
            startTime: "09:00",
            endTime: "11:15",
          },
        ],
      },
      now: mondayMorning,
    });

    expect(result.blocks[0].start.getHours()).toBe(11);
    expect(result.blocks[0].start.getMinutes()).toBe(15);
  });

  it("moves work to the next valid day after a whole-day override", () => {
    const result = scheduleTasks({
      tasks: [task({ id: "tomorrow", title: "Tomorrow" })],
      busyBlocks: [],
      energyProfile,
      prefs: {
        ...prefs,
        workHours: {
          "1": { start: "09:00", end: "17:00" },
          "2": { start: "09:00", end: "17:00" },
        },
        flexibleHoursOverrides: [
          { date: "2026-07-06", kind: "BLOCK_WHOLE_DAY" },
        ],
      },
      now: mondayMorning,
    });

    expect(result.blocks[0].start.getDay()).toBe(2);
    expect(result.blocks[0].start.getHours()).toBe(9);
  });
});

describe("learned duration ratio (Let Needt learn about me)", () => {
  const blockMinutes = (
    learnedDurationRatio: number | undefined,
    over: Partial<SchedulableTask> = {},
    calibrationFactors?: Record<string, number>
  ) => {
    const result = scheduleTasks({
      tasks: [task({ id: "t", estimatedMinutes: 60, ...over })],
      busyBlocks: [],
      energyProfile,
      prefs: { ...prefs, learnedDurationRatio, calibrationFactors },
      now: mondayMorning,
    });
    return result.blocks.reduce(
      (sum, b) => sum + (b.end.getTime() - b.start.getTime()) / 60_000,
      0
    );
  };

  it("leaves estimates alone when nothing was learned", () => {
    expect(blockMinutes(undefined)).toBe(60);
  });

  it("lengthens and shortens blocks by the ratio, in 5-minute steps", () => {
    expect(blockMinutes(1.5)).toBe(90);
    expect(blockMinutes(0.5)).toBe(30);
    expect(blockMinutes(1.4, { estimatedMinutes: 25 })).toBe(35);
  });

  it("does not stack on a context's own calibration", () => {
    expect(blockMinutes(2, { contextTag: "deep" }, { deep: 1.2 })).toBe(60);
  });
});
