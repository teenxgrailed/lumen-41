import { scheduleAllTasksForUserDetailed } from "../TaskSchedulingService";

/**
 * Idea cards: an idea is never loaded as work to place and never reduces free
 * time. Every task read of the scheduler carries `kind: "TASK"`; the fake
 * database below honours it, with a stray auto-scheduled idea in the table.
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

type Row = Record<string, unknown>;

/** A database that applies the `kind` filter, as Postgres would. */
function filtered(rows: Row[], where?: { kind?: string }) {
  return rows.filter((row) => !where?.kind || row.kind === where.kind);
}

async function run() {
  const real = { ...dbTask(0), kind: "TASK", title: "Real work" };
  // A stray: an idea that somehow says it is auto-scheduled and pinned in time.
  const idea = {
    ...dbTask(1),
    kind: "IDEA",
    title: "Check the news",
    isAutoScheduled: true,
    autoScheduled: true,
  };
  const pinnedIdea = {
    id: "pinned-idea",
    kind: "IDEA",
    isAutoScheduled: false,
    scheduledStart: new Date(2026, 9, 19, 9, 0, 0),
    scheduledEnd: new Date(2026, 9, 19, 12, 0, 0),
  };
  const calls: Array<{ where?: { kind?: string } }> = [];
  prisma.task.findMany.mockImplementation(
    async (args?: {
      where?: {
        blockEventId?: unknown;
        isAutoScheduled?: unknown;
        scheduledStart?: unknown;
        kind?: string;
      };
    }) => {
      calls.push({ where: args?.where });
      if (args?.where?.blockEventId) return [];
      if (args?.where?.isAutoScheduled === false) {
        return filtered([pinnedIdea], args?.where);
      }
      if (args?.where?.scheduledStart) return []; // held outside the run
      return filtered([real, idea], args?.where);
    }
  );
  await scheduleAllTasksForUserDetailed("user-1");
  return { calls, created: mockDb.created };
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
afterEach(() => jest.useRealTimers());

describe("the scheduler and ideas", () => {
  it("places the task and never the idea", async () => {
    const { created } = await run();
    expect(created.length).toBeGreaterThan(0);
    expect(new Set(created.map((block) => block.taskId))).toEqual(
      new Set(["task-0"])
    );
  });

  it("an idea pinned in time is not busy time: the task starts at the start of the day", async () => {
    const { created } = await run();
    const first = created
      .filter((b) => b.taskId === "task-0")
      .sort((a, b) => a.start.getTime() - b.start.getTime())[0];
    // the pinned idea would have blocked 09:00-12:00
    expect(first.start.getHours()).toBe(9);
  });

  it("every task read of a run names kind TASK", async () => {
    const { calls } = await run();
    expect(calls.length).toBeGreaterThanOrEqual(3);
    for (const call of calls) expect(call.where?.kind).toBe("TASK");
  });
});
