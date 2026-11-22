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
  taskSelect,
} from "./service";

const LOG_SOURCE = "easy-start-sweep";

/** Tasks looked at, and AI generations made, in one sweep. */
const SWEEP_TASK_PAGE = 200;
const SWEEP_MAX_REWRITES = 20;
const SWEEP_MAX_REWRITES_PER_USER = 3;
const SWEEP_USER_PAGE = 100;

/* ---------- the sweep ---------- */

export interface SweepResult {
  skipped: "flag_off" | null;
  rewritten: number;
  eased: number;
}

/**
 * The periodic job: stuck tasks are made smaller, overloaded days are eased.
 * With the kill switch off it reads one flag row and returns. Bounded per run:
 * a page of candidate tasks, a cap on AI generations in total and per person.
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
  const candidates = await prisma.task.findMany({
    where: {
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
      user: { NOT: settingsOff },
      AND: [
        { OR: [{ simplifiedAt: null }, { simplifiedAt: { lt: cooldown } }] },
        {
          OR: [
            { rescheduleCount: { gte: STUCK_RESCHEDULES } },
            { startDate: { lt: startCutoff } },
            { scheduledStart: { lt: startCutoff } },
          ],
        },
      ],
    },
    select: taskSelect,
    orderBy: { id: "asc" },
    take: SWEEP_TASK_PAGE,
  });

  let rewritten = 0;
  const perUser = new Map<string, number>();
  for (const task of candidates) {
    if (rewritten >= SWEEP_MAX_REWRITES) break;
    const userId = task.userId;
    if (!userId) continue;
    if ((perUser.get(userId) ?? 0) >= SWEEP_MAX_REWRITES_PER_USER) continue;
    const reason = stuckReason(
      { ...task, doneParts: task.parts.filter((p) => p.done).length },
      now
    );
    if (!reason) continue;
    try {
      const outcome = await simplifyTask({ taskId: task.id, reason, now });
      if (outcome.status === "simplified") {
        rewritten += 1;
        perUser.set(userId, (perUser.get(userId) ?? 0) + 1);
      }
    } catch (error) {
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

  // Only people with more than 6 open tasks in the next few days can have an
  // overloaded day, so one grouped read finds them.
  const crowded = await prisma.task.groupBy({
    by: ["userId"],
    where: {
      userId: { not: null },
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
  let eased = 0;
  for (const row of crowded) {
    if (!row.userId) continue;
    try {
      eased += (await balanceOverloadedDays(row.userId, now)).moved;
    } catch (error) {
      logger.warn(
        "Easy start day balance failed",
        {
          error: error instanceof Error ? error.message : String(error),
        },
        LOG_SOURCE
      );
    }
  }
  return { skipped: null, rewritten, eased };
}
