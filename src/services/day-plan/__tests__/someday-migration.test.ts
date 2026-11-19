import { recordActivation } from "@/lib/activation-events";

import {
  main,
  parseArgs,
  runApply,
  runDryRun,
} from "../../../../scripts/someday-migration";
import {
  getSomedayMigration,
  moveTasksToSomeday,
  restoreSomedayMigration,
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

const mockState = { db: createDayPlanDb() };

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
jest.mock("@/lib/activation-events", () => ({
  recordActivation: jest.fn(),
  settleActivationEvents: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/feature-flags", () => ({
  dayPlanEnabled: async () => true,
  somedaySweepEnabled: async () => true,
}));

const record = recordActivation as jest.Mock;
const db = () => mockState.db;
const taskOf = (id: unknown) => db().tables.task.find((t) => t.id === id);

type Fn = (...args: unknown[]) => unknown;

/**
 * The fake client wrapped so every call is logged in order, with the raw SET
 * statement a real Postgres connection would receive.
 */
function loggedClient() {
  const order: string[] = [];
  const base = db().client as Record<string, unknown>;
  const client: Record<string, unknown> = new Proxy(base, {
    get(target, prop) {
      if (prop === "$transaction") {
        return (fn: Fn) => fn(client);
      }
      if (prop === "$executeRawUnsafe") {
        return async (sql: string) => {
          order.push(sql);
          return 0;
        };
      }
      if (prop === "$disconnect") return async () => undefined;
      const delegate = target[prop as string] as Record<string, Fn>;
      return new Proxy(delegate, {
        get:
          (d, method) =>
          (...args: unknown[]) => {
            order.push(`${String(prop)}.${String(method)}`);
            return d[method as string](...args);
          },
      });
    },
  });
  return { client: client as never, order };
}

/** A mix of stale tasks, protected ones and fresh ones, over two people. */
function seedMix() {
  db().insert("userSettings", { userId: USER, timeZone: "Europe/Zurich" });
  db().insert("userSettings", { userId: OTHER, timeZone: "Europe/Zurich" });
  seedFlags(db(), { day_plan: true, someday_sweep: true });
  seedTask(db(), { createdAt: daysAgo(30) });
  seedTask(db(), { createdAt: daysAgo(15) });
  seedTask(db(), { createdAt: daysAgo(40), userId: OTHER });
  // Kept out, one per rule.
  seedTask(db(), { createdAt: daysAgo(30), isRecurring: true });
  seedTask(db(), { createdAt: daysAgo(30), habitId: "habit-1" });
  seedTask(db(), { createdAt: daysAgo(30), isSample: true });
  seedTask(db(), { createdAt: daysAgo(30), isArchived: true });
  seedTask(db(), { createdAt: daysAgo(30), trashedAt: daysAgo(1) });
  seedTask(db(), { createdAt: daysAgo(30), status: "in_progress" });
  seedTask(db(), { createdAt: daysAgo(30), somedayAt: daysAgo(5) });
  seedTask(db(), { createdAt: daysAgo(30), dueDate: dayDate("2026-11-25") });
  const planned = seedTask(db(), { createdAt: daysAgo(30) });
  seedPlan(db(), "2026-11-19", [String(planned.id)], { status: "active" });
  // Not stale: nothing to count.
  seedTask(db(), { createdAt: daysAgo(30), lastTouchedAt: daysAgo(2) });
  seedTask(db(), { createdAt: daysAgo(5) });
}

beforeEach(() => {
  mockState.db = createDayPlanDb();
  (db().client as Record<string, unknown>).$disconnect = async () => undefined;
  record.mockReset();
});

describe("Someday launch migration", () => {
  it("test_dry_run_writes_nothing", async () => {
    seedMix();
    const before = JSON.stringify(db().tables);
    const { client } = loggedClient();

    const report = await runDryRun(client, NOW);

    expect(JSON.stringify(db().tables)).toBe(before);
    expect(record).not.toHaveBeenCalled();
    expect(report.wouldMove).toBe(3);
    expect(report.users).toBe(2);
    expect(report.distribution).toEqual({
      "1": 1,
      "2-5": 1,
      "6-20": 0,
      "21-100": 0,
      "100+": 0,
    });
    expect(report.largestPerUser).toBe(2);
    expect(report.excluded).toEqual({
      not_open: 1,
      archived: 1,
      trashed: 1,
      already_someday: 1,
      recurring: 1,
      habit: 1,
      sample: 1,
      open_plan: 1,
      near_deadline: 1,
    });
    // Numbers only: no id, title or email in what is printed.
    const printed = JSON.stringify(report);
    expect(printed).not.toContain(USER);
    expect(printed).not.toContain(OTHER);
    expect(printed).not.toContain("Task ");
    expect(printed).not.toContain("@");
  });

  it("test_dry_run_runs_in_read_only_transaction", async () => {
    seedMix();
    const { client, order } = loggedClient();

    await runDryRun(client, NOW);

    // The read-only setting is the very first thing the connection is told.
    expect(order[0]).toBe("SET TRANSACTION READ ONLY");
    expect(order.length).toBeGreaterThan(1);
    expect(
      order.filter((call) => call === "SET TRANSACTION READ ONLY")
    ).toHaveLength(1);
    // And nothing but reads follows it.
    for (const call of order.slice(1)) {
      expect(call).toMatch(/\.(findMany|findUnique|findFirst|count)$/);
    }
  });

  it("test_migration_is_idempotent", async () => {
    seedMix();
    const { client } = loggedClient();
    const options = { backupId: "backup-2026-11-19", batchSize: 2 };

    const first = await runApply(client, NOW, options);
    const second = await runApply(client, NOW, options);

    expect(first.moved).toBe(3);
    expect(first.users).toBe(2);
    expect(second.moved).toBe(0);
    expect(second.users).toBe(0);
    expect(db().tables.somedayMigrationMove).toHaveLength(3);
    const moved = db().tables.task.filter(
      (t) => t.somedayReason === "migration"
    );
    expect(moved).toHaveLength(3);
    expect(moved.every((t) => t.somedayAt instanceof Date)).toBe(true);
    expect(record).toHaveBeenCalledTimes(3);
    expect(record).toHaveBeenCalledWith("task_to_someday", USER, {
      reason: "migration",
    });
  });

  it("test_return_all_restores_only_migrated_tasks", async () => {
    seedMix();
    const byHand = seedTask(db(), { title: "Parked by me" });
    await moveTasksToSomeday(USER, [String(byHand.id)], {
      reason: "manual",
      now: daysAgo(1),
    });
    const { client } = loggedClient();
    await runApply(client, NOW, { backupId: "b", batchSize: 50 });

    expect(await getSomedayMigration(USER)).toEqual({
      moved: 2,
      restored: false,
    });
    const mine = db()
      .tables.somedayMigrationMove.filter((m) => m.userId === USER)
      .map((m) => String(m.taskId));

    const result = await restoreSomedayMigration(USER, NOW);

    expect(result).toEqual({ restored: 2 });
    for (const id of mine) {
      expect(taskOf(id)?.somedayAt).toBeNull();
      expect(taskOf(id)?.somedayReason).toBeNull();
    }
    // Parked by hand: untouched. Another person's migration: untouched.
    expect(taskOf(byHand.id)?.somedayAt).not.toBeNull();
    expect(taskOf(byHand.id)?.somedayReason).toBe("manual");
    const others = db().tables.somedayMigrationMove.filter(
      (m) => m.userId === OTHER
    );
    expect(others).toHaveLength(1);
    expect(taskOf(others[0].taskId)?.somedayAt).not.toBeNull();
    expect(others[0].restoredAt).toBeNull();
    expect(await getSomedayMigration(USER)).toEqual({
      moved: 2,
      restored: true,
    });

    // A task they later parked by hand is not pulled back by a second tap.
    await moveTasksToSomeday(USER, [mine[0]], { reason: "manual", now: NOW });
    expect(await restoreSomedayMigration(USER, NOW)).toEqual({ restored: 0 });
    expect(taskOf(mine[0])?.somedayAt).not.toBeNull();
  });

  it("test_apply_refuses_without_backup", async () => {
    seedMix();
    const before = JSON.stringify(db().tables);
    const { client } = loggedClient();
    const errors = jest.spyOn(console, "error").mockImplementation(() => {});
    const logs = jest.spyOn(console, "log").mockImplementation(() => {});

    await expect(
      runApply(client, NOW, { backupId: "  ", batchSize: 10 })
    ).rejects.toThrow(/backup-id/);
    expect(parseArgs(["--apply"]).backupId).toBeNull();
    expect(await main(["--apply"])).toBe(2);
    expect(await main(["--apply", "--backup-id", ""])).toBe(2);
    expect(await main(["--apply", "--dry-run"])).toBe(2);

    errors.mockRestore();
    logs.mockRestore();
    expect(JSON.stringify(db().tables)).toBe(before);
    expect(record).not.toHaveBeenCalled();
  });

  it("test_dry_run_matches_sweep_selection", async () => {
    seedMix();
    const dry = await runDryRun(loggedClient().client, NOW);
    const swept = await sweepSomeday(NOW, { dryRun: true });
    expect(dry.wouldMove).toBe(swept.moved);
    expect(dry.users).toBe(swept.users);

    // The same tasks, not just the same number.
    await sweepSomeday(NOW);
    const bySweep = db()
      .tables.task.filter((t) => t.somedayReason === "stale")
      .map((t) => t.id)
      .sort();

    mockState.db = createDayPlanDb();
    seedMix();
    await runApply(loggedClient().client, NOW, {
      backupId: "b",
      batchSize: 100,
    });
    const byMigration = db()
      .tables.task.filter((t) => t.somedayReason === "migration")
      .map((t) => t.id)
      .sort();
    expect(byMigration).toEqual(bySweep);
    expect(byMigration).toHaveLength(dry.wouldMove);
  });
});
