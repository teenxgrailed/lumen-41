import {
  CalendarBusyBlock,
  PlacementTrace,
  SchedulableTask,
  SchedulingPreferences,
  scheduleTasks,
} from "../engine";
import { explainPlacement } from "../explain";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/services/scheduling/TaskSchedulingService", () => ({
  loadScheduleInput: jest.fn(),
}));
jest.mock("@/services/personal-time/service", () => ({
  personalBusyBlocks: jest.fn(),
}));
jest.mock("@/lib/work-week-server", () => ({ loadWeekHours: jest.fn() }));

const TZ = "Europe/Zurich";
// Monday 6 July 2026, 08:00 in Zurich.
const now = new Date("2026-07-06T06:00:00.000Z");
const at = (hhmm: string, day = "2026-07-06") => {
  // Zurich is UTC+2 in July.
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(
    `${day}T${String(h - 2).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`
  );
};

const prefs: SchedulingPreferences = {
  workHours: {
    "1": { start: "09:00", end: "17:00" },
    "2": { start: "09:00", end: "17:00" },
  },
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
    start: at("09:00"),
    end: at("10:00"),
    source: "calendar",
    ...overrides,
  };
}

function run(tasks: SchedulableTask[], busyBlocks: CalendarBusyBlock[] = []) {
  const input = {
    tasks,
    busyBlocks,
    energyProfile: { windows: [] },
    prefs,
    now,
  };
  const trace = new Map<string, PlacementTrace>();
  const result = scheduleTasks({ ...input, trace });
  return { input, trace, result };
}

describe("scheduleTasks trace", () => {
  it("places exactly the same blocks with and without a trace", () => {
    const tasks = [
      task({ id: "a", title: "A", priority: "HIGH" }),
      task({ id: "b", title: "B", deadline: at("12:00", "2026-07-07") }),
      task({ id: "c", title: "C", dependsOnId: "a", energyRequired: "HIGH" }),
      task({ id: "d", title: "D", estimatedMinutes: 200, maxChunkMinutes: 60 }),
    ];
    const busyBlocks = [
      busy({}),
      busy({ id: "p", start: at("13:00"), end: at("14:00") }),
    ];
    const plain = scheduleTasks({
      tasks,
      busyBlocks,
      energyProfile: { windows: [] },
      prefs,
      now,
    });
    const traced = run(tasks, busyBlocks).result;
    expect(traced).toEqual(plain);
  });

  it("records order, the dependency waited on and the pass", () => {
    const { trace } = run([
      task({ id: "first", title: "First", priority: "URGENT" }),
      task({ id: "next", title: "Next", dependsOnId: "first" }),
    ]);
    expect(trace.get("first")).toMatchObject({
      rank: 1,
      queueSize: 2,
      earliestReason: "now",
      pass: "work-hours",
    });
    expect(trace.get("next")).toMatchObject({
      rank: 2,
      earliestReason: "dependency",
      waitedOn: ["first"],
      placedBefore: ["first"],
    });
  });

  it("marks a task placed after its due date", () => {
    // The whole due day is busy, so the task goes to Tuesday: at risk.
    const { trace, result } = run(
      [task({ id: "late", deadline: new Date("2026-07-06T00:00:00.000Z") })],
      [busy({ start: at("09:00"), end: at("17:00") })]
    );
    expect(result.atRisk?.map((r) => r.taskId)).toEqual(["late"]);
    expect(trace.get("late")?.pass).toBe("after-deadline");
  });
});

