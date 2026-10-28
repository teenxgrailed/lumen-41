import { scheduleAllTasksForUserDetailed } from "../TaskSchedulingService";

/**
 * A task with fixed times and `isAutoScheduled: false` (pinned by hand, or
 * created with a start through MCP) is busy time: the scheduler never places
 * an auto-scheduled task on top of it. Done and archived tasks are not busy.
 */

const mockDb: {
  personalBlocks: Array<Record<string, unknown>>;
  pinned: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  created: Array<{ taskId: string; start: Date; end: Date }>;
} = { personalBlocks: [], pinned: [], events: [], created: [] };

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
  canAutoScheduleMore: jest
    .fn()
    .mockResolvedValue({ limit: null, remaining: null }),
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

function pinnedTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "pinned-1",
    scheduledStart: new Date(2026, 9, 19, 9, 0, 0),
    scheduledEnd: new Date(2026, 9, 19, 11, 0, 0),
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

async function runScheduler() {
  const tasks = Array.from({ length: 3 }, (_, i) => dbTask(i));
  const queue: unknown[][] = [tasks, []]; // the tasks to place, then the reload
  prisma.task.findMany.mockImplementation(
    async (args?: {
      where?: { blockEventId?: unknown; isAutoScheduled?: unknown };
    }) => {
      if (args?.where?.blockEventId) return [];
      if (args?.where?.isAutoScheduled === false) return mockDb.pinned;
      return queue.shift() ?? [];
    }
  );
  await scheduleAllTasksForUserDetailed("user-1");
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
  mockDb.pinned = [];
  mockDb.events = [];
  mockDb.created = [];
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("TaskSchedulingService with pinned tasks", () => {
  it("control: without a pinned task, a block lands in the morning", async () => {
    const monday = await runScheduler();
    expect(monday.some((b) => overlapsWindow(b, 9, 11))).toBe(true);
  });

  it("never places a block on a non-auto task with fixed times", async () => {
    mockDb.pinned = [pinnedTask()];
    const monday = await runScheduler();
    expect(monday.length).toBeGreaterThan(0);
    expect(monday.filter((b) => overlapsWindow(b, 9, 11))).toEqual([]);
  });

  it("asks only for open, unarchived, assigned, non-auto tasks", async () => {
    mockDb.pinned = [pinnedTask()];
    await runScheduler();
    const call = prisma.task.findMany.mock.calls
      .map((c: unknown[]) => c[0] as { where: Record<string, unknown> })
      .find(
        (c: { where: Record<string, unknown> }) =>
          c.where.isAutoScheduled === false
      );
    expect(call?.where).toMatchObject({
      isAutoScheduled: false,
      autoScheduled: false,
      assigneeId: "user-1",
      isArchived: false,
      status: { not: "completed" },
    });
  });

  it("leaves trashed tasks out, both the ones it places and the busy ones", async () => {
    await runScheduler();
    const wheres = prisma.task.findMany.mock.calls
      .map((c: unknown[]) => (c[0] as { where: Record<string, unknown> }).where)
      .filter(
        (w: Record<string, unknown>) => "OR" in w || w.isAutoScheduled === false
      );
    expect(wheres).toHaveLength(2);
    for (const w of wheres) expect(w).toMatchObject({ trashedAt: null });
  });
});
