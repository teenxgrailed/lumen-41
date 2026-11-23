import { scheduleAllTasksForUserDetailed } from "../TaskSchedulingService";

/**
 * Always easy start counts a LATER calendar day given to a placed task. The
 * scheduler gives a task an earlier day, a new time on the same day, or a first
 * placement without counting any of them, and never writes the "moved from"
 * badge's `previousScheduledStart`.
 */

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
    calendarEvent: { findMany: jest.fn().mockResolvedValue([]) },
    personalBlock: { findMany: jest.fn().mockResolvedValue([]) },
    userSettings: { findUnique: jest.fn(async () => ({ timeZone: TZ })) },
    task: {
      findMany: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockResolvedValue({}),
    },
    scheduledBlock: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
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

function dbTask(id: string, fields: Record<string, unknown> = {}) {
  return {
    id,
    title: id,
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
    estimatedMinutes: 60,
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
    createdAt: new Date(2026, 9, 1, 8, 0),
    updatedAt: new Date(2026, 9, 1, 8, 0),
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
    ...fields,
  };
}

async function runWith(tasks: ReturnType<typeof dbTask>[]) {
  const queue: unknown[][] = [tasks, []];
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
      if (args?.where?.scheduledStart) return []; // tasks held outside the run
      return queue.shift() ?? [];
    }
  );
  await scheduleAllTasksForUserDetailed("user-1");
  const placed = new Map<string, Record<string, unknown>>();
  for (const [call] of prisma.task.update.mock.calls as [
    { where: { id: string }; data: Record<string, unknown> },
  ][]) {
    if (call.data.scheduledStart) placed.set(call.where.id, call.data);
  }
  return placed;
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
      "clearImmediate",
      "clearInterval",
      "queueMicrotask",
      "performance",
      "hrtime",
    ],
  });
  jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());

describe("the scheduler and rescheduleCount", () => {
  it("counts only a LATER calendar day", async () => {
    const placed = await runWith([
      // placed today, was on an earlier day: later, counts
      dbTask("later", {
        scheduledStart: new Date(2026, 9, 16, 10, 0),
        scheduledEnd: new Date(2026, 9, 16, 11, 0),
      }),
      // same day, new time: not a reschedule
      dbTask("same-day", {
        scheduledStart: new Date(2026, 9, 19, 7, 0),
        scheduledEnd: new Date(2026, 9, 19, 8, 0),
      }),
      // was further out and is pulled earlier: not a reschedule
      dbTask("earlier", {
        scheduledStart: new Date(2026, 9, 23, 10, 0),
        scheduledEnd: new Date(2026, 9, 23, 11, 0),
      }),
      // first placement ever: not a reschedule
      dbTask("fresh"),
    ]);

    expect(placed.size).toBe(4);
    expect(placed.get("later")).toMatchObject({
      rescheduleCount: { increment: 1 },
    });
    for (const id of ["same-day", "earlier", "fresh"]) {
      expect(placed.get(id)).not.toHaveProperty("rescheduleCount");
    }
  });

  it("never writes the moved-from badge", async () => {
    const placed = await runWith([
      dbTask("later", {
        scheduledStart: new Date(2026, 9, 16, 10, 0),
        scheduledEnd: new Date(2026, 9, 16, 11, 0),
      }),
    ]);
    expect(placed.get("later")).not.toHaveProperty("previousScheduledStart");
  });

  it("a task the easy-start spread held on a later day stays there: it is not placed before its not-before date", async () => {
    const placed = await runWith([
      dbTask("held", {
        scheduledStart: new Date(2026, 9, 22, 10, 0),
        scheduledEnd: new Date(2026, 9, 22, 11, 0),
        postponedUntil: new Date(2026, 9, 22, 0, 0),
      }),
    ]);
    const start = placed.get("held")?.scheduledStart as Date;
    expect(start).toBeInstanceOf(Date);
    expect(start.getTime()).toBeGreaterThanOrEqual(
      new Date(2026, 9, 22, 0, 0).getTime()
    );
    // it stayed on its day: not a reschedule either
    expect(placed.get("held")).not.toHaveProperty("rescheduleCount");
  });
});
