import { runOp } from "@/services/ops";
import { userTimeZone } from "@/services/ops/helpers";

import type { WorkspaceAccess } from "@/lib/auth/workspace-auth";
import { workspaceDataScopeWhere } from "@/lib/auth/workspace-auth";
import { formatInTimeZone, newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

/**
 * PLAN MY DAY, server side.
 *
 * One run of the real scheduler (`schedule.auto`): it reads the open tasks
 * (due dates, deadlines, priority, estimates, dependencies and project
 * blockers), the calendar's events and the per-day working hours with their
 * breaks, and places what has no time yet into the free slots. It is recorded
 * as one AgentAction with an inverse, so one Undo puts every task back. This
 * module adds only what a person needs to see afterwards: where each task
 * landed, and what did not fit.
 */

export interface PlanChange {
  taskId: string;
  title: string;
  fromStart: string | null;
  toStart: string | null;
  fromEnd: string | null;
  toEnd: string | null;
}

export interface PlannedItem {
  taskId: string;
  title: string;
  /** "Today", "Tomorrow" or "Mon 20 Oct", in the person's time zone. */
  day: string;
  /** "09:30–10:15". */
  time: string;
  /** The task already had a slot and the plan moved it. */
  moved: boolean;
}

export interface PlanSummary {
  placed: number;
  moved: number;
  unplaced: Array<{ taskId: string; title: string }>;
  items: PlannedItem[];
  headline: string;
}

export interface PlanDayResult extends PlanSummary {
  actionId: string | null;
  undoable: boolean;
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** What a set of scheduler changes amounts to, in the person's words. */
export function summarizePlan(input: {
  changes: PlanChange[];
  unplaced: Array<{ taskId: string; title: string }>;
  timeZone: string;
  now?: Date;
}): PlanSummary {
  const now = input.now ?? newDate();
  const dayKey = (date: Date) =>
    formatInTimeZone(date, input.timeZone, "yyyy-MM-dd");
  const today = dayKey(now);
  const tomorrow = dayKey(newDate(now.getTime() + 24 * 3_600_000));

  const items: PlannedItem[] = input.changes
    .filter((change) => change.toStart && change.toEnd)
    .sort(
      (a, b) =>
        newDate(a.toStart as string).getTime() -
        newDate(b.toStart as string).getTime()
    )
    .map((change) => {
      const start = newDate(change.toStart as string);
      const end = newDate(change.toEnd as string);
      const key = dayKey(start);
      return {
        taskId: change.taskId,
        title: change.title,
        day:
          key === today
            ? "Today"
            : key === tomorrow
              ? "Tomorrow"
              : formatInTimeZone(start, input.timeZone, "EEE d MMM"),
        time: `${formatInTimeZone(start, input.timeZone, "HH:mm")}–${formatInTimeZone(end, input.timeZone, "HH:mm")}`,
        moved: Boolean(change.fromStart),
      };
    });

  const moved = items.filter((item) => item.moved).length;
  const placed = items.length - moved;
  const parts: string[] = [];
  if (placed) parts.push(`Placed ${plural(placed, "task", "tasks")}`);
  if (moved) parts.push(`${parts.length ? "moved" : "Moved"} ${moved}`);
  let headline = parts.join(", ");
  if (!headline) {
    headline = input.unplaced.length
      ? "Nothing new fit"
      : "Nothing to place. Tasks with Auto-schedule on get a time here";
  }
  if (input.unplaced.length) {
    headline += `. ${plural(input.unplaced.length, "task", "tasks")} did not fit`;
  }
  return {
    placed,
    moved,
    unplaced: input.unplaced,
    items,
    headline,
  };
}

/** Open auto-schedule tasks that still have no time after a run. */
async function unplacedTasks(userId: string, workspace: WorkspaceAccess) {
  const tasks = await prisma.task.findMany({
    where: {
      ...workspaceDataScopeWhere(workspace, userId),
      isArchived: false,
      isAutoScheduled: true,
      status: { in: ["todo", "in_progress"] },
      scheduledStart: null,
    },
    select: { id: true, title: true },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });
  return tasks.map((task) => ({ taskId: task.id, title: task.title }));
}

export async function planMyDay(input: {
  userId: string;
  workspace: WorkspaceAccess;
  actor: "user" | "agent";
  runId?: string | null;
}): Promise<PlanDayResult> {
  const run = await runOp<{ changes: PlanChange[] }>(
    "schedule.auto",
    {},
    {
      userId: input.userId,
      workspace: input.workspace,
      actor: input.actor,
      runId: input.runId ?? null,
    }
  );
  const [unplaced, timeZone] = await Promise.all([
    unplacedTasks(input.userId, input.workspace),
    userTimeZone(prisma, input.userId),
  ]);
  const summary = summarizePlan({
    changes: run.result.changes,
    unplaced,
    timeZone,
  });
  const changedAnything = summary.items.length > 0;
  return {
    ...summary,
    actionId: changedAnything ? run.actionId : null,
    undoable: changedAnything && run.undoable,
  };
}
