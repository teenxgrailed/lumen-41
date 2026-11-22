import { scheduleAllTasksForUser } from "@/services/scheduling/TaskSchedulingService";

import { createDayPlanDb } from "./fake-db";
import { USER, seedTask } from "./helpers";

/**
 * Runs the real scheduling entry point against an in-memory prisma, with only
 * the clock-free neighbours (settings, calendar feeds, entitlements) stubbed.
 */
const mockState = {
  db: createDayPlanDb(),
  createMany: jest.fn(),
};

jest.mock("@/lib/prisma", () => ({
  get prisma() {
    const client = mockState.db.client as Record<string, unknown>;
    return {
      ...client,
      scheduledBlock: {
        ...(client.scheduledBlock as object),
        createMany: mockState.createMany,
      },
    };
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock("@/lib/feature-flags", () => ({ dayPlanEnabled: async () => false }));
jest.mock("@/lib/entitlements", () => ({
  canAutoScheduleMore: async () => ({ limit: null, remaining: null }),
}));
jest.mock("@/services/ai/memory", () => ({
  getLearnedDurationRatio: async () => null,
}));
jest.mock("@/services/personal-time/service", () => ({
  personalBusyBlocks: async () => [],
}));
jest.mock("@/services/time-tracking/calibration", () => ({
  getCalibrationContext: async () => ({ factors: {} }),
}));
jest.mock("@/services/scheduling/busy-feeds", () => ({
  ...jest.requireActual("@/services/scheduling/busy-feeds"),
  resolveBusyFeedIds: async () => [],
  pushedBlockExternalIds: async () => new Set(),
}));
jest.mock("@/services/scheduling/user-schedule-lock", () => ({
  withUserScheduleLock: (_userId: string, run: () => Promise<unknown>) => run(),
}));

const schedulable = (over: Record<string, unknown>) =>
  seedTask(mockState.db, {
    assigneeId: USER,
    isAutoScheduled: true,
    autoScheduled: true,
    estimatedMinutes: 30,
    duration: 30,
    energyRequired: "MEDIUM",
    isFrozen: false,
    scheduleLocked: false,
    dependsOnId: null,
    blockedByDependencies: [],
    scheduledBlocks: [],
    tags: [],
    project: null,
    createdAt: new Date(),
    ...over,
  });

beforeEach(() => {
  mockState.db = createDayPlanDb();
  mockState.createMany = jest.fn().mockResolvedValue({ count: 0 });
  mockState.db.insert("userSettings", { userId: USER, timeZone: "UTC" });
  mockState.db.insert("autoScheduleSettings", {
    userId: USER,
    workDays: "[0,1,2,3,4,5,6]",
    workHourStart: 0,
    workHourEnd: 23,
    bufferMinutes: 0,
  });
});

describe("Someday and the scheduler", () => {
  it("test_someday_task_is_not_auto_scheduled", async () => {
    const live = schedulable({ title: "Live" });
    const parked = schedulable({
      title: "Parked",
      somedayAt: new Date("2026-11-10T03:00:00Z"),
    });

    await scheduleAllTasksForUser(USER);

    const placed = mockState.createMany.mock.calls.flatMap(
      ([args]) => (args as { data: { taskId: string }[] }).data
    );
    const placedIds = placed.map((block) => block.taskId);
    // The ordinary task is placed, so the run really planned something.
    expect(placedIds).toContain(live.id);
    expect(placedIds).not.toContain(parked.id);
    const row = mockState.db.tables.task.find((t) => t.id === parked.id);
    expect(row?.scheduledStart ?? null).toBeNull();
  });
});
