import { recordActivation } from "@/lib/activation-events";
import { dayPlanEnabled } from "@/lib/feature-flags";

import {
  main,
  parseArgs,
  runApply,
  runDryRun,
} from "../../../../scripts/someday-migration";
import {
  cleanupSomeday,
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
  dayPlanEnabled: jest.fn(async () => true),
  somedaySweepEnabled: async () => true,
}));

const record = recordActivation as jest.Mock;
const flagOn = dayPlanEnabled as jest.Mock;
const BACKUP = "backup-2026-11-19";
const db = () => mockState.db;
const taskOf = (id: unknown) => db().tables.task.find((t) => t.id === id);

type Fn = (...args: unknown[]) => unknown;

/**
 * The fake client wrapped so every call is logged in order, with the raw SET
 * statement a real Postgres connection would receive.
 */
const readOnly = { value: "on" };

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
      if (prop === "$queryRawUnsafe") {
        return async (sql: string) => {
          order.push(sql);
          return [{ ro: readOnly.value }];
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
  flagOn.mockReset();
  flagOn.mockResolvedValue(true);
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
      pinned: 0,
      future_scheduled: 0,
    });
    // Numbers only: no id, title or email in what is printed.
    const printed = JSON.stringify(report);
    expect(printed).not.toContain(USER);
    expect(printed).not.toContain(OTHER);
    expect(printed).not.toContain("Task ");
    expect(printed).not.toContain("@");
  });

  it("test_dry_run_stops_when_transaction_is_not_read_only", async () => {
    seedMix();
    const { client, order } = loggedClient();
    readOnly.value = "off";
    try {
      await expect(runDryRun(client, NOW)).rejects.toThrow(
        "transaction is not read-only"
      );
      expect(
        order.some((call) =>
          /\.(findMany|findUnique|findFirst|count)$/.test(call)
        )
      ).toBe(false);
    } finally {
      readOnly.value = "on";
    }
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
    expect(order[1]).toBe("SET LOCAL lock_timeout = '5s'");
    expect(order[2]).toBe("SET LOCAL statement_timeout = '120s'");
    expect(order[3]).toBe(
      "SELECT current_setting('transaction_read_only') AS ro"
    );
    for (const call of order.slice(4)) {
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
    // One awaited event per person, with the count.
    expect(record).toHaveBeenCalledTimes(2);
    expect(record).toHaveBeenCalledWith("task_to_someday", USER, {
      reason: "migration",
      count: 2,
    });
    expect(record).toHaveBeenCalledWith("task_to_someday", OTHER, {
      reason: "migration",
      count: 1,
    });
    expect(
      db().tables.somedayMigrationMove.every((m) => m.backupId === BACKUP)
    ).toBe(true);
  });

  it("test_return_all_restores_only_migrated_tasks", async () => {
    seedMix();
    const byHand = seedTask(db(), { title: "Parked by me" });
    await moveTasksToSomeday(USER, [String(byHand.id)], {
      reason: "manual",
      now: daysAgo(1),
    });
    const { client } = loggedClient();
    await runApply(client, NOW, { backupId: BACKUP, batchSize: 50 });

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
      backupId: BACKUP,
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

describe("Someday launch migration: review fixes", () => {
  it("test_dry_run_count_equals_apply_count_past_one_page", async () => {
    db().insert("userSettings", { userId: USER, timeZone: "Europe/Zurich" });
    seedFlags(db(), { day_plan: true, someday_sweep: true });
    for (let i = 0; i < 7; i += 1) seedTask(db(), { createdAt: daysAgo(30) });
    // In-progress rows are read wide by the dry run: they must not use up
    // pages the apply read never sees.
    for (let i = 0; i < 5; i += 1) {
      seedTask(db(), { createdAt: daysAgo(30), status: "in_progress" });
    }
    const limits = { pageSize: 2 };

    const dry = await runDryRun(loggedClient().client, NOW, limits);
    const applied = await runApply(loggedClient().client, NOW, {
      backupId: BACKUP,
      batchSize: 3,
      ...limits,
    });

    expect(dry.truncated).toBe(false);
    expect(applied.truncated).toBe(false);
    expect(dry.wouldMove).toBe(7);
    expect(applied.moved).toBe(dry.wouldMove);
    expect(
      db().tables.task.filter((t) => t.somedayReason === "migration")
    ).toHaveLength(7);

    // A cap that is hit is reported, not hidden.
    mockState.db = createDayPlanDb();
    db().insert("userSettings", { userId: USER, timeZone: "Europe/Zurich" });
    for (let i = 0; i < 7; i += 1) seedTask(db(), { createdAt: daysAgo(30) });
    const capped = await runDryRun(loggedClient().client, NOW, {
      pageSize: 2,
      maxPages: 2,
    });
    expect(capped.truncated).toBe(true);
    expect(capped.wouldMove).toBe(4);
  });

  it("test_return_all_restores_task_archived_by_cleanup", async () => {
    seedMix();
    await runApply(loggedClient().client, NOW, {
      backupId: BACKUP,
      batchSize: 50,
    });
    const mine = db()
      .tables.somedayMigrationMove.filter((m) => m.userId === USER)
      .map((m) => String(m.taskId));
    // Two weeks later the weekly cleanup archives what is still in Someday.
    const later = new Date(NOW.getTime() + 14 * 86_400_000);
    const cleaned = await cleanupSomeday(USER, { now: later });
    expect(cleaned.archived).toEqual(expect.arrayContaining(mine));
    expect(taskOf(mine[0])?.isArchived).toBe(true);
    expect(taskOf(mine[0])?.somedayReason).toBe("cleanup");

    const result = await restoreSomedayMigration(USER, later);

    expect(result).toEqual({ restored: 2 });
    for (const id of mine) {
      expect(taskOf(id)?.somedayAt).toBeNull();
      expect(taskOf(id)?.isArchived).toBe(false);
      expect(taskOf(id)?.archivedAt).toBeNull();
    }
    expect(await getSomedayMigration(USER)).toEqual({
      moved: 2,
      restored: true,
    });
  });

  it("test_return_all_ignores_rows_added_after_read", async () => {
    seedMix();
    await runApply(loggedClient().client, NOW, {
      backupId: BACKUP,
      batchSize: 50,
    });
    const late = seedTask(db(), { title: "Moved after the read" });
    await moveTasksToSomeday(USER, [String(late.id)], {
      reason: "migration",
      now: NOW,
    });
    // A second batch lands for this person between the read and the final write.
    const moves = (db().client as Record<string, Record<string, Fn>>)
      .somedayMigrationMove;
    const realFindMany = moves.findMany;
    moves.findMany = async (...args: unknown[]) => {
      const rows = await realFindMany(...args);
      db().insert("somedayMigrationMove", {
        userId: USER,
        taskId: late.id,
        batch: "migration-later",
      });
      return rows;
    };

    const result = await restoreSomedayMigration(USER, NOW);

    moves.findMany = realFindMany;
    expect(result).toEqual({ restored: 2 });
    const added = db().tables.somedayMigrationMove.find(
      (m) => m.batch === "migration-later"
    );
    expect(added?.restoredAt).toBeNull();
    expect(taskOf(late.id)?.somedayAt).not.toBeNull();
  });

  it("test_pinned_or_future_scheduled_task_is_not_migrated", async () => {
    db().insert("userSettings", { userId: USER, timeZone: "Europe/Zurich" });
    const plain = seedTask(db(), { createdAt: daysAgo(30) });
    const pinned = seedTask(db(), {
      createdAt: daysAgo(30),
      scheduleLocked: true,
    });
    const frozen = seedTask(db(), { createdAt: daysAgo(30), isFrozen: true });
    const future = seedTask(db(), {
      createdAt: daysAgo(30),
      scheduledStart: new Date(NOW.getTime() + 3_600_000),
    });
    const past = seedTask(db(), {
      createdAt: daysAgo(30),
      scheduledStart: new Date(NOW.getTime() - 3_600_000),
    });

    const dry = await runDryRun(loggedClient().client, NOW);
    expect(dry.wouldMove).toBe(2);
    expect(dry.excluded.pinned).toBe(2);
    expect(dry.excluded.future_scheduled).toBe(1);

    const applied = await runApply(loggedClient().client, NOW, {
      backupId: BACKUP,
      batchSize: 10,
    });
    expect(applied.moved).toBe(2);
    expect(taskOf(plain.id)?.somedayAt).not.toBeNull();
    expect(taskOf(past.id)?.somedayAt).not.toBeNull();
    for (const kept of [pinned, frozen, future]) {
      expect(taskOf(kept.id)?.somedayAt).toBeNull();
    }
    expect(taskOf(pinned.id)?.scheduleLocked).toBe(true);
    expect(taskOf(future.id)?.scheduledStart).not.toBeNull();
  });

  it("test_user_with_day_plan_off_is_not_migrated", async () => {
    seedMix();
    flagOn.mockImplementation(async (userId: string) => userId !== OTHER);

    const dry = await runDryRun(loggedClient().client, NOW);
    expect(dry.wouldMove).toBe(2);
    expect(dry.users).toBe(1);

    const applied = await runApply(loggedClient().client, NOW, {
      backupId: BACKUP,
      batchSize: 10,
    });
    expect(applied.moved).toBe(dry.wouldMove);
    const others = db().tables.task.filter((t) => t.userId === OTHER);
    expect(others.every((t) => t.somedayAt === null)).toBe(true);
    expect(
      db().tables.somedayMigrationMove.every((m) => m.userId === USER)
    ).toBe(true);
  });

  it("test_apply_refuses_backup_not_from_today", async () => {
    seedMix();
    const before = JSON.stringify(db().tables);
    const errors = jest.spyOn(console, "error").mockImplementation(() => {});
    const logs = jest.spyOn(console, "log").mockImplementation(() => {});
    const { client } = loggedClient();

    for (const old of [
      "backup-2026-11-18",
      "backup-20261118",
      "a1b2c3d4-uuid",
      "x120261119",
    ]) {
      await expect(
        runApply(client, NOW, { backupId: old, batchSize: 10 })
      ).rejects.toThrow(/today/);
      expect(
        await main(["--apply", "--backup-id", old], {
          client: client as never,
          now: NOW,
        })
      ).toBe(2);
    }
    // A wrong date does not rescue an undated id.
    expect(
      await main(
        ["--apply", "--backup-id", "uuid-1", "--backup-date", "2026-11-18"],
        { client: client as never, now: NOW }
      )
    ).toBe(2);
    expect(JSON.stringify(db().tables)).toBe(before);
    expect(record).not.toHaveBeenCalled();

    // Today's date in the id, either form, or --backup-date: accepted.
    const ok = await runApply(client, NOW, {
      backupId: "coolify-20261119-0100",
      batchSize: 10,
    });
    expect(ok.moved).toBeGreaterThan(0);
    mockState.db = createDayPlanDb();
    seedMix();
    const viaDate = await main(
      ["--apply", "--backup-id", "uuid-1", "--backup-date", "2026-11-19"],
      { client: loggedClient().client as never, now: NOW }
    );
    expect(viaDate).toBe(0);
    expect(
      db().tables.somedayMigrationMove.every((m) => m.backupId === "uuid-1")
    ).toBe(true);
    errors.mockRestore();
    logs.mockRestore();
  });

  it("test_script_errors_print_no_ids", async () => {
    seedMix();
    const errors = jest.spyOn(console, "error").mockImplementation(() => {});
    const logs = jest.spyOn(console, "log").mockImplementation(() => {});
    const boom = Object.assign(
      new Error(`Invalid query for ${USER} task-1 secret@example.com`),
      { name: "PrismaClientKnownRequestError", code: "P2010" }
    );
    const failing = {
      $transaction: async () => {
        throw boom;
      },
      $disconnect: async () => undefined,
    };

    expect(await main([], { client: failing as never, now: NOW })).toBe(1);
    expect(
      await main(["--apply", "--backup-id", BACKUP], {
        client: failing as never,
        now: NOW,
      })
    ).toBe(1);

    const printed = [...errors.mock.calls, ...logs.mock.calls]
      .flat()
      .map(String)
      .join("\n");
    errors.mockRestore();
    logs.mockRestore();
    expect(printed).toContain("PrismaClientKnownRequestError (P2010)");
    expect(printed).not.toContain(USER);
    expect(printed).not.toContain("task-1");
    expect(printed).not.toContain("secret@example.com");
    expect(printed).not.toContain("Invalid query");
  });
});
