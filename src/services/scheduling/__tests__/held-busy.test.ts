import { scheduleAllTasksForUserDetailed } from "../TaskSchedulingService";

/**
 * An auto-scheduled task that is not part of the run but still holds a future
 * time is busy time: nothing is placed on top of it. Three ways in: it is in
 * progress, the plan's auto-schedule limit cut it from the run, or it lives in
 * another workspace than the run's.
 */

const mockDb: {
  personalBlocks: Array<Record<string, unknown>>;
  held: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  created: Array<{ taskId: string; start: Date; end: Date }>;
} = { personalBlocks: [], held: [], events: [], created: [] };

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) =>
      fn({ $executeRaw: jest.fn() })
    ),
    autoScheduleSettings: {
      findUnique: jest.fn().mockResolvedValue({
        selectedCalendars: "[]",
        workDays: "[1,2,3,4,5]",
        workHourStart: 9,
        workHourEnd: 17,
        bufferMinutes: 0,
      }),
    },
    calendarFeed: { findMany: jest.fn().mockResolvedValue([]) },
    schedulingPreferences: { findUnique: jest.fn().mockResolvedValue(null) },
    workSchedule: { findMany: jest.fn().mockResolvedValue([]) },
    flexibleHoursOverride: { findMany: jest.fn().mockResolvedValue([]) },
    calendarEvent: {
      findMany: jest.fn(
        async ({ where }: { where: { id?: { in: string[] } } }) =>
          where.id
            ? mockDb.events.filter((e) => where.id!.in.includes(e.id as string))
            : []
      ),
    },
    personalBlock: {
      findMany: jest.fn(async () => mockDb.personalBlocks),
    },
    userSettings: {
      findUnique: jest.fn(async () => ({ timeZone: TZ })),
    },
    task: {
      findMany: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockResolvedValue({}),
    },
    scheduledBlock: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn(
        async ({
          data,
        }: {
          data: Array<{ taskId: string; start: Date; end: Date }>;
        }) => {
          mockDb.created.push(...data);
          return { count: data.length };
        }
      ),
    },
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock("@/services/time-tracking/calibration", () => ({
  getCalibrationContext: jest.fn().mockResolvedValue({ factors: {} }),
}));
jest.mock("@/lib/entitlements", () => ({
  canAutoScheduleMore: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require("@/lib/prisma");

const NOW = new Date(2026, 9, 19, 8, 0, 0); // Monday 19 Oct 2026, 08:00 local

function dbTask(index: number) {
  return {
    id: `task-${index}`,
    title: `Task ${index}`,
    assigneeId: "user-1",
    userId: "user-1",
    description: null,
    status: "todo",
    dueDate: null,
    startDate: null,
    duration: null,
    priority: null,
    energyLevel: null,
    preferredTime: null,
    energyRequired: "MEDIUM",
    estimatedMinutes: 90,
    estLikely: null,
    minChunkMinutes: null,
    maxChunkMinutes: null,
    deadline: null,
    hardDeadline: false,
    priorityLevel: "MEDIUM",
    contextTag: null,
    isFrozen: false,
    dependsOnId: null,
    dependsOn: null,
    blockedByDependencies: [],
    projectBlockersTargeted: [],
    stage: null,
    autoScheduled: true,
    scheduledBlocks: [],
    projectId: null,
    createdAt: new Date(2026, 9, 1, 8, index),
    updatedAt: new Date(2026, 9, 1, 8, index),
    recurrenceRule: null,
    lastCompletedDate: null,
    completedAt: null,
    isRecurring: false,
    isAutoScheduled: true,
    scheduledStart: null,
    scheduledEnd: null,
    scheduleId: null,
    scheduleScore: null,
    lastScheduled: null,
    scheduleLocked: false,
    availableFrom: null,
    postponedUntil: null,
    isArchived: false,
    archivedAt: null,
    tags: [],
    project: null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { canAutoScheduleMore } = require("@/lib/entitlements");

function heldTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "held-1",
    title: "Held",
    status: "in_progress",
    scheduledStart: new Date(2026, 9, 19, 9, 0, 0),
    scheduledEnd: new Date(2026, 9, 19, 11, 0, 0),
    scheduledBlocks: [],
    ...overrides,
  };
}

function overlapsWindow(
  block: { start: Date; end: Date },
  fromHour: number,
  toHour: number
) {
  const day = (offset: number) => {
    const d = new Date(block.start);
    d.setHours(offset, 0, 0, 0);
    return d;
  };
  return block.start < day(toHour) && block.end > day(fromHour);
}

async function runScheduler(
  runTasks = Array.from({ length: 3 }, (_, i) => dbTask(i)),
  options: { workspaceId?: string } = {}
) {
  const queue: unknown[][] = [runTasks, []]; // the tasks to place, then the reload
  prisma.task.findMany.mockImplementation(
    async (args?: {
      where?: {
        blockEventId?: unknown;
        isAutoScheduled?: unknown;
        scheduledStart?: unknown;
      };
    }) => {
      if (args?.where?.blockEventId) return [];
      if (args?.where?.isAutoScheduled === false) return [];
      if (args?.where?.scheduledStart) return mockDb.held;
      return queue.shift() ?? [];
    }
  );
  await scheduleAllTasksForUserDetailed("user-1", options);
  return mockDb.created.filter(
    (b) => b.start.getDate() === 19 && b.start.getMonth() === 9
  );
}

beforeEach(() => {
  jest.useFakeTimers({
    now: NOW,
    doNotFake: [
      "nextTick",
      "setImmediate",
      "setTimeout",
      "setInterval",
      "clearTimeout",
      "clearInterval",
      "clearImmediate",
      "queueMicrotask",
      "performance",
      "hrtime",
    ],
  });
  mockDb.personalBlocks = [];
  mockDb.held = [];
  mockDb.events = [];
  mockDb.created = [];
  jest.clearAllMocks();
  canAutoScheduleMore.mockResolvedValue({ limit: null, remaining: null });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("TaskSchedulingService with auto-scheduled tasks held outside the run", () => {
  it("control: without a held task, a block lands in the morning", async () => {
    const monday = await runScheduler();
    expect(monday.some((b) => overlapsWindow(b, 9, 11))).toBe(true);
  });

  it("an in-progress auto-scheduled task keeps its slot free of blocks", async () => {
    mockDb.held = [heldTask({ status: "in_progress" })];
    const monday = await runScheduler();
    expect(monday.length).toBeGreaterThan(0);
    expect(monday.filter((b) => overlapsWindow(b, 9, 11))).toEqual([]);
  });

  it("asks for in-progress tasks: only completed ones are left out", async () => {
    await runScheduler();
    const call = prisma.task.findMany.mock.calls
      .map((c: unknown[]) => c[0] as { where: Record<string, unknown> })
      .find(
        (c: { where: Record<string, unknown> }) =>
          c.where.scheduledStart && c.where.isAutoScheduled === undefined
      );
    expect(call?.where).toMatchObject({
      assigneeId: "user-1",
      isArchived: false,
      trashedAt: null,
      status: { not: "completed" },
    });
  });

  it("a task the plan's limit cut from the run still holds its slot", async () => {
    // limit 1 with three tasks: task-0 is placed, task-1 and task-2 are cut.
    canAutoScheduleMore.mockResolvedValue({ limit: 1, remaining: 1 });
    const runTasks = Array.from({ length: 3 }, (_, i) => dbTask(i));
    // task-2 was cut, and still carries the 09:00-11:00 slot from before
    mockDb.held = [heldTask({ id: "task-2", status: "todo", title: "Task 2" })];
    const monday = await runScheduler(runTasks);
    expect(monday.map((b) => b.taskId)).toEqual(["task-0"]);
    expect(monday.filter((b) => overlapsWindow(b, 9, 11))).toEqual([]);
  });

  it("a task of the run is not busy against itself", async () => {
    // the same row comes back from the held read: it is in the run, so it is
    // replaced, not an obstacle
    mockDb.held = [heldTask({ id: "task-0", status: "todo" })];
    const monday = await runScheduler();
    expect(monday.some((b) => overlapsWindow(b, 9, 11))).toBe(true);
  });

  it("another workspace's task is read too: no workspace filter on the held or pinned read", async () => {
    mockDb.held = [heldTask({ status: "todo" })];
    const monday = await runScheduler(
      Array.from({ length: 3 }, (_, i) => dbTask(i)),
      { workspaceId: "ws-1" }
    );
    expect(monday.filter((b) => overlapsWindow(b, 9, 11))).toEqual([]);
    const reads = prisma.task.findMany.mock.calls
      .map((c: unknown[]) => (c[0] as { where: Record<string, unknown> }).where)
      .filter((w: Record<string, unknown>) => w.scheduledStart);
    expect(reads).toHaveLength(2); // pinned + held
    for (const w of reads) expect(w).not.toHaveProperty("workspaceId");
    // the run's own read stays inside the workspace
    const own = prisma.task.findMany.mock.calls
      .map((c: unknown[]) => (c[0] as { where: Record<string, unknown> }).where)
      .find((w: Record<string, unknown>) => "OR" in w);
    expect(own).toMatchObject({ workspaceId: "ws-1" });
  });

  it("holds every chunk of a split task", async () => {
    mockDb.held = [
      heldTask({
        status: "todo",
        scheduledStart: new Date(2026, 9, 19, 9, 0, 0),
        scheduledEnd: new Date(2026, 9, 19, 9, 30, 0),
        scheduledBlocks: [
          {
            start: new Date(2026, 9, 19, 9, 0, 0),
            end: new Date(2026, 9, 19, 9, 30, 0),
          },
          {
            start: new Date(2026, 9, 19, 10, 0, 0),
            end: new Date(2026, 9, 19, 11, 0, 0),
          },
        ],
      }),
    ];
    const monday = await runScheduler();
    expect(monday.filter((b) => overlapsWindow(b, 10, 11))).toEqual([]);
  });
});
