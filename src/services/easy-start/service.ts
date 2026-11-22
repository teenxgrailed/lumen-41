import { OpError } from "@/services/ops/errors";
import { runOp } from "@/services/ops/registry";
import {
  SPREAD_DEFAULT_DAYS,
  spreadOrder,
  taskDayInZone,
} from "@/services/scheduling/spread";
import { WorkspaceRole } from "@prisma/client";

import {
  type WorkspaceAccess,
  WorkspaceAuthorizationError,
  resolveWorkspaceAccess,
  workspaceDataScopeWhere,
} from "@/lib/auth/workspace-auth";
import { addCalendarDays, formatInTimeZone, newDate } from "@/lib/date-utils";
import { easyStartSettings } from "@/lib/feature-flags";
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
  needsBackfill,
  needsEntryOnCreate,
  overflowIds,
  proposalLine,
  simplifiedLine,
  stuckReason,
} from "./rules";

const LOG_SOURCE = "easy-start";

/** A person's row says no (the sweep never reads their tasks). */
export const settingsOff = { userSettings: { is: { easyStartMode: "off" } } };

export type SimplifyReason = "create" | "backfill" | StuckReason;

export type SimplifyOutcome =
  | { status: "simplified"; actionId: string | null; source: "ai" | "fallback" }
  | { status: "proposed"; proposalId: string; source: "ai" | "fallback" }
  | {
      status: "skipped";
      why: "off" | "not_found" | "not_eligible" | "no_access" | "failed";
    };

