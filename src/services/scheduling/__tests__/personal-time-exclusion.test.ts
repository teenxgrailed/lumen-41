import { AutoScheduleSettings } from "@prisma/client";

import { TimeSlot } from "@/types/scheduling";

import { CalendarService } from "../CalendarService";
import { scheduleAllTasksForUserDetailed } from "../TaskSchedulingService";
import { TimeSlotManagerImpl } from "../TimeSlotManager";

/**
 * Personal time (Lunch, Walk, Gym...) is protected: the scheduler, the slot
 * manager and Plan my day (which runs `schedule.auto`, i.e. the scheduler)
 * never place a task inside one. A repeat and a block linked to a synced
 * event count the same as a one-off block.
 */

const mockDb: {
  personalBlocks: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  created: Array<{ taskId: string; start: Date; end: Date }>;
} = { personalBlocks: [], events: [], created: [] };

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

/** Lunch 12:00-14:00 local on weekdays, repeating from Monday 19 Oct. */
function lunch(overrides: Record<string, unknown> = {}) {
  return {
    id: "lunch",
    kind: "lunch",
    title: "Lunch",
    emoji: "🍽️",
    color: null,
    start: new Date(2026, 9, 19, 12, 0, 0),
    end: new Date(2026, 9, 19, 14, 0, 0),
    rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
    sourceEventId: null,
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
  // Six tasks fill three working days. More would push the search to Sunday
  // 25 Oct, the autumn clock change in many zones, where the engine's day
  // loop (startOfDay(day + 24h)) never advances on a 25-hour day.
  const tasks = Array.from({ length: 6 }, (_, i) => dbTask(i));
  const queue: unknown[][] = [tasks, []]; // the tasks to place, then the reload
  prisma.task.findMany.mockImplementation(
    async (args?: { where?: { blockEventId?: unknown } }) =>
      args?.where?.blockEventId ? [] : (queue.shift() ?? [])
  );
  await scheduleAllTasksForUserDetailed("user-1");
  return mockDb.created;
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
  mockDb.events = [];
  mockDb.created = [];
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("TaskSchedulingService with personal time", () => {
  it("control: without personal time, blocks do land in the lunch hours", async () => {
    const blocks = await runScheduler();
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.some((b) => overlapsWindow(b, 12, 14))).toBe(true);
  });

  it("never places a block inside a repeating Lunch", async () => {
    mockDb.personalBlocks = [lunch()];
    const blocks = await runScheduler();
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.filter((b) => overlapsWindow(b, 12, 14))).toEqual([]);
  });

  it("never places a block inside a one-off block", async () => {
    mockDb.personalBlocks = [
      lunch({
        id: "walk",
        kind: "walk",
        title: "Walk",
        rrule: null,
        start: new Date(2026, 9, 19, 9, 0, 0),
        end: new Date(2026, 9, 19, 12, 0, 0),
      }),
    ];
    const blocks = await runScheduler();
    const monday = blocks.filter(
      (b) => b.start.getDate() === 19 && b.start.getMonth() === 9
    );
    expect(monday.filter((b) => overlapsWindow(b, 9, 12))).toEqual([]);
  });

  it("follows a block linked to a synced event to where the event now is", async () => {
    mockDb.events = [
      {
        id: "event-1",
        start: new Date(2026, 9, 19, 15, 0, 0),
        end: new Date(2026, 9, 19, 17, 0, 0),
      },
    ];
    mockDb.personalBlocks = [
      lunch({
        id: "gym",
        kind: "gym",
        title: "Gym",
        rrule: null,
        // the snapshot is stale: the event moved to 15:00-17:00 since
        start: new Date(2026, 9, 19, 9, 0, 0),
        end: new Date(2026, 9, 19, 10, 0, 0),
        sourceEventId: "event-1",
      }),
    ];
    const blocks = await runScheduler();
    const monday = blocks.filter(
      (b) => b.start.getDate() === 19 && b.start.getMonth() === 9
    );
    expect(monday.filter((b) => overlapsWindow(b, 15, 17))).toEqual([]);
    expect(monday.some((b) => overlapsWindow(b, 9, 10))).toBe(true);
  });

  it("ignores archived blocks (the query filters them out)", async () => {
    mockDb.personalBlocks = [];
    await runScheduler();
    const where = prisma.personalBlock.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ userId: "user-1", archivedAt: null });
  });
});

describe("TimeSlotManager with personal time", () => {
  const settings = {
    bufferMinutes: 0,
    workDays: "[1,2,3,4,5]",
    workHourStart: 9,
    workHourEnd: 17,
    selectedCalendars: '["calendar-1"]',
  } as AutoScheduleSettings;

  const calendar: CalendarService = {
    findConflicts: jest.fn().mockResolvedValue([]),
    findBatchConflicts: jest.fn(
      async (slots: { slot: TimeSlot; taskId: string }[]) =>
        slots.map(({ slot, taskId }) => ({ slot, taskId, conflicts: [] }))
    ),
    getEvents: jest.fn().mockResolvedValue([]),
  };

  function asSlot(startHour: number, endHour: number): TimeSlot {
    return {
      start: new Date(2026, 9, 19, startHour, 0, 0),
      end: new Date(2026, 9, 19, endHour, 0, 0),
      score: 0,
      conflicts: [],
      energyLevel: null,
      isWithinWorkHours: true,
      hasBufferTime: false,
    };
  }

  it("refuses a slot inside personal time and accepts one outside", async () => {
    prisma.task.findMany.mockResolvedValue([]);
    mockDb.personalBlocks = [lunch()];
    const manager = new TimeSlotManagerImpl(settings, calendar, TZ);
    await expect(
      manager.isSlotAvailable(asSlot(12, 13), "user-1")
    ).resolves.toBe(false);
    await expect(
      manager.isSlotAvailable(asSlot(13, 14), "user-1")
    ).resolves.toBe(false);
    await expect(
      manager.isSlotAvailable(asSlot(14, 15), "user-1")
    ).resolves.toBe(true);
  });

  it("offers no candidate slot that touches personal time", async () => {
    prisma.task.findMany.mockResolvedValue([]);
    mockDb.personalBlocks = [lunch()];
    const manager = new TimeSlotManagerImpl(settings, calendar, TZ);
    const slots = await manager.findAvailableSlots(
      { id: "t", userId: "user-1", duration: 60 } as never,
      new Date(2026, 9, 19, 8, 0, 0),
      new Date(2026, 9, 20, 18, 0, 0),
      "user-1"
    );
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.filter((s) => overlapsWindow(s, 12, 14))).toEqual([]);
  });

  it("keeps a task's buffer out of personal time too", async () => {
    prisma.task.findMany.mockResolvedValue([]);
    mockDb.personalBlocks = [lunch()];
    const manager = new TimeSlotManagerImpl(
      { ...settings, bufferMinutes: 15 },
      calendar,
      TZ
    );
    // 10:00-11:50 ends 10 minutes before lunch; its 15-minute buffer would not.
    await expect(
      manager.isSlotAvailable(
        {
          ...asSlot(10, 11),
          end: new Date(2026, 9, 19, 11, 50, 0),
        },
        "user-1"
      )
    ).resolves.toBe(false);
  });
});
