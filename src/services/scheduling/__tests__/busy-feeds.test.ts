import { scheduleAllTasksForUserDetailed } from "../TaskSchedulingService";
import { resolveBusyFeedIds } from "../busy-feeds";

/**
 * Every enabled feed blocks time unless the person switched it off. A feed
 * made after the settings were saved, and the Needt local calendar, count
 * without any settings write.
 */

type Feed = { id: string; type: string; enabled: boolean };
type Ev = {
  id: string;
  feedId: string;
  start: Date;
  end: Date;
  allDay: boolean;
  externalEventId: string | null;
  transparent?: boolean;
  selfDeclined?: boolean;
};

const mockDb: {
  feeds: Feed[];
  events: Ev[];
  pushedBlockIds: string[];
  excluded: string;
  selected: string;
  created: Array<{ taskId: string; start: Date; end: Date }>;
} = {
  feeds: [],
  events: [],
  pushedBlockIds: [],
  excluded: "[]",
  selected: "[]",
  created: [],
};

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) =>
      fn({ $executeRaw: jest.fn() })
    ),
    autoScheduleSettings: {
      findUnique: jest.fn(async () => ({
        selectedCalendars: mockDb.selected,
        excludedCalendars: mockDb.excluded,
        workDays: "[1,2,3,4,5]",
        workHourStart: 9,
        workHourEnd: 17,
        bufferMinutes: 0,
      })),
    },
    calendarFeed: {
      findMany: jest.fn(async () =>
        mockDb.feeds
          .filter((f) => f.enabled)
          .map(({ id, type }) => ({ id, type }))
      ),
    },
    schedulingPreferences: { findUnique: jest.fn().mockResolvedValue(null) },
    workSchedule: { findMany: jest.fn().mockResolvedValue([]) },
    flexibleHoursOverride: { findMany: jest.fn().mockResolvedValue([]) },
    calendarEvent: {
      findMany: jest.fn(
        async ({
          where,
        }: {
          where: {
            feedId?: { in: string[] };
            allDay?: boolean;
            transparent?: boolean;
            selfDeclined?: boolean;
          };
        }) =>
          where.feedId
            ? mockDb.events.filter(
                (e) =>
                  where.feedId!.in.includes(e.feedId) &&
                  (where.allDay === undefined || e.allDay === where.allDay) &&
                  (where.transparent === undefined ||
                    (e.transparent ?? false) === where.transparent) &&
                  (where.selfDeclined === undefined ||
                    (e.selfDeclined ?? false) === where.selfDeclined)
              )
            : []
      ),
    },
    personalBlock: { findMany: jest.fn().mockResolvedValue([]) },
    userSettings: { findUnique: jest.fn(async () => ({ timeZone: TZ })) },
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

function dbTask() {
  return {
    id: "task-1",
    title: "Task",
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
  };
}

function event(over: Partial<Ev> & { feedId: string }): Ev {
  return {
    id: "ev",
    start: new Date(2026, 9, 19, 9, 0, 0),
    end: new Date(2026, 9, 19, 17, 0, 0),
    allDay: false,
    externalEventId: null,
    ...over,
  };
}

async function place() {
  const queue: unknown[][] = [[dbTask()], []];
  prisma.task.findMany.mockImplementation(
    async (args?: {
      where?: { blockEventId?: unknown; isAutoScheduled?: unknown };
    }) =>
      args?.where?.blockEventId
        ? mockDb.pushedBlockIds.map((blockEventId) => ({ blockEventId }))
        : args?.where?.isAutoScheduled === false
          ? [] // pinned tasks: none here
          : (queue.shift() ?? [])
  );
  await scheduleAllTasksForUserDetailed("user-1");
  return mockDb.created;
}

