import { readFileSync, readdirSync } from "fs";
import path from "path";

import { recordActivation } from "@/lib/activation-events";

import { closeDay } from "../plan";
import { touchedAtOf } from "../rules";
import {
  cleanupSomeday,
  listSomeday,
  restoreSomeday,
  sweepSomeday,
} from "../someday";
import { createDayPlanDb } from "./fake-db";
import {
  NOW,
  OTHER,
  USER,
  dayDate,
  daysAgo,
  seedFlags,
  seedPlan,
  seedTask,
} from "./helpers";

const mockState = {
  db: createDayPlanDb(),
  flags: { day_plan: true, someday_sweep: true },
};

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
jest.mock("@/lib/activation-events", () => ({ recordActivation: jest.fn() }));
jest.mock("@/services/ai/parse-tasks", () => ({
  parseTasksForUser: jest.fn(),
}));
jest.mock("@/lib/auth/personal-workspace", () => ({
  ensurePersonalWorkspaceRow: jest.fn().mockResolvedValue({ id: "ws-1" }),
}));
jest.mock("@/lib/feature-flags", () => ({
  dayPlanEnabled: async () => mockState.flags.day_plan,
  somedaySweepEnabled: async () => mockState.flags.someday_sweep,
}));

const record = recordActivation as jest.Mock;
const db = () => mockState.db;

function setFlags(flags: { day_plan: boolean; someday_sweep: boolean }) {
  mockState.flags = flags;
  seedFlags(db(), flags);
}

const taskOf = (id: unknown) => db().tables.task.find((t) => t.id === id);

beforeEach(() => {
  mockState.db = createDayPlanDb();
  db().insert("userSettings", { userId: USER, timeZone: "Europe/Zurich" });
  setFlags({ day_plan: true, someday_sweep: true });
  record.mockReset();
});

describe("Someday leaves the calendar", () => {
  const start = new Date("2026-11-20T09:00:00Z");
  const end = new Date("2026-11-20T10:00:00Z");
  const scheduled = (title: string, over: Record<string, unknown> = {}) => {
    const task = seedTask(db(), {
      title,
      scheduledStart: start,
      scheduledEnd: end,
      scheduleScore: 1,
      ...over,
    });
    db().insert("scheduledBlock", {
      taskId: task.id,
      userId: USER,
      start,
      end,
    });
    return task;
  };
  const blocksOf = () => db().tables.scheduledBlock.map((b) => b.taskId);

  it("test_task_sent_to_someday_leaves_the_calendar", async () => {
    const parked = scheduled("Parked");
    const stays = scheduled("Stays");
    seedPlan(db(), "2026-11-19", [String(parked.id), String(stays.id)], {
      status: "active",
    });

    await closeDay(
      USER,
      {
        date: "2026-11-19",
        resolutions: [
          { taskId: String(parked.id), resolution: "someday" },
          { taskId: String(stays.id), resolution: "tomorrow" },
        ],
      },
      { now: NOW }
    );

    const row = taskOf(parked.id);
    expect(row?.somedayAt).toEqual(NOW);
    expect(row?.scheduledStart).toBeNull();
    expect(row?.scheduledEnd).toBeNull();
    expect(row?.scheduleScore).toBeNull();
    // Only the parked task's blocks went.
    expect(blocksOf()).toEqual([stays.id]);
    expect(taskOf(stays.id)?.scheduledStart).toEqual(start);
  });

  it("clears the schedule when the nightly sweep parks a task too", async () => {
    const stale = scheduled("Stale", { createdAt: daysAgo(30) });

    expect((await sweepSomeday(NOW)).moved).toBe(1);

    expect(taskOf(stale.id)?.somedayAt).toEqual(NOW);
    expect(taskOf(stale.id)?.scheduledStart).toBeNull();
    expect(blocksOf()).toEqual([]);
  });
});

