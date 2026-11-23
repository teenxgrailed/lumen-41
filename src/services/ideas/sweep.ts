import { OpError } from "@/services/ops/errors";
import { runOp } from "@/services/ops/registry";
import { finishAgentRun, startAgentRun } from "@/services/ops/runs";
import { WorkspaceRole } from "@prisma/client";
import type { Prisma } from "@prisma/client";

import {
  type WorkspaceAccess,
  WorkspaceAuthorizationError,
  resolveWorkspaceAccess,
} from "@/lib/auth/workspace-auth";
import { addCalendarDays, newDate } from "@/lib/date-utils";
import { ideaCardsEnabled } from "@/lib/feature-flags";
import { IDEA_CARDS } from "@/lib/feature-flags-keys";
import { normalizeUserTimeZone } from "@/lib/habit-completion-date";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { publishRealtimeEvent } from "@/lib/realtime/publish";
import { openTaskWhere } from "@/lib/tasks/open-task";

import {
  MAX_CONVERT_PER_DAY,
  MAX_CONVERT_PER_RUN,
  looksLikeIdea,
  movedToIdeasLine,
  shouldAutoConvert,
} from "./rules";

const LOG_SOURCE = "idea-sweep";

/** Tasks read per page, and pages per run. */
const SWEEP_TASK_PAGE = 200;
const SWEEP_MAX_PAGES = 10;

/**
 * Where the scan resumes. It lives in the worker's memory and rotates through
 * every account over successive runs (a restart starts again from the first),
 * so one busy account cannot hide everyone behind it.
 */
let taskCursor: string | undefined;

/** For tests: start the scan from the beginning. */
export function resetIdeaSweepCursor() {
  taskCursor = undefined;
}

export interface IdeaSweepResult {
  skipped: "flag_off" | null;
  /** Tasks moved to Ideas. */
  converted: number;
  /** People who got a summed line. */
  people: number;
  /** Tasks examined and left alone (stamped). */
  stamped: number;
}

const taskSelect = {
  id: true,
  title: true,
  kind: true,
  userId: true,
  assigneeId: true,
  workspaceId: true,
  status: true,
  isArchived: true,
  trashedAt: true,
  somedayAt: true,
  isSample: true,
  isRecurring: true,
  recurrenceMasterId: true,
  habitId: true,
  externalTaskId: true,
  hardDeadline: true,
  priorityLevel: true,
  priority: true,
  scheduleLocked: true,
  isFrozen: true,
  projectId: true,
  dueDate: true,
  deadline: true,
  rescheduleCount: true,
  parts: { select: { done: true } },
} as const;

interface PersonFacts {
  enabled: boolean;
  timeZone: string;
  excluded: string[];
}

