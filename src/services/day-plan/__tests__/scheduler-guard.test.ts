import { NOT_IN_SOMEDAY } from "@/services/scheduling/candidates";
import type { ScheduleResult } from "@/services/scheduling/engine";
import { readFileSync } from "fs";
import path from "path";

import {
  dropBlocksPastPlanDate,
  guardActiveDayPlans,
} from "../scheduler-guard";
import { createDayPlanDb } from "./fake-db";
import { USER, seedPlan, seedTask } from "./helpers";

const mockState = { db: createDayPlanDb(), enabled: true };

jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockState.db.client;
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
jest.mock("@/lib/feature-flags", () => ({
  dayPlanEnabled: async () => mockState.enabled,
}));

const ZONE = "Europe/Zurich";

const block = (taskId: string, start: string) => ({
  taskId,
  title: taskId,
  start: new Date(start),
  end: new Date(new Date(start).getTime() + 3_600_000),
  chunkIndex: 0,
  chunkCount: 1,
  energyRequired: "MEDIUM" as const,
  isFrozen: false,
});

const resultOf = (...blocks: ReturnType<typeof block>[]): ScheduleResult => ({
  blocks,
  unscheduled: [],
  frozenBlocks: [],
});

const taskIds = (result: ScheduleResult) => result.blocks.map((b) => b.taskId);

beforeEach(() => {
  mockState.db = createDayPlanDb();
  mockState.enabled = true;
});

describe("D4 scheduler guard", () => {
  it("test_scheduler_does_not_move_planned_task_to_next_day", async () => {
    const missed = seedTask(mockState.db, { title: "Missed" });
    const free = seedTask(mockState.db, { title: "Not planned" });
    const later = seedTask(mockState.db, { title: "Later today" });
    seedPlan(
      mockState.db,
      "2026-11-19",
      [String(missed.id), String(later.id)],
      {
        status: "active",
      }
    );

    // Reschedule-on-miss re-placed the missed task on the 20th (Zurich), the
    // unplanned one on the 20th too, and a third later on the same day.
    const engine = resultOf(
      block(String(missed.id), "2026-11-20T09:00:00Z"),
      block(String(free.id), "2026-11-20T09:00:00Z"),
      block(String(later.id), "2026-11-19T17:00:00Z")
    );

    const guarded = await guardActiveDayPlans(USER, ZONE, engine);

    // The planned task is not carried to the next day; the unplanned one may be.
    expect(taskIds(guarded)).toEqual([String(free.id), String(later.id)]);
  });

  it("only binds an active plan, and a block at 23:30 local is still that day", async () => {
    const draft = seedTask(mockState.db);
    const late = seedTask(mockState.db);
    seedPlan(mockState.db, "2026-11-18", [String(draft.id)], {
      status: "draft",
    });
    seedPlan(mockState.db, "2026-11-19", [String(late.id)], {
      status: "active",
    });
    // 22:30Z on the 19th is 23:30 in Zurich: still the 19th.
    const engine = resultOf(
      block(String(draft.id), "2026-11-20T09:00:00Z"),
      block(String(late.id), "2026-11-19T22:30:00Z")
    );
    const guarded = await guardActiveDayPlans(USER, ZONE, engine);
    expect(taskIds(guarded)).toEqual([String(draft.id), String(late.id)]);
  });

  it("stands down with the kill switch", async () => {
    const task = seedTask(mockState.db);
    seedPlan(mockState.db, "2026-11-19", [String(task.id)], {
      status: "active",
    });
    mockState.enabled = false;
    const engine = resultOf(block(String(task.id), "2026-11-20T09:00:00Z"));
    expect(await guardActiveDayPlans(USER, ZONE, engine)).toBe(engine);
  });

  it("drops only the blocks past the plan date", () => {
    const engine = resultOf(
      block("a", "2026-11-19T08:00:00Z"),
      block("a", "2026-11-20T08:00:00Z")
    );
    const { result, dropped } = dropBlocksPastPlanDate(
      engine,
      new Map([["a", "2026-11-19"]]),
      ZONE
    );
    expect(taskIds(result)).toEqual(["a"]);
    expect(dropped).toEqual(["a"]);
  });
});

describe("Someday and the scheduler", () => {
  it("test_someday_task_is_not_auto_scheduled", async () => {
    const parked = seedTask(mockState.db, {
      title: "Parked",
      isAutoScheduled: true,
      somedayAt: new Date("2026-11-10T03:00:00Z"),
    });
    const live = seedTask(mockState.db, {
      title: "Live",
      isAutoScheduled: true,
    });

    // The filter the scheduler's candidate query spreads in keeps only the
    // task that is not in Someday.
    const taskTable = mockState.db.client.task as {
      findMany: (args: unknown) => Promise<Array<{ id: unknown }>>;
    };
    const rows = await taskTable.findMany({
      where: { ...NOT_IN_SOMEDAY, isAutoScheduled: true },
    });
    expect(rows.map((row: { id: unknown }) => row.id)).toEqual([live.id]);
    expect(rows.map((row: { id: unknown }) => row.id)).not.toContain(parked.id);

    // And the service really spreads it into the candidate query.
    const source = readFileSync(
      path.join(
        process.cwd(),
        "src/services/scheduling/TaskSchedulingService.ts"
      ),
      "utf8"
    );
    expect(source).toContain("...NOT_IN_SOMEDAY,");
  });
});