describe("D3 Someday sweep", () => {
  it("test_untouched_task_moves_to_someday_after_14_days", async () => {
    const stale = seedTask(db(), { createdAt: daysAgo(15) });
    const fresh = seedTask(db(), { createdAt: daysAgo(13) });
    const edited = seedTask(db(), {
      createdAt: daysAgo(40),
      lastTouchedAt: daysAgo(2),
    });

    const result = await sweepSomeday(NOW);

    expect(result).toEqual({ skipped: null, moved: 1, users: 1 });
    expect(taskOf(stale.id)?.somedayAt).toEqual(NOW);
    expect(taskOf(stale.id)?.somedayReason).toBe("stale");
    expect(taskOf(fresh.id)?.somedayAt).toBeNull();
    expect(taskOf(edited.id)?.somedayAt).toBeNull();
    expect(record).toHaveBeenCalledWith("task_to_someday", USER, {
      reason: "stale",
    });
    // It stays a task: not deleted, not archived.
    expect(taskOf(stale.id)?.isArchived).toBe(false);
  });

  it("test_rescheduling_is_not_a_touch", async () => {
    // The pure rule: updatedAt is ignored, only edits count.
    const touched = touchedAtOf({
      lastTouchedAt: daysAgo(15),
      lastActivityAt: null,
      createdAt: daysAgo(30),
    });
    expect(touched).toEqual(daysAgo(15));

    // Against the sweep: the scheduler re-placed the task 3 days ago.
    const rescheduled = seedTask(db(), {
      createdAt: daysAgo(30),
      lastTouchedAt: daysAgo(15),
      updatedAt: daysAgo(3),
      lastScheduled: daysAgo(3),
      scheduledStart: daysAgo(-1),
      isAutoScheduled: true,
    });
    // A real edit 3 days ago (an activity row) does count.
    const edited = seedTask(db(), {
      createdAt: daysAgo(30),
      lastTouchedAt: daysAgo(15),
      activities: [{ createdAt: daysAgo(3) }],
    });

    await sweepSomeday(NOW);

    expect(taskOf(rescheduled.id)?.somedayAt).toEqual(NOW);
    expect(taskOf(edited.id)?.somedayAt).toBeNull();
  });

  it("test_task_with_near_deadline_stays_out_of_someday", async () => {
    const soonDue = seedTask(db(), {
      createdAt: daysAgo(30),
      dueDate: dayDate("2026-11-25"),
    });
    const soonDeadline = seedTask(db(), {
      createdAt: daysAgo(30),
      deadline: new Date("2026-12-01T10:00:00Z"),
    });
    const farDeadline = seedTask(db(), {
      createdAt: daysAgo(30),
      deadline: dayDate("2027-02-01"),
    });
    const longOverdue = seedTask(db(), {
      createdAt: daysAgo(60),
      dueDate: dayDate("2026-10-01"),
    });
    const recurring = seedTask(db(), {
      createdAt: daysAgo(30),
      isRecurring: true,
    });
    const planned = seedTask(db(), { createdAt: daysAgo(30) });
    seedPlan(db(), "2026-11-20", [String(planned.id)]);

    await sweepSomeday(NOW);

    expect(taskOf(soonDue.id)?.somedayAt).toBeNull();
    expect(taskOf(soonDeadline.id)?.somedayAt).toBeNull();
    expect(taskOf(recurring.id)?.somedayAt).toBeNull();
    expect(taskOf(planned.id)?.somedayAt).toBeNull();
    // A far deadline or a long-past date does not protect a forgotten task.
    expect(taskOf(farDeadline.id)?.somedayAt).toEqual(NOW);
    expect(taskOf(longOverdue.id)?.somedayAt).toEqual(NOW);
  });

  it("test_weekly_cleanup_archives_not_deletes", async () => {
    const week = seedTask(db(), {
      somedayAt: daysAgo(8),
      somedayReason: "stale",
    });
    const keep = seedTask(db(), {
      somedayAt: daysAgo(9),
      somedayReason: "stale",
    });
    const recent = seedTask(db(), {
      somedayAt: daysAgo(2),
      somedayReason: "stale",
    });

    const listed = await listSomeday(USER, { now: NOW });
    expect(listed.cleanupCount).toBe(2);

    const result = await cleanupSomeday(USER, {
      keepTaskIds: [String(keep.id)],
      now: NOW,
    });

    expect(result.archived).toEqual([week.id]);
    expect(result.kept).toEqual([keep.id]);
    // Archived, still there; the kept and the recent one are untouched.
    expect(db().tables.task).toHaveLength(3);
    expect(taskOf(week.id)).toMatchObject({
      isArchived: true,
      somedayReason: "cleanup",
    });
    expect(taskOf(keep.id)?.isArchived).toBe(false);
    expect(taskOf(recent.id)?.isArchived).toBe(false);

    // And restorable.
    const archivedList = await listSomeday(USER, { archived: true, now: NOW });
    expect(archivedList.items.map((i) => i.id)).toEqual([week.id]);
    expect(await restoreSomeday(USER, [String(week.id)], NOW)).toEqual([
      week.id,
    ]);
    expect(taskOf(week.id)).toMatchObject({
      isArchived: false,
      somedayAt: null,
      lastTouchedAt: NOW,
    });
  });

  it("restore only touches the caller's own Someday tasks", async () => {
    db().insert("userSettings", { userId: OTHER, timeZone: "UTC" });
    const theirs = seedTask(db(), { userId: OTHER, somedayAt: daysAgo(3) });
    expect(await restoreSomeday(USER, [String(theirs.id)], NOW)).toEqual([]);
    expect(taskOf(theirs.id)?.somedayAt).not.toBeNull();
  });
});

