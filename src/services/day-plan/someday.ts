import { recordActivation } from "@/lib/activation-events";
import { newDate } from "@/lib/date-utils";
import { dayPlanEnabled, somedaySweepEnabled } from "@/lib/feature-flags";
import { DAY_PLAN, SOMEDAY_SWEEP } from "@/lib/feature-flags-keys";
import { normalizeUserTimeZone } from "@/lib/habit-completion-date";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import {
  type SomedayExclusion,
  cleanupCutoff,
  somedayExclusion,
  staleCutoff,
} from "./rules";

const LOG_SOURCE = "SomedaySweep";
const PAGE = 500;
const MAX_PAGES = 100;

/** Prisma client or a transaction of it: what `moveTasksToSomeday` writes with. */
type SomedayWriter = Pick<typeof prisma, "task" | "scheduledBlock">;

/**
 * The one way a task goes to Someday (evening review, the nightly sweep, the
 * API and any channel button). It sets `somedayAt` and clears the task's
 * schedule (`scheduledStart`/`scheduledEnd`) and deletes its ScheduledBlocks in
 * the same write, so a parked task also leaves the calendar. Pass the
 * transaction client to make it part of a larger transaction; without one it
 * runs in its own. Returns how many tasks moved (already-parked ones are left
 * as they are).
 */
export async function moveTasksToSomeday(
  userId: string,
  taskIds: string[],
  options: {
    reason: "review" | "stale" | "button" | "manual" | "migration";
    now: Date;
    touch?: boolean;
    tx?: SomedayWriter;
  }
): Promise<number> {
  if (taskIds.length === 0) return 0;
  const run = async (db: SomedayWriter) => {
    const { count } = await db.task.updateMany({
      where: { id: { in: taskIds }, userId, somedayAt: null },
      data: {
        somedayAt: options.now,
        somedayReason: options.reason,
        scheduledStart: null,
        scheduledEnd: null,
        scheduleScore: null,
        scheduleAtRisk: false,
        // A pinned or frozen task would stay out of auto-scheduling after a
        // restore, so the pin goes with the move.
        scheduleLocked: false,
        isFrozen: false,
        ...(options.touch ? { lastTouchedAt: options.now } : {}),
      },
    });
    await db.scheduledBlock.deleteMany({
      where: { userId, taskId: { in: taskIds } },
    });
    return count;
  };
  if (options.tx) return run(options.tx);
  return prisma.$transaction((tx) => run(tx as unknown as SomedayWriter));
}

export interface SweepResult {
  /** Why nothing ran, when nothing did. */
  skipped: "flag_off" | null;
  moved: number;
  users: number;
}

/** What the selection reads: the sweep passes the client, a dry run a read-only transaction. */
export type SomedayReader = Pick<
  typeof prisma,
  "task" | "dayPlanItem" | "userSettings"
>;

export interface ScanOptions {
  /** Skips people for whom this says no (the sweep's flag check). */
  isAllowed?: (userId: string) => Promise<boolean>;
  /**
   * Called with each person's selected task ids, page by page. Moving the
   * tasks is the caller's business; the scan itself never writes.
   */
  onUser: (userId: string, taskIds: string[]) => Promise<void>;
  /**
   * Also reads the open tasks the protection rules keep out, and counts them
   * per rule here. Same rules, wider read: used by the migration dry run.
   */
  excluded?: Partial<Record<SomedayExclusion, number>>;
}

/**
 * The one selection behind the nightly sweep and the launch migration: open
 * tasks untouched for 14 days that no protection rule keeps out
 * (`somedayExclusion`). It only reads.
 */