describe("explainPlacement", () => {
  it("names what took the earlier work time", () => {
    const { input, trace, result } = run(
      [
        task({ id: "ahead", title: "Write brief", priority: "HIGH" }),
        task({ id: "me", title: "Review", priority: "LOW" }),
      ],
      [
        busy({ id: "m1", start: at("09:00"), end: at("10:00") }),
        busy({
          id: "personal:lunch:0",
          title: "Lunch",
          start: at("11:00"),
          end: at("12:00"),
        }),
      ]
    );
    const block = result.blocks.find((b) => b.taskId === "me")!;
    const why = explainPlacement({
      input,
      result,
      trace,
      taskId: "me",
      current: { start: block.start, end: block.end },
    });
    expect(why.status).toBe("placed");
    expect(why.upToDate).toBe(true);
    // 09:00 meeting, 10:00 the higher-priority task, 11:00 lunch → 12:00.
    expect(block.start.toISOString()).toBe(at("12:00").toISOString());
    expect(why.before).toMatchObject({
      workMinutes: 180,
      meetingMinutes: 60,
      personalMinutes: 60,
      tasksAheadMinutes: 60,
      tasksAhead: [{ id: "ahead", title: "Write brief" }],
    });
    const kinds = why.facts.map((f) => f.kind);
    expect(kinds).toEqual(
      expect.arrayContaining(["order", "deadline", "hours", "before", "length"])
    );
    const earlier = why.facts.find((f) => f.kind === "before")!;
    expect(earlier.text).toContain("“Write brief”");
    expect(earlier.text).toContain("1h of calendar events");
    expect(earlier.text).toContain("1h of personal time");
    expect(why.facts.find((f) => f.kind === "order")!.text).toMatch(
      /^2nd of 2/
    );
    expect(why.facts.find((f) => f.kind === "hours")!.text).toContain(
      "09:00–17:00"
    );
  });

  it("says so when a fresh plan would move the task", () => {
    const { input, trace, result } = run([task({ id: "me" })]);
    const why = explainPlacement({
      input,
      result,
      trace,
      taskId: "me",
      current: { start: at("15:00"), end: at("16:00") },
    });
    expect(why.upToDate).toBe(false);
    expect(why.facts[0]).toMatchObject({ kind: "stale", decisive: true });
  });

  it("explains a dependency wait and a deadline at risk", () => {
    const { input, trace, result } = run([
      task({
        id: "dep",
        title: "Draft",
        priority: "URGENT",
        estimatedMinutes: 240,
      }),
      task({
        id: "me",
        title: "Send",
        dependsOnId: "dep",
        deadline: new Date("2026-07-06T00:00:00.000Z"),
        estimatedMinutes: 300,
      }),
    ]);
    const why = explainPlacement({
      input,
      result,
      trace,
      taskId: "me",
      current: { start: null, end: null },
    });
    expect(why.facts.find((f) => f.kind === "earliest")!.text).toContain(
      "“Draft”"
    );
    expect(why.atRisk).toBe(true);
    expect(why.facts.find((f) => f.kind === "deadline")).toMatchObject({
      decisive: true,
    });
  });

  it("explains a pinned task without inventing reasons", () => {
    const { input, trace, result } = run([
      task({
        id: "pin",
        isFrozen: true,
        scheduledStart: at("15:00"),
        scheduledEnd: at("16:00"),
      }),
    ]);
    const why = explainPlacement({
      input,
      result,
      trace,
      taskId: "pin",
      current: { start: at("15:00"), end: at("16:00") },
    });
    expect(why.status).toBe("pinned");
    expect(why.facts).toHaveLength(1);
  });

  it("reports why a task found no time", () => {
    const { input, trace, result } = run([
      task({ id: "blocked", dependsOnId: "missing-and-unplaced" }),
      task({ id: "missing-and-unplaced", estimatedMinutes: 0 }),
    ]);
    const why = explainPlacement({
      input,
      result,
      trace,
      taskId: "missing-and-unplaced",
      current: { start: null, end: null },
    });
    expect(why.status).toBe("unplaced");
    expect(why.facts[0]).toMatchObject({ kind: "unplaced" });
  });
});

describe("explainPlacement earlier time", () => {
  it("never counts the same minute twice", () => {
    const { input, trace, result } = run(
      [task({ id: "me" })],
      [
        busy({ id: "m", start: at("09:00"), end: at("11:00") }),
        // A fixed task inside the meeting: already covered.
        busy({
          id: "pin",
          source: "task",
          start: at("10:00"),
          end: at("10:30"),
        }),
      ]
    );
    const block = result.blocks.find((b) => b.taskId === "me")!;
    const why = explainPlacement({
      input,
      result,
      trace,
      taskId: "me",
      current: { start: block.start, end: block.end },
    });
    expect(why.before).toMatchObject({
      workMinutes: 120,
      meetingMinutes: 120,
      fixedTaskMinutes: 0,
    });
  });
});