describe("kill switch and launch gate", () => {
  it("test_someday_sweep_is_off_until_launch_migration", async () => {
    const stale = seedTask(db(), { createdAt: daysAgo(30) });

    // Flag row absent (the shipped state): the sweep does nothing.
    db().tables.featureFlag.length = 0;
    expect(await sweepSomeday(NOW)).toEqual({
      skipped: "flag_off",
      moved: 0,
      users: 0,
    });
    // day_plan on, someday_sweep off: still nothing.
    setFlags({ day_plan: true, someday_sweep: false });
    expect((await sweepSomeday(NOW)).skipped).toBe("flag_off");
    expect(taskOf(stale.id)?.somedayAt).toBeNull();
    expect(record).not.toHaveBeenCalled();

    // No shipped migration turns it on: comments aside, none mentions the key.
    const root = path.join(process.cwd(), "prisma", "migrations");
    for (const dir of readdirSync(root, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      const sql = readFileSync(
        path.join(root, dir.name, "migration.sql"),
        "utf8"
      )
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n");
      expect(`${dir.name}: ${sql.includes("someday_sweep")}`).toBe(
        `${dir.name}: false`
      );
    }
    // The job is registered, so turning the flag on is the only step left.
    const worker = readFileSync(
      path.join(process.cwd(), "src", "worker", "index.ts"),
      "utf8"
    );
    expect(worker).toContain('"someday-sweep"');
  });

  it("test_kill_switch_off_keeps_plan_data", async () => {
    const stale = seedTask(db(), { createdAt: daysAgo(30) });
    const planned = seedTask(db());
    seedPlan(db(), "2026-11-20", [String(planned.id)]);
    const plans = structuredClone([
      db().tables.dayPlan,
      db().tables.dayPlanItem,
    ]);

    setFlags({ day_plan: false, someday_sweep: true });
    expect((await sweepSomeday(NOW)).skipped).toBe("flag_off");

    expect(taskOf(stale.id)?.somedayAt).toBeNull();
    expect([db().tables.dayPlan, db().tables.dayPlanItem]).toEqual(plans);

    // Back on: the plan is as it was and the sweep works again.
    setFlags({ day_plan: true, someday_sweep: true });
    expect((await sweepSomeday(NOW)).moved).toBe(1);
    expect([db().tables.dayPlan, db().tables.dayPlanItem]).toEqual(plans);
  });

  it("a dry run counts and writes nothing", async () => {
    const stale = seedTask(db(), { createdAt: daysAgo(30) });
    const result = await sweepSomeday(NOW, { dryRun: true });
    expect(result.moved).toBe(1);
    expect(taskOf(stale.id)?.somedayAt).toBeNull();
    expect(record).not.toHaveBeenCalled();
  });
});
