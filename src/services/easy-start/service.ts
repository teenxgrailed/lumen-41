import { OpError } from "@/services/ops/errors";
import { runOp } from "@/services/ops/registry";
import {
  SPREAD_DEFAULT_DAYS,
  spreadOrder,
  taskDayInZone,
} from "@/services/scheduling/spread";
import { WorkspaceRole } from "@prisma/client";

import {
  WorkspaceAuthorizationError,
  resolveWorkspaceAccess,
  workspaceDataScopeWhere,
} from "@/lib/auth/workspace-auth";
import { addCalendarDays, formatInTimeZone, newDate } from "@/lib/date-utils";
import { alwaysEasyStartEnabled } from "@/lib/feature-flags";
import { normalizeUserTimeZone } from "@/lib/habit-completion-date";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { publishRealtimeEvent } from "@/lib/realtime/publish";

import { generateEntryPlan } from "./generate";
import {
  BALANCE_DAYS,
  DAY_TASK_LIMIT,
  SPREAD_PAUSE_HOURS,
  type StuckReason,
  needsEntryOnCreate,
  overflowIds,
  simplifiedLine,
  stuckReason,
} from "./rules";

const LOG_SOURCE = "easy-start";

/** A person's row says no (the sweep never reads their tasks). */
export const settingsOff = { userSettings: { is: { alwaysEasyStart: false } } };

export type SimplifyOutcome =
  | { status: "simplified"; actionId: string | null; source: "ai" | "fallback" }
  | {
      status: "skipped";
      why: "off" | "not_found" | "not_eligible" | "no_access" | "failed";
    };

export const taskSelect = {
  id: true,
  userId: true,
  workspaceId: true,
  title: true,
  description: true,
  entry: true,
  status: true,
  isArchived: true,
  trashedAt: true,
  somedayAt: true,
  isSample: true,
  isRecurring: true,
  recurrenceMasterId: true,
  habitId: true,
  externalTaskId: true,
  rescheduleCount: true,
  startDate: true,
  scheduledStart: true,
  lastTouchedAt: true,
  simplifiedAt: true,
  parts: { select: { title: true, done: true }, orderBy: { position: "asc" } },
} as const;

async function workspaceFor(userId: string, workspaceId: string | null) {
  try {
    return await resolveWorkspaceAccess({
      userId,
      ...(workspaceId ? { requestedWorkspaceId: workspaceId } : {}),
      requiredRole: WorkspaceRole.EDITOR,
    });
  } catch (error) {
    if (error instanceof WorkspaceAuthorizationError) return null;
    throw error;
  }
}