async function workspaceFor(
  userId: string,
  workspaceId: string | null
): Promise<WorkspaceAccess | null> {
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

/** One person's conversions in this run, undone together by their run id. */
interface PersonRun {
  runId: string | null;
  titles: string[];
}

/**
 * The periodic job: open tasks that are really ideas (an optional-activity
 * title, no commitment word, overdue 2+ days or moved to a later day) become
 * ideas, each as an undoable `idea.convert` action with the old dates in its
 * snapshot, all of one person's in one run so a single Undo reverses them. At
 * most 5 per person per run and 20 per day. With the kill switch off it reads
 * one flag row and returns; a person who turned idea cards off is never touched.
 *
 * A task whose title cannot be an idea (no optional-activity word, or a
 * commitment word) and that is examined gets `ideaCheckedAt`, so it leaves the
 * candidate set instead of being read on every run. A task that reads like an
 * idea but does not qualify yet (not overdue enough, no move to a later day) is
 * not stamped: the clock or a move can make it qualify. A task skipped only for a cap is left as it was. The stamp is cleared when
 * the title changes; an undone conversion is stamped too, so it is never redone.
 */
export async function runIdeaSweep(
  now: Date = newDate()
): Promise<IdeaSweepResult> {
  const flag = await prisma.featureFlag.findUnique({
    where: { key: IDEA_CARDS },
    select: { enabled: true },
  });
  if (!flag?.enabled) {
    return { skipped: "flag_off", converted: 0, people: 0, stamped: 0 };
  }

  const people = new Map<string, PersonFacts>();
  const factsFor = async (userId: string): Promise<PersonFacts> => {
    const known = people.get(userId);
    if (known) return known;
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { timeZone: true, easyStartExcludedProjectIds: true },
    });
    const facts = {
      enabled: await ideaCardsEnabled(userId),
      timeZone: normalizeUserTimeZone(settings?.timeZone),
      excluded: settings?.easyStartExcludedProjectIds ?? [],
    };
    people.set(userId, facts);
    return facts;
  };

  const dayLeft = new Map<string, number>();
  const convertedToday = async (userId: string) => {
    if (dayLeft.has(userId)) return dayLeft.get(userId) as number;
    const done = await prisma.task.count({
      where: {
        userId,
        kind: "IDEA",
        ideaSource: "converted",
        ideaCheckedAt: { gte: addCalendarDays(now, -1) },
      },
    });
    const left = Math.max(0, MAX_CONVERT_PER_DAY - done);
    dayLeft.set(userId, left);
    return left;
  };

  const candidateWhere: Prisma.TaskWhereInput = {
    ...openTaskWhere(),
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
    hardDeadline: false,
    scheduleLocked: false,
    isFrozen: false,
    priorityLevel: { notIn: ["HIGH", "URGENT"] },
    ideaCheckedAt: null,
    // A ticked subtask means the person has started.
    parts: { none: { done: true } },
    // Not in an open day plan: an idea is not planned.
    dayPlanItems: {
      none: { plan: { status: { in: ["draft", "active"] } } },
    },
    user: { NOT: { userSettings: { is: { ideaCardsEnabled: false } } } },
    // A future due date is a commitment; the exact day is `dueState`'s.
    OR: [{ dueDate: null }, { dueDate: { lt: addCalendarDays(now, 1) } }],
  };

  const runs = new Map<string, PersonRun>();
  const perRun = new Map<string, number>();
  let converted = 0;
  let stamped = 0;

  let cursor = taskCursor;
  let reachedEnd = false;
  let resume = taskCursor;
  for (let page = 0; page < SWEEP_MAX_PAGES; page += 1) {
    const candidates = await prisma.task.findMany({
      where: {
        ...candidateWhere,
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: taskSelect,
      orderBy: { id: "asc" },
      take: SWEEP_TASK_PAGE,
    });
    if (candidates.length === 0) {
      reachedEnd = true;
      break;
    }
    cursor = candidates[candidates.length - 1].id;

    const leave: string[] = [];
    for (const task of candidates) {
      resume = task.id;
      const userId = task.userId;
      if (!userId) continue;
      const person = await factsFor(userId);
      if (!person.enabled) continue;
      const qualifies = shouldAutoConvert(
        { ...task, doneParts: task.parts.filter((p) => p.done).length },
        now,
        person.timeZone,
        person.excluded
      );
      if (!qualifies) {
        // Stamp only what can never qualify until its title changes (the stamp
        // is cleared then). A task that reads like an idea but is not overdue
        // enough yet, or has a future date, qualifies later by the clock or a
        // move to a later day, so it stays in the candidate set.
        if (!looksLikeIdea(task.title)) leave.push(task.id);
        continue;
      }
      // Over a cap: left as it was, for a later run.
      if ((perRun.get(userId) ?? 0) >= MAX_CONVERT_PER_RUN) continue;
      if ((await convertedToday(userId)) <= 0) continue;
      const workspace = await workspaceFor(userId, task.workspaceId);
      if (!workspace) {
        leave.push(task.id);
        continue;
      }
      let run = runs.get(userId);
      if (!run) {
        run = { runId: null, titles: [] };
        runs.set(userId, run);
      }
      try {
        if (!run.runId) {
          run.runId = (
            await startAgentRun({
              userId,
              workspaceId: workspace.workspaceId,
              actor: "agent",
              source: "background",
            })
          ).id;
        }
        await runOp(
          "idea.convert",
          { taskId: task.id, to: "idea", source: "converted" },
          { userId, workspace, actor: "agent", runId: run.runId }
        );
        run.titles.push(task.title);
        perRun.set(userId, (perRun.get(userId) ?? 0) + 1);
        dayLeft.set(userId, (dayLeft.get(userId) ?? 1) - 1);
        converted += 1;
      } catch (error) {
        // A conflict (the person got there first, the task is in a plan) may
        // pass; anything else leaves the candidate set so it is not retried.
        if (!(error instanceof OpError) || error.code !== "CONFLICT") {
          leave.push(task.id);
        }
        logger.info(
          "Task not moved to Ideas",
          {
            taskId: task.id,
            error: error instanceof Error ? error.message : String(error),
          },
          LOG_SOURCE
        );
      }
    }
    if (leave.length) {
      stamped += await stampChecked(leave, now);
    }
    if (candidates.length < SWEEP_TASK_PAGE) {
      reachedEnd = true;
      break;
    }
  }
  // Resume here next run, or start over once the end was reached.
  taskCursor = reachedEnd ? undefined : resume;

  let announced = 0;
  for (const [userId, run] of runs) {
    if (run.runId) {
      try {
        await finishAgentRun(run.runId);
      } catch (error) {
        logger.warn(
          "Could not close the idea sweep run",
          { error: error instanceof Error ? error.message : String(error) },
          LOG_SOURCE
        );
      }
    }
    if (run.titles.length === 0) continue;
    announced += 1;
    try {
      await publishRealtimeEvent(userId, "idea-cards", {
        message: movedToIdeasLine(run.titles),
        runId: run.runId ?? undefined,
      });
    } catch (error) {
      // The line is a courtesy; every change is logged and undoable.
      logger.warn(
        "Could not publish the Ideas notice",
        { error: error instanceof Error ? error.message : String(error) },
        LOG_SOURCE
      );
    }
  }
  return { skipped: null, converted, people: announced, stamped };
}

/** Marks tasks as looked at, only where nobody stamped them meanwhile. */
async function stampChecked(ids: string[], now: Date): Promise<number> {
  try {
    const { count } = await prisma.task.updateMany({
      where: { id: { in: ids }, ideaCheckedAt: null },
      data: { ideaCheckedAt: now },
    });
    return count;
  } catch (error) {
    logger.warn(
      "Could not stamp tasks as looked at",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return 0;
  }
}