export async function scanSomedayCandidates(
  db: SomedayReader,
  now: Date,
  options: ScanOptions
): Promise<void> {
  const cutoff = staleCutoff(now);
  const allowed = new Map<string, boolean>();
  const zones = new Map<string, string>();
  const wide = Boolean(options.excluded);
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const rows = await db.task.findMany({
      where: {
        userId: { not: null },
        // The wide read adds in-progress tasks so the dry run can count them.
        status: wide ? { in: ["todo", "in_progress"] } : "todo",
        createdAt: { lt: cutoff },
        OR: [{ lastTouchedAt: null }, { lastTouchedAt: { lt: cutoff } }],
        ...(wide
          ? {}
          : {
              isArchived: false,
              trashedAt: null,
              somedayAt: null,
              isRecurring: false,
              recurrenceMasterId: null,
              habitId: null,
              isSample: false,
            }),
      },
      select: {
        id: true,
        userId: true,
        status: true,
        isArchived: true,
        trashedAt: true,
        somedayAt: true,
        isRecurring: true,
        recurrenceMasterId: true,
        habitId: true,
        isSample: true,
        dueDate: true,
        deadline: true,
        lastTouchedAt: true,
        createdAt: true,
        activities: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
      orderBy: { id: "asc" },
      take: PAGE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;

    const inOpenPlan = new Set(
      (
        await db.dayPlanItem.findMany({
          where: {
            taskId: { in: rows.map((row) => row.id) },
            plan: { status: { in: ["draft", "active"] } },
          },
          select: { taskId: true },
        })
      ).map((item) => item.taskId)
    );

    const byUser = new Map<string, string[]>();
    for (const row of rows) {
      const userId = row.userId;
      if (!userId) continue;
      if (!allowed.has(userId)) {
        allowed.set(
          userId,
          options.isAllowed ? await options.isAllowed(userId) : true
        );
      }
      if (!allowed.get(userId)) continue;
      if (!zones.has(userId)) {
        const settings = await db.userSettings.findUnique({
          where: { userId },
          select: { timeZone: true },
        });
        zones.set(userId, normalizeUserTimeZone(settings?.timeZone));
      }
      const reason = somedayExclusion(
        {
          ...row,
          lastActivityAt: row.activities[0]?.createdAt ?? null,
          inOpenPlan: inOpenPlan.has(row.id),
        },
        now,
        zones.get(userId) as string
      );
      if (reason === null) {
        byUser.set(userId, [...(byUser.get(userId) ?? []), row.id]);
      } else if (options.excluded && reason !== "fresh") {
        options.excluded[reason] = (options.excluded[reason] ?? 0) + 1;
      }
    }

    for (const [userId, ids] of byUser) await options.onUser(userId, ids);
    if (rows.length < PAGE) break;
  }
}

/**
 * Cheap pre-check, one row per flag: a flag with no row, or switched off with
 * no per-person override that is on, cannot be on for anybody. Off costs two
 * reads and no task query.
 */
async function flagMayBeOn(key: string): Promise<boolean> {
  const flag = await prisma.featureFlag.findUnique({
    where: { key },
    select: {
      enabled: true,
      overrides: {
        where: { enabled: true },
        select: { userId: true },
        take: 1,
      },
    },
  });
  return Boolean(flag && (flag.enabled || flag.overrides.length > 0));
}

/**
 * The nightly Someday sweep: every open task nobody touched for 14 days moves
 * to Someday, with the same protections the launch migration uses. It does
 * nothing unless both `day_plan` and `someday_sweep` are on for the person;
 * `someday_sweep` ships off, so the registered job is a no-op until the launch
 * migration turns it on. `dryRun` counts and writes nothing.
 */
export async function sweepSomeday(
  now: Date = newDate(),
  options: { dryRun?: boolean } = {}
): Promise<SweepResult> {
  if (!(await flagMayBeOn(DAY_PLAN)) || !(await flagMayBeOn(SOMEDAY_SWEEP))) {
    return { skipped: "flag_off", moved: 0, users: 0 };
  }

  const movedUsers = new Set<string>();
  let moved = 0;
  await scanSomedayCandidates(prisma, now, {
    isAllowed: async (userId) =>
      (await dayPlanEnabled(userId)) && (await somedaySweepEnabled(userId)),
    onUser: async (userId, ids) => {
      if (!options.dryRun) {
        await moveTasksToSomeday(userId, ids, { reason: "stale", now });
        for (let i = 0; i < ids.length; i += 1) {
          recordActivation("task_to_someday", userId, { reason: "stale" });
        }
      }
      moved += ids.length;
      movedUsers.add(userId);
    },
  });

  logger.info(
    "Someday sweep finished",
    { moved, users: movedUsers.size, dryRun: Boolean(options.dryRun) },
    LOG_SOURCE
  );
  return { skipped: null, moved, users: movedUsers.size };
}

/** Returns Someday tasks to the normal lists; they count as touched now. */
export async function restoreSomeday(
  userId: string,
  taskIds: string[],
  now: Date = newDate()
): Promise<string[]> {
  if (taskIds.length === 0) return [];
  const rows = await prisma.task.findMany({
    where: { id: { in: taskIds }, userId, somedayAt: { not: null } },
    select: { id: true, somedayReason: true },
  });
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  // Only what the weekly cleanup archived is un-archived; a task the person
  // archived themselves stays archived.
  const cleaned = rows
    .filter((row) => row.somedayReason === "cleanup")
    .map((row) => row.id);
  const rest = ids.filter((id) => !cleaned.includes(id));
  const base = {
    somedayAt: null,
    somedayReason: null,
    lastTouchedAt: now,
  };
  if (cleaned.length > 0) {
    await prisma.task.updateMany({
      where: { id: { in: cleaned }, userId },
      data: { ...base, isArchived: false, archivedAt: null },
    });
  }
  if (rest.length > 0) {
    await prisma.task.updateMany({
      where: { id: { in: rest }, userId },
      data: base,
    });
  }
  await prisma.somedayMigrationMove.updateMany({
    where: { userId, taskId: { in: ids }, restoredAt: null },
    data: { restoredAt: now },
  });
  return ids;
}

export interface SomedayItem {
  id: string;
  title: string;
  somedayAt: string;
  reason: string | null;
  /** In Someday for at least a week: offered by the weekly cleanup. */
  cleanupDue: boolean;
}

export async function listSomeday(
  userId: string,
  options: { archived?: boolean; now?: Date } = {}
): Promise<{ items: SomedayItem[]; cleanupCount: number }> {
  const now = options.now ?? newDate();
  const cutoff = cleanupCutoff(now);
  const rows = await prisma.task.findMany({
    where: {
      userId,
      somedayAt: { not: null },
      isArchived: Boolean(options.archived),
      trashedAt: null,
      status: "todo",
    },
    orderBy: { somedayAt: "desc" },
    take: 500,
    select: { id: true, title: true, somedayAt: true, somedayReason: true },
  });
  const items = rows.flatMap((row) =>
    row.somedayAt
      ? [
          {
            id: row.id,
            title: row.title,
            somedayAt: row.somedayAt.toISOString(),
            reason: row.somedayReason,
            cleanupDue: !options.archived && row.somedayAt <= cutoff,
          },
        ]
      : []
  );
  return {
    items,
    cleanupCount: items.filter((item) => item.cleanupDue).length,
  };
}

/**
 * The weekly one-tap cleanup: Someday tasks that have been there for a week are
 * archived, not deleted, and can be restored. `keepTaskIds` are the per-task
 * overrides.
 */
export async function cleanupSomeday(
  userId: string,
  options: { keepTaskIds?: string[]; now?: Date } = {}
): Promise<{ archived: string[]; kept: string[] }> {
  const now = options.now ?? newDate();
  const keep = new Set(options.keepTaskIds ?? []);
  const rows = await prisma.task.findMany({
    where: {
      userId,
      somedayAt: { not: null, lte: cleanupCutoff(now) },
      isArchived: false,
      trashedAt: null,
      status: "todo",
    },
    select: { id: true },
    take: 1_000,
  });
  const archived = rows.map((row) => row.id).filter((id) => !keep.has(id));
  const kept = rows.map((row) => row.id).filter((id) => keep.has(id));
  if (archived.length > 0) {
    await prisma.task.updateMany({
      where: { id: { in: archived }, userId },
      data: { isArchived: true, archivedAt: now, somedayReason: "cleanup" },
    });
  }
  return { archived, kept };
}

/** What the migration did for one person: how many tasks, and whether they came back. */
export async function getSomedayMigration(
  userId: string
): Promise<{ moved: number; restored: boolean }> {
  const [moved, open] = await Promise.all([
    prisma.somedayMigrationMove.count({ where: { userId } }),
    prisma.somedayMigrationMove.count({ where: { userId, restoredAt: null } }),
  ]);
  return { moved, restored: moved > 0 && open === 0 };
}

/**
 * "Return all": restores exactly the tasks the launch migration moved for this
 * person and has not been restored yet. A task is only returned while it is
 * still in Someday for the migration reason, so one the person parked by hand
 * is never touched. Afterwards every move row counts as restored, so the
 * screen is not shown again.
 */
export async function restoreSomedayMigration(
  userId: string,
  now: Date = newDate()
): Promise<{ restored: number }> {
  const moves = await prisma.somedayMigrationMove.findMany({
    where: { userId, restoredAt: null },
    select: { taskId: true },
  });
  const taskIds = moves.map((move) => move.taskId);
  let restored = 0;
  for (let i = 0; i < taskIds.length; i += PAGE) {
    const rows = await prisma.task.findMany({
      where: {
        id: { in: taskIds.slice(i, i + PAGE) },
        userId,
        somedayAt: { not: null },
        somedayReason: "migration",
      },
      select: { id: true },
    });
    restored += (
      await restoreSomeday(
        userId,
        rows.map((row) => row.id),
        now
      )
    ).length;
  }
  await prisma.somedayMigrationMove.updateMany({
    where: { userId, restoredAt: null },
    data: { restoredAt: now },
  });
  return { restored };
}
