import type { ScheduleResult } from "@/services/scheduling/engine";

import { formatInTimeZone } from "@/lib/date-utils";
import { dayPlanEnabled } from "@/lib/feature-flags";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "DayPlanSchedulerGuard";

/**
 * Pure part: drops every block of a planned task that falls on a later local
 * day than its plan's date. `planDateByTask` maps task id to the plan's
 * `YYYY-MM-DD`. A block earlier on the same day, or on an earlier day, stays.
 */
export function dropBlocksPastPlanDate(
  result: ScheduleResult,
  planDateByTask: ReadonlyMap<string, string>,
  timeZone: string
): { result: ScheduleResult; dropped: string[] } {
  if (planDateByTask.size === 0) return { result, dropped: [] };
  const dropped = new Set<string>();
  const blocks = result.blocks.filter((block) => {
    const planDate = planDateByTask.get(block.taskId);
    if (!planDate) return true;
    const day = formatInTimeZone(block.start, timeZone, "yyyy-MM-dd");
    if (day <= planDate) return true;
    dropped.add(block.taskId);
    return false;
  });
  return { result: { ...result, blocks }, dropped: [...dropped] };
}

/**
 * Reschedule-on-miss must not carry a planned task into a later day while its
 * day plan is open (D4: nothing moves silently). While a plan is `active`, a
 * block placed after the plan's date is dropped, so the task is re-placed
 * within the day or left unscheduled; the person decides in the evening
 * review. Off with the `day_plan` kill switch; a failed read also means off,
 * so the scheduler behaves as it did before the plan existed.
 */
export async function guardActiveDayPlans(
  userId: string,
  timeZone: string,
  result: ScheduleResult
): Promise<ScheduleResult> {
  if (result.blocks.length === 0) return result;
  try {
    if (!(await dayPlanEnabled(userId))) return result;
    const items = await prisma.dayPlanItem.findMany({
      where: {
        resolution: null,
        taskId: {
          in: [...new Set(result.blocks.map((block) => block.taskId))],
        },
        plan: { userId, status: "active" },
      },
      select: { taskId: true, plan: { select: { date: true } } },
    });
    const planDateByTask = new Map<string, string>();
    for (const item of items) {
      const date = item.plan.date.toISOString().slice(0, 10);
      const known = planDateByTask.get(item.taskId);
      // A task on two open plans is bound by the earlier date.
      if (!known || date < known) planDateByTask.set(item.taskId, date);
    }
    const guarded = dropBlocksPastPlanDate(result, planDateByTask, timeZone);
    if (guarded.dropped.length > 0) {
      logger.info(
        "Kept planned tasks off later days",
        { userId, taskIds: guarded.dropped },
        LOG_SOURCE
      );
    }
    return guarded.result;
  } catch (error) {
    logger.warn(
      "Day plan guard skipped",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return result;
  }
}