async function announce(
  userId: string,
  event: { message: string; actionId: string | null; taskId?: string }
) {
  try {
    await publishRealtimeEvent(userId, "easy-start", event);
  } catch (error) {
    logger.warn(
      "Could not publish the easy start notice",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
  }
}

/**
 * Give one task its easy first step: a new task with no entry (`create`), or a
 * stuck one made smaller (`rescheduled`, `not_started`). Re-checks everything
 * itself (the setting, the kill switch, eligibility), so a late or repeated
 * job changes nothing it should not. The write is `task.simplify`, which logs
 * an action with an inverse; the open app then shows one line with Undo.
 */
export async function simplifyTask(input: {
  taskId: string;
  reason: "create" | StuckReason;
  now?: Date;
}): Promise<SimplifyOutcome> {
  const now = input.now ?? newDate();
  const task = await prisma.task.findUnique({
    where: { id: input.taskId },
    select: taskSelect,
  });
  if (!task?.userId) return { status: "skipped", why: "not_found" };
  if (!(await alwaysEasyStartEnabled(task.userId))) {
    return { status: "skipped", why: "off" };
  }
  const facts = { ...task, doneParts: task.parts.filter((p) => p.done).length };
  const eligible =
    input.reason === "create"
      ? needsEntryOnCreate(task)
      : stuckReason(facts, now) === input.reason;
  if (!eligible) return { status: "skipped", why: "not_eligible" };

  const workspace = await workspaceFor(task.userId, task.workspaceId);
  if (!workspace) return { status: "skipped", why: "no_access" };

  const plan = await generateEntryPlan({
    userId: task.userId,
    title: task.title,
    notes: task.description,
    ...(input.reason === "create"
      ? {}
      : {
          previousEntry: task.entry ?? "",
          previousSubtasks: task.parts.map((p) => p.title),
        }),
  });
  // Nothing to change: the task already says what the fallback would.
  if (input.reason !== "create" && task.entry === plan.entry && !plan.title) {
    return { status: "skipped", why: "not_eligible" };
  }

  try {
    const run = await runOp<{ entry: string; task: { title: string } }>(
      "task.simplify",
      {
        taskId: task.id,
        entry: plan.entry,
        ...(plan.title ? { title: plan.title } : {}),
        ...(plan.subtasks.length ? { subtasks: plan.subtasks } : {}),
        reason: input.reason,
      },
      { userId: task.userId, workspace, actor: "agent" }
    );
    await announce(task.userId, {
      message: simplifiedLine({
        kind: input.reason === "create" ? "entry" : "resplit",
        title: run.result.task.title,
        entry: run.result.entry,
      }),
      actionId: run.actionId,
      taskId: task.id,
    });
    logger.info(
      "Task simplified",
      { taskId: task.id, reason: input.reason, source: plan.source },
      LOG_SOURCE
    );
    return {
      status: "simplified",
      actionId: run.actionId,
      source: plan.source,
    };
  } catch (error) {
    if (error instanceof OpError) {
      logger.info(
        "Task not simplified",
        { taskId: task.id, code: error.code },
        LOG_SOURCE
      );
      return { status: "skipped", why: "failed" };
    }
    throw error;
  }
}

/* ---------- overloaded days ---------- */

type DayRow = {
  id: string;
  priorityLevel: string;
  dueDate: Date | null;
  scheduledStart: Date | null;
  isAutoScheduled: boolean;
  scheduleLocked: boolean;
  isFrozen: boolean;
  hardDeadline: boolean;
  habitId: string | null;
  isRecurring: boolean;
  recurrenceMasterId: string | null;
  externalTaskId: string | null;
};

const dayRowSelect = {
  id: true,
  priorityLevel: true,
  dueDate: true,
  scheduledStart: true,
  isAutoScheduled: true,
  scheduleLocked: true,
  isFrozen: true,
  hardDeadline: true,
  habitId: true,
  isRecurring: true,
  recurrenceMasterId: true,
  externalTaskId: true,
} as const;

/**
 * Only an auto-scheduled task moves. Anything pinned, locked, placed by hand,
 * frozen or tied to a hard deadline stays, as does a habit, series or synced row.
 */
function isFixed(task: DayRow): boolean {
  return (
    !task.isAutoScheduled ||
    task.scheduleLocked ||
    task.isFrozen ||
    task.hardDeadline ||
    Boolean(task.habitId) ||
    task.isRecurring ||
    Boolean(task.recurrenceMasterId) ||
    Boolean(task.externalTaskId) ||
    // Placed by hand: it has a time and the scheduler does not own it.
    (!task.isAutoScheduled && task.scheduledStart !== null)
  );
}

export interface BalanceOutcome {
  moved: number;
  actionIds: string[];
  skipped?: "off" | "paused" | "no_access";
}

/**
 * Ease a day with more than 6 open tasks: the lowest-priority tasks beyond the
 * 6th that are free to move go to later days through `task.spread`, the
 * scheduler's own spread (its room per day, its order). One action per day
 * eased, each undoable. After the person undoes one, nothing is moved for them
 * for a day.
 */
export async function balanceOverloadedDays(
  userId: string,
  now: Date = newDate()
): Promise<BalanceOutcome> {
  if (!(await alwaysEasyStartEnabled(userId))) {
    return { moved: 0, actionIds: [], skipped: "off" };
  }
  const undone = await prisma.agentAction.findFirst({
    where: {
      userId,
      actor: "agent",
      op: "task.spread",
      status: "undone",
      undoneAt: {
        gte: newDate(now.getTime() - SPREAD_PAUSE_HOURS * 3_600_000),
      },
    },
    select: { id: true },
  });
  if (undone) return { moved: 0, actionIds: [], skipped: "paused" };

  const workspace = await workspaceFor(userId, null);
  if (!workspace) return { moved: 0, actionIds: [], skipped: "no_access" };

  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { timeZone: true },
  });
  const timeZone = normalizeUserTimeZone(settings?.timeZone);
  const today = formatInTimeZone(now, timeZone, "yyyy-MM-dd");
  const dayKeys = Array.from({ length: BALANCE_DAYS }, (_, i) =>
    formatInTimeZone(addCalendarDays(now, i, timeZone), timeZone, "yyyy-MM-dd")
  );
  const rangeStart = addCalendarDays(now, -1, timeZone);
  const rangeEnd = addCalendarDays(now, BALANCE_DAYS + 1, timeZone);

  const rows: DayRow[] = await prisma.task.findMany({
    where: {
      ...workspaceDataScopeWhere(workspace, userId),
      isArchived: false,
      trashedAt: null,
      somedayAt: null,
      noSlot: false,
      isSample: false,
      status: { in: ["todo", "in_progress"] },
      OR: [
        { dueDate: { gte: rangeStart, lt: rangeEnd } },
        { scheduledStart: { gte: rangeStart, lt: rangeEnd } },
      ],
    },
    select: dayRowSelect,
    take: 500,
  });

  const dayOf = new Map<string, string | null>(
    rows.map((row) => [row.id, taskDayInZone(row, today, timeZone)])
  );
  const out: BalanceOutcome = { moved: 0, actionIds: [] };

  for (const [offset, day] of dayKeys.entries()) {
    const onDay = rows.filter((row) => dayOf.get(row.id) === day);
    if (onDay.length <= DAY_TASK_LIMIT) continue;
    const ordered = spreadOrder(onDay);
    const ids = overflowIds(
      ordered.map((row) => ({
        id: row.id,
        priorityLevel: row.priorityLevel,
        dueDate: row.dueDate,
        fixed: isFixed(row),
      })),
      DAY_TASK_LIMIT
    );
    if (ids.length === 0) continue;
    try {
      const run = await runOp<{ moved: { taskId: string; date: string }[] }>(
        "task.spread",
        {
          taskIds: ids,
          afterDay: day,
          days: Math.min(14, offset + SPREAD_DEFAULT_DAYS),
        },
        { userId, workspace, actor: "agent" }
      );
      const moved = run.result.moved;
      if (moved.length === 0) continue;
      for (const row of moved) dayOf.set(row.taskId, row.date);
      out.moved += moved.length;
      if (run.actionId) out.actionIds.push(run.actionId);
      await announce(userId, {
        message: simplifiedLine({ kind: "spread", moved: moved.length }),
        actionId: run.actionId,
      });
    } catch (error) {
      if (!(error instanceof OpError)) throw error;
      logger.info(
        "Overloaded day not eased",
        { day, code: error.code },
        LOG_SOURCE
      );
    }
  }
  return out;
}
