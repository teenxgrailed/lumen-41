import type { Prisma } from "@prisma/client";

import { addCalendarDays, newDate } from "@/lib/date-utils";
import { ALWAYS_EASY_START } from "@/lib/feature-flags-keys";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import {
  BALANCE_DAYS,
  COOLDOWN_DAYS,
  DAY_TASK_LIMIT,
  STUCK_RESCHEDULES,
  STUCK_START_DAYS,
  stuckReason,
} from "./rules";
import {
  balanceOverloadedDays,
  settingsOff,
  simplifyTask,
  stampLookedAt,
  taskSelect,
} from "./service";

const LOG_SOURCE = "easy-start-sweep";

/** Tasks read per page, pages per run, and AI generations per run. */
const SWEEP_TASK_PAGE = 200;
const SWEEP_MAX_PAGES = 10;
const SWEEP_MAX_REWRITES = 20;
const SWEEP_MAX_REWRITES_PER_USER = 3;
/** People looked at for crowded days per page, and pages per run. */
const SWEEP_USER_PAGE = 100;
const SWEEP_USER_MAX_PAGES = 3;

/**
 * Where the crowded-day scan resumes. It lives in the worker's memory and
 * rotates through every account over successive runs (a restart simply starts
 * again from the first), so no account is starved by the ones before it.
 */
let crowdedCursor: string | undefined;

/** For tests: start the crowded-day scan from the beginning. */
export function resetSweepCursor() {
  crowdedCursor = undefined;
}

/* ---------- the sweep ---------- */

export interface SweepResult {
  skipped: "flag_off" | null;
  rewritten: number;
  eased: number;
}

/**
 * The periodic job: stuck tasks are made smaller, overloaded days are eased.
 * With the kill switch off it reads one flag row and returns. Bounded per run:
 * pages of candidate tasks, a cap on AI generations in total and per person.
 *
 * Every candidate that is examined and not rewritten is stamped
 * (`simplifiedAt`), so a task that can never be changed (touched, in an
 * archived or excluded project, already on the fixed entry) leaves the
 * candidate set instead of being read again on every run. Only a task skipped
 * for a cap is left as it was, and the page cursor moves on past it, so one
 * busy account cannot hide everyone behind it.
 */
export async function runEasyStartSweep(
  now: Date = newDate()
): Promise<SweepResult> {
  const flag = await prisma.featureFlag.findUnique({
    where: { key: ALWAYS_EASY_START },
    select: { enabled: true },
  });
  if (!flag?.enabled) return { skipped: "flag_off", rewritten: 0, eased: 0 };

  const cooldown = addCalendarDays(now, -COOLDOWN_DAYS);
  const startCutoff = addCalendarDays(now, -STUCK_START_DAYS);
  const candidateWhere: Prisma.TaskWhereInput = {
    userId: { not: null },
    status: "todo",
    isArchived: false,
    trashedAt: null,
    somedayAt: null,
    isSample: false,
    isRecurring: false,
    recurrenceMasterId: null,
    habitId: null,
    externalTaskId: null,
    // A ticked subtask means the person has started.
    parts: { none: { done: true } },
    user: { NOT: settingsOff },
    AND: [
      { OR: [{ simplifiedAt: null }, { simplifiedAt: { lt: cooldown } }] },
      {
        OR: [
          { rescheduleCount: { gte: STUCK_RESCHEDULES } },
          // Not started: nothing touched it since (a column-to-column compare
          // is not possible here; `stuckReason` does the exact one).
          {
            OR: [
              { startDate: { lt: startCutoff } },
              { scheduledStart: { lt: startCutoff } },
            ],
            AND: [
              {
                OR: [
                  { lastTouchedAt: null },
                  { lastTouchedAt: { lt: startCutoff } },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  let rewritten = 0;
  const perUser = new Map<string, number>();
  let cursor: string | undefined;
  scan: for (let page = 0; page < SWEEP_MAX_PAGES; page += 1) {
    const candidates = await prisma.task.findMany({
      where: { ...candidateWhere, ...(cursor ? { id: { gt: cursor } } : {}) },
      select: taskSelect,
      orderBy: { id: "asc" },
      take: SWEEP_TASK_PAGE,
    });
    if (candidates.length === 0) break;
    cursor = candidates[candidates.length - 1].id;

    for (const task of candidates) {
      if (rewritten >= SWEEP_MAX_REWRITES) break scan;
      const userId = task.userId;
      if (!userId) continue;
      if ((perUser.get(userId) ?? 0) >= SWEEP_MAX_REWRITES_PER_USER) continue;
      const reason = stuckReason(
        { ...task, doneParts: task.parts.filter((p) => p.done).length },
        now
      );
      if (!reason) {
        await stampLookedAt(task, now);
        continue;
      }
      try {
        const outcome = await simplifyTask({ taskId: task.id, reason, now });
        if (outcome.status === "simplified" || outcome.status === "proposed") {
          rewritten += 1;
          perUser.set(userId, (perUser.get(userId) ?? 0) + 1);
        }
      } catch (error) {
        // Leave the set too: a task that throws would otherwise throw on
        // every run.
        await stampLookedAt(task, now);
        logger.warn(
          "Easy start rewrite failed",
          {
            taskId: task.id,
            error: error instanceof Error ? error.message : String(error),
          },
          LOG_SOURCE
        );
      }
    }
    if (candidates.length < SWEEP_TASK_PAGE) break;
  }

  // Only people with more than 6 open tasks in the next few days can have an
  // overloaded day, so a grouped read finds them, a page at a time from where
  // the last run stopped.
  const eased = await easeCrowdedDays(now);
  return { skipped: null, rewritten, eased };
}

async function easeCrowdedDays(now: Date): Promise<number> {
  let eased = 0;
  for (let page = 0; page < SWEEP_USER_MAX_PAGES; page += 1) {
    const crowded = await prisma.task.groupBy({
      by: ["userId"],
      where: {
        userId: crowdedCursor ? { gt: crowdedCursor } : { not: null },
        isArchived: false,
        trashedAt: null,
        somedayAt: null,
        noSlot: false,
        isSample: false,
        status: { in: ["todo", "in_progress"] },
        user: { NOT: settingsOff },
        OR: [
          {
            dueDate: {
              gte: addCalendarDays(now, -1),
              lt: addCalendarDays(now, BALANCE_DAYS + 1),
            },
          },
          {
            scheduledStart: {
              gte: addCalendarDays(now, -1),
              lt: addCalendarDays(now, BALANCE_DAYS + 1),
            },
          },
        ],
      },
      orderBy: { userId: "asc" },
      having: { userId: { _count: { gt: DAY_TASK_LIMIT } } },
      take: SWEEP_USER_PAGE,
    });
    for (const row of crowded) {
      if (!row.userId) continue;
      try {
        eased += (await balanceOverloadedDays(row.userId, now)).moved;
      } catch (error) {
        logger.warn(
          "Easy start day balance failed",
          { error: error instanceof Error ? error.message : String(error) },
          LOG_SOURCE
        );
      }
    }
    if (crowded.length < SWEEP_USER_PAGE) {
      // The end of the list: the next run starts again from the first account.
      crowdedCursor = undefined;
      break;
    }
    crowdedCursor = crowded[crowded.length - 1].userId ?? undefined;
  }
  return eased;
}
