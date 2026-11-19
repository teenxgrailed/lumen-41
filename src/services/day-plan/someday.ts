import { recordActivation } from "@/lib/activation-events";
import { newDate } from "@/lib/date-utils";
import { dayPlanEnabled, somedaySweepEnabled } from "@/lib/feature-flags";
import { DAY_PLAN, SOMEDAY_SWEEP } from "@/lib/feature-flags-keys";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { cleanupCutoff, isSomedayCandidate, staleCutoff } from "./rules";
import { userTimeZone } from "./settings";

const LOG_SOURCE = "SomedaySweep";
const PAGE = 500;
const MAX_PAGES = 100;

export interface SweepResult {
  /** Why nothing ran, when nothing did. */
  skipped: "flag_off" | null;
  moved: number;
  users: number;
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

  const cutoff = staleCutoff(now);
  const allowed = new Map<string, boolean>();
  const zones = new Map<string, string>();
  const movedUsers = new Set<string>();
  let moved = 0;
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const rows = await prisma.task.findMany({
      where: {
        userId: { not: null },
        status: "todo",
        isArchived: false,
        trashedAt: null,
        somedayAt: null,
        isRecurring: false,
        recurrenceMasterId: null,
        habitId: null,
        isSample: false,
        createdAt: { lt: cutoff },
        OR: [{ lastTouchedAt: null }, { lastTouchedAt: { lt: cutoff } }],
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
        await prisma.dayPlanItem.findMany({
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
          (await dayPlanEnabled(userId)) && (await somedaySweepEnabled(userId))
        );
      }
      if (!allowed.get(userId)) continue;
      if (!zones.has(userId)) zones.set(userId, await userTimeZone(userId));
      const stale = isSomedayCandidate(
        {
          ...row,
          lastActivityAt: row.activities[0]?.createdAt ?? null,
          inOpenPlan: inOpenPlan.has(row.id),
        },
        now,
        zones.get(userId) as string
      );
      if (!stale) continue;
      byUser.set(userId, [...(byUser.get(userId) ?? []), row.id]);
    }

    for (const [userId, ids] of byUser) {
      if (!options.dryRun) {
        await prisma.task.updateMany({
          where: { id: { in: ids }, userId, somedayAt: null },
          data: { somedayAt: now, somedayReason: "stale" },
        });
        for (let i = 0; i < ids.length; i += 1) {
          recordActivation("task_to_someday", userId, { reason: "stale" });
        }
      }
      moved += ids.length;
      movedUsers.add(userId);
    }
    if (rows.length < PAGE) break;
  }

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