export const taskSelect = {
  id: true,
  userId: true,
  workspaceId: true,
  projectId: true,
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
  event: {
    message: string;
    actionId?: string | null;
    proposalId?: string | null;
    taskId?: string;
  }
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
 * Mark a task as looked at, so it leaves every candidate set (the stuck sweep,
 * the backfill). Only when nobody changed the stamp meanwhile. Used whenever a
 * task was examined and nothing was written, so a row that can never be
 * changed (a touched task, an archived project, a Free fallback already in
 * place) is not picked again and again.
 */
export async function stampLookedAt(
  task: { id: string; simplifiedAt: Date | null },
  now: Date
) {
  try {
    await prisma.task.updateMany({
      where: { id: task.id, simplifiedAt: task.simplifiedAt },
      data: { simplifiedAt: now },
    });
  } catch (error) {
    logger.warn(
      "Could not stamp a task as looked at",
      {
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
  }
}

/**
 * Give one task its easy first step: a new task with no entry (`create`), an
 * existing one with none (`backfill`), or a stuck one made smaller
 * (`rescheduled`, `not_started`). Re-checks everything itself (the mode, the
 * kill switch, the excluded projects, eligibility), so a late or repeated job
 * changes nothing it should not.
 *
 * In "auto" mode the write is `task.simplify`, which logs an action with an
 * inverse; the open app shows one line with Undo. In "suggest" mode nothing
 * changes: a proposal is stored and the line reads "Simplify?" with Apply.
 * Whenever a task was examined and not changed, it is stamped (`simplifiedAt`)
 * so it does not come round again.
 */
export async function simplifyTask(input: {
  taskId: string;
  reason: SimplifyReason;
  now?: Date;
  /** The caller announces (the backfill sums a batch into one line). */
  quiet?: boolean;
}): Promise<SimplifyOutcome> {
  const now = input.now ?? newDate();
  const task = await prisma.task.findUnique({
    where: { id: input.taskId },
    select: taskSelect,
  });
  if (!task?.userId) return { status: "skipped", why: "not_found" };
  const settings = await easyStartSettings(task.userId);
  if (settings.mode === "off") return { status: "skipped", why: "off" };
  const excluded = settings.excludedProjectIds;
  const facts = { ...task, doneParts: task.parts.filter((p) => p.done).length };
  const eligible =
    input.reason === "create"
      ? needsEntryOnCreate(task, excluded)
      : input.reason === "backfill"
        ? needsBackfill(task, excluded)
        : stuckReason(facts, now, excluded) === input.reason;
  if (!eligible) {
    if (input.reason !== "create") await stampLookedAt(task, now);
    return { status: "skipped", why: "not_eligible" };
  }

  const workspace = await workspaceFor(task.userId, task.workspaceId);
  if (!workspace) {
    if (input.reason !== "create") await stampLookedAt(task, now);
    return { status: "skipped", why: "no_access" };
  }

  if (settings.mode === "suggest") {
    const pending = await prisma.easyStartProposal.findFirst({
      where: { taskId: task.id, status: "pending" },
      select: { id: true },
    });
    if (pending) return { status: "skipped", why: "not_eligible" };
  }

  const resplit = input.reason !== "create" && input.reason !== "backfill";
  const plan = await generateEntryPlan({
    userId: task.userId,
    title: task.title,
    notes: task.description,
    ...(resplit
      ? {
          previousEntry: task.entry ?? "",
          previousSubtasks: task.parts.map((p) => p.title),
        }
      : {}),
  });
  // Nothing to change: the task already says what the fallback would.
  if (resplit && task.entry === plan.entry && !plan.title) {
    await plan.release();
    await stampLookedAt(task, now);
    return { status: "skipped", why: "not_eligible" };
  }

  if (settings.mode === "suggest") {
    try {
      const proposal = await prisma.easyStartProposal.create({
        data: {
          userId: task.userId,
          workspaceId: workspace.workspaceId,
          taskId: task.id,
          reason: input.reason,
          entry: plan.entry,
          title: plan.title ?? null,
          subtasks: plan.subtasks,
          source: plan.source,
          baseTitle: task.title,
          baseEntry: task.entry ?? null,
        },
        select: { id: true },
      });
      await stampLookedAt(task, now);
      if (!input.quiet) {
        await announce(task.userId, {
          message: proposalLine({
            title: plan.title ?? task.title,
            entry: plan.entry,
          }),
          proposalId: proposal.id,
          taskId: task.id,
        });
      }
      return {
        status: "proposed",
        proposalId: proposal.id,
        source: plan.source,
      };
    } catch (error) {
      await plan.release();
      throw error;
    }
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
        // What the plan was made from: the op reads the task again inside its
        // transaction and refuses if the person (or a second job) changed it.
        expected: {
          simplifiedAt: task.simplifiedAt?.toISOString() ?? null,
          entry: task.entry ?? null,
          title: task.title,
        },
      },
      { userId: task.userId, workspace, actor: "agent" }
    );
    if (!input.quiet) {
      await announce(task.userId, {
        message: simplifiedLine({
          kind: resplit ? "resplit" : "entry",
          title: run.result.task.title,
          entry: run.result.entry,
        }),
        actionId: run.actionId,
        taskId: task.id,
      });
    }
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
    // Nothing was written: give a claimed action back, so a retry (or a task
    // that can never be changed) does not keep paying for the same answer.
    await plan.release();
    if (error instanceof OpError) {
      logger.info(
        "Task not simplified",
        { taskId: task.id, code: error.code },
        LOG_SOURCE
      );
      // A conflict means the person (or another job) got there first; the
      // task is already theirs. Anything else leaves the candidate set.
      if (error.code !== "CONFLICT") await stampLookedAt(task, now);
      return { status: "skipped", why: "failed" };
    }
    throw error;
  }
}

/* ---------- proposals ("suggest" mode) ---------- */

export type ApplyOutcome =
  | { status: "applied"; actionId: string | null }
  | { status: "not_found" | "stale" | "off" | "failed" };

/**
 * Apply a stored proposal: the same `task.simplify` as "auto" mode, run for
 * the person who pressed Apply, so it is undoable the same way. A proposal made
 * from a title or entry the person has since changed is marked stale and not
 * applied.
 */
export async function applyProposal(
  proposalId: string,
  userId: string
): Promise<ApplyOutcome> {
  const proposal = await prisma.easyStartProposal.findFirst({
    where: { id: proposalId, userId, status: "pending" },
  });
  if (!proposal) return { status: "not_found" };
  const settings = await easyStartSettings(userId);
  if (settings.mode === "off") return { status: "off" };

  const task = await prisma.task.findUnique({
    where: { id: proposal.taskId },
    select: taskSelect,
  });
  const resolve = (status: "stale" | "applied", actionId?: string | null) =>
    prisma.easyStartProposal.update({
      where: { id: proposal.id },
      data: {
        status,
        resolvedAt: newDate(),
        ...(actionId ? { actionId } : {}),
      },
    });
  if (
    !task ||
    task.userId !== userId ||
    task.title !== (proposal.baseTitle ?? task.title) ||
    (task.entry ?? null) !== (proposal.baseEntry ?? null) ||
    (settings.excludedProjectIds.length > 0 &&
      task.projectId !== null &&
      settings.excludedProjectIds.includes(task.projectId))
  ) {
    await resolve("stale");
    return { status: "stale" };
  }
  const workspace = await workspaceFor(userId, task.workspaceId);
  if (!workspace) return { status: "failed" };
  try {
    const run = await runOp(
      "task.simplify",
      {
        taskId: task.id,
        entry: proposal.entry,
        ...(proposal.title ? { title: proposal.title } : {}),
        ...(proposal.subtasks.length ? { subtasks: proposal.subtasks } : {}),
        reason: proposal.reason,
        expected: {
          simplifiedAt: task.simplifiedAt?.toISOString() ?? null,
          entry: task.entry ?? null,
          title: task.title,
        },
      },
      { userId, workspace, actor: "user" }
    );
    await resolve("applied", run.actionId);
    return { status: "applied", actionId: run.actionId };
  } catch (error) {
    if (error instanceof OpError) {
      if (error.code === "CONFLICT") {
        await resolve("stale");
        return { status: "stale" };
      }
      return { status: "failed" };
    }
    throw error;
  }
}

/** Dismiss a pending proposal. */
export async function dismissProposal(proposalId: string, userId: string) {
  const result = await prisma.easyStartProposal.updateMany({
    where: { id: proposalId, userId, status: "pending" },
    data: { status: "dismissed", resolvedAt: newDate() },
  });
  return result.count > 0;
}

/* ---------- overloaded days ---------- */

type DayRow = {
  id: string;
  projectId: string | null;
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
  projectId: true,
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
 * frozen or tied to a hard deadline stays, as does a habit, series or synced
 * row, and a task in a project the person excluded.
 */
function isFixed(task: DayRow, excludedProjectIds: readonly string[]): boolean {
  return (
    !task.isAutoScheduled ||
    task.scheduleLocked ||
    task.isFrozen ||
    task.hardDeadline ||
    Boolean(task.habitId) ||
    task.isRecurring ||
    Boolean(task.recurrenceMasterId) ||
    Boolean(task.externalTaskId) ||
    (task.projectId !== null && excludedProjectIds.includes(task.projectId))
  );
}

export interface BalanceOutcome {
  moved: number;
  actionIds: string[];
  skipped?: "off" | "paused" | "no_access";
}

/** Every workspace the person can edit, once each (the personal one included). */
async function editableWorkspaces(userId: string): Promise<WorkspaceAccess[]> {
  const memberships = await prisma.workspaceMember.findMany({
    where: {
      userId,
      role: { in: [WorkspaceRole.OWNER, WorkspaceRole.EDITOR] },
    },
    select: { workspaceId: true },
    take: 50,
  });
  const found = new Map<string, WorkspaceAccess>();
  for (const id of [null, ...memberships.map((m) => m.workspaceId)]) {
    const access = await workspaceFor(userId, id);
    if (access && !found.has(access.workspaceId)) {
      found.set(access.workspaceId, access);
    }
  }
  return [...found.values()];
}

/**
 * Ease a day with more than 6 open tasks: the lowest-priority tasks beyond the
 * 6th that are free to move go to later days through `task.spread`, the
 * scheduler's own spread (its room per day, its order). Each workspace is
 * balanced on its own. A moved task is held on its new day (the scheduler's
 * not-before date) and never given a due date it did not have, so the next
 * scheduler run leaves it there. One action per day eased, each undoable. After
 * the person undoes one, nothing is moved for them for a day. Only in "auto"
 * mode: a suggestion mode never moves anything on its own.
 */
export async function balanceOverloadedDays(
  userId: string,
  now: Date = newDate()
): Promise<BalanceOutcome> {
  const settings = await easyStartSettings(userId);
  if (settings.mode !== "auto") {
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

  const workspaces = await editableWorkspaces(userId);
  if (workspaces.length === 0) {
    return { moved: 0, actionIds: [], skipped: "no_access" };
  }

  const userSettings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { timeZone: true },
  });
  const timeZone = normalizeUserTimeZone(userSettings?.timeZone);
  const out: BalanceOutcome = { moved: 0, actionIds: [] };
  for (const workspace of workspaces) {
    const part = await balanceWorkspace(
      userId,
      workspace,
      now,
      timeZone,
      settings.excludedProjectIds
    );
    out.moved += part.moved;
    out.actionIds.push(...part.actionIds);
  }
  return out;
}

async function balanceWorkspace(
  userId: string,
  workspace: WorkspaceAccess,
  now: Date,
  timeZone: string,
  excluded: readonly string[]
): Promise<BalanceOutcome> {
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
        fixed: isFixed(row, excluded),
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
          notBefore: true,
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