function onMondayBetween(
  b: { start: Date; end: Date },
  fromHour: number,
  toHour: number
) {
  const at = (h: number) => new Date(2026, 9, 19, h, 0, 0);
  return b.start < at(toHour) && b.end > at(fromHour);
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
  mockDb.feeds = [];
  mockDb.events = [];
  mockDb.pushedBlockIds = [];
  mockDb.excluded = "[]";
  mockDb.selected = "[]";
  mockDb.created = [];
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("resolveBusyFeedIds", () => {
  it("takes every enabled feed, including ones the old selection never listed", async () => {
    mockDb.feeds = [
      { id: "caldav-1", type: "CALDAV", enabled: true },
      { id: "local-1", type: "LOCAL", enabled: true },
      { id: "off", type: "GOOGLE", enabled: false },
    ];
    await expect(resolveBusyFeedIds("user-1", "[]")).resolves.toEqual([
      "caldav-1",
      "local-1",
    ]);
  });

  it("drops a feed the person excluded, but never a LOCAL one", async () => {
    mockDb.feeds = [
      { id: "caldav-1", type: "CALDAV", enabled: true },
      { id: "local-1", type: "LOCAL", enabled: true },
    ];
    await expect(
      resolveBusyFeedIds("user-1", '["caldav-1","local-1"]')
    ).resolves.toEqual(["local-1"]);
  });

  it("treats a malformed exclusion list as no exclusions", async () => {
    mockDb.feeds = [{ id: "caldav-1", type: "CALDAV", enabled: true }];
    await expect(resolveBusyFeedIds("user-1", "not json")).resolves.toEqual([
      "caldav-1",
    ]);
  });
});

describe("the scheduler and busy time", () => {
  it("control: with no events the task lands at the start of the day", async () => {
    mockDb.feeds = [{ id: "local-1", type: "LOCAL", enabled: true }];
    const blocks = await place();
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.some((b) => onMondayBetween(b, 9, 10))).toBe(true);
  });

  it("an event in a LOCAL feed blocks time even though settings list no calendars", async () => {
    mockDb.selected = "[]";
    mockDb.feeds = [{ id: "local-1", type: "LOCAL", enabled: true }];
    mockDb.events = [event({ feedId: "local-1" })]; // Monday 09:00-17:00
    const blocks = await place();
    expect(blocks.filter((b) => onMondayBetween(b, 9, 17))).toEqual([]);
    expect(blocks.length).toBeGreaterThan(0);
  });

  it("a feed created after the settings were saved blocks time", async () => {
    mockDb.selected = '["old-feed"]';
    mockDb.feeds = [
      { id: "old-feed", type: "CALDAV", enabled: true },
      { id: "new-feed", type: "CALDAV", enabled: true },
    ];
    mockDb.events = [event({ feedId: "new-feed" })];
    const blocks = await place();
    expect(blocks.filter((b) => onMondayBetween(b, 9, 17))).toEqual([]);
  });

  it("a feed the person excluded does not block", async () => {
    mockDb.excluded = '["muted"]';
    mockDb.feeds = [{ id: "muted", type: "CALDAV", enabled: true }];
    mockDb.events = [event({ feedId: "muted" })];
    const blocks = await place();
    expect(blocks.some((b) => onMondayBetween(b, 9, 17))).toBe(true);
  });

  it("a LOCAL feed cannot be excluded", async () => {
    mockDb.excluded = '["local-1"]';
    mockDb.feeds = [{ id: "local-1", type: "LOCAL", enabled: true }];
    mockDb.events = [event({ feedId: "local-1" })];
    const blocks = await place();
    expect(blocks.filter((b) => onMondayBetween(b, 9, 17))).toEqual([]);
  });

  it("an all-day event is not busy time", async () => {
    mockDb.feeds = [{ id: "caldav-1", type: "CALDAV", enabled: true }];
    mockDb.events = [event({ feedId: "caldav-1", allDay: true })];
    const blocks = await place();
    expect(blocks.some((b) => onMondayBetween(b, 9, 17))).toBe(true);
  });

  it("an echo of a block we pushed to a calendar is not busy time", async () => {
    mockDb.feeds = [{ id: "caldav-1", type: "CALDAV", enabled: true }];
    mockDb.events = [
      event({ feedId: "caldav-1", externalEventId: "pushed-1" }),
    ];
    mockDb.pushedBlockIds = ["pushed-1"];
    const blocks = await place();
    expect(blocks.some((b) => onMondayBetween(b, 9, 17))).toBe(true);
  });

  it("a free / transparent event is not busy time", async () => {
    mockDb.feeds = [{ id: "caldav-1", type: "CALDAV", enabled: true }];
    mockDb.events = [event({ feedId: "caldav-1", transparent: true })];
    const blocks = await place();
    expect(blocks.some((b) => onMondayBetween(b, 9, 17))).toBe(true);
  });

  it("an event whose invitation the user declined is not busy time", async () => {
    mockDb.feeds = [{ id: "caldav-1", type: "CALDAV", enabled: true }];
    mockDb.events = [event({ feedId: "caldav-1", selfDeclined: true })];
    const blocks = await place();
    expect(blocks.some((b) => onMondayBetween(b, 9, 17))).toBe(true);
  });
});
