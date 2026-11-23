import { queueEasyStart } from "@/services/easy-start/queue";
import { DAY_TASK_LIMIT } from "@/services/easy-start/rules";
import { readIdeaCards } from "@/services/ideas/cards";
import { TAKE_DEFAULT_MINUTES, skipResult } from "@/services/ideas/rules";
import { scheduleAllTasksForUser } from "@/services/scheduling/TaskSchedulingService";
import {
  SPREAD_DEFAULT_DAYS,
  spreadAcrossDays,
} from "@/services/scheduling/spread";
import { loadSpreadDays } from "@/services/scheduling/spread-capacity";
import { z } from "zod";

import { recordActivation } from "@/lib/activation-events";
import { formatInTimeZone, newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { schedulePushTaskBlock } from "@/lib/task-block-push";
import { ideaWhere, openTaskWhere } from "@/lib/tasks/open-task";

import { OpError } from "../errors";
import {
  assertProjectActive,
  dayKeySchema,
  findScopedTask,
  nextDayKey,
  publishTasksUpdated,
  startOfZonedDay,
  taskInclude,
  taskView,
  touched,
  userTimeZone,
} from "../helpers";
import { defineOp } from "../types";
import type { OpContext } from "../types";
import {
  assertIdea,
  convertTask,
  createIdeaRow,
  sourceForActor,
} from "./idea-core";
import {
  assertGoalUsable,
  assertProjectUsable,
  assertTagsOwned,
} from "./task-asserts";
import { activity, pickRestorable } from "./task-snapshots";

const LOG_SOURCE = "idea-ops";

const taskId = z.string().min(1);
const estimate = z.number().int().min(5).max(1440);
const OPEN_STATUSES = ["todo", "in_progress"];

/** An idea the person owns: in this workspace scope, and theirs. */
async function findIdea(ctx: OpContext, id: string) {
  const task = await findScopedTask(ctx, id, { includeArchived: true });
  assertIdea(task);
  if (task.userId !== ctx.userId) {
    throw new OpError("NOT_FOUND", "Idea not found");
  }
  return task;
}

// ---------------------------------------------------------------- reads

export const ideaList = defineOp({
  name: "idea.list",
  description:
    "List the person's ideas (optional things offered now and then as cards, never late). state: ready (can be offered), snoozed (skipped, hidden for 7 days) or all (archived ones too). Paged by cursor.",
  risk: "read",
  input: z
    .object({
      state: z.enum(["ready", "snoozed", "all"]).default("ready"),
      query: z.string().min(1).max(200).optional(),
      limit: z.number().int().min(1).max(200).default(50),
      cursor: z.string().min(1).optional(),
    })
    .strict(),
  async run(ctx, input) {
    const now = newDate();
    const rows = await ctx.tx.task.findMany({
      where: {
        ...ctx.scope,
        userId: ctx.userId,
        ...ideaWhere(),
        trashedAt: null,
        ...(input.state === "all" ? {} : { isArchived: false }),
        ...(input.state === "ready"
          ? {
              OR: [
                { ideaSnoozedUntil: null },
                { ideaSnoozedUntil: { lte: now } },
              ],
            }
          : input.state === "snoozed"
            ? { ideaSnoozedUntil: { gt: now } }
            : {}),
        ...(input.query
          ? { title: { contains: input.query, mode: "insensitive" as const } }
          : {}),
        ...(input.cursor ? { id: { gt: input.cursor } } : {}),
      },
      orderBy: [{ id: "asc" }],
      take: input.limit + 1,
      include: taskInclude,
    });
    const page = rows.slice(0, input.limit);
    return {
      result: {
        ideas: page.map(taskView),
        nextCursor: rows.length > input.limit ? page[page.length - 1].id : null,
      },
    };
  },
});

/**
 * The cards for a local day. Reading stamps the ideas it returns as shown, so
 * the same day gives the same cards on every device (it is a read for roles and
 * logs, but it keeps this one bookkeeping column).
 */
export const ideaCards = defineOp({
  name: "idea.cards",
  description:
    "The idea cards to show now: at most 2 per local day, least recently shown first, each with an `after` hint (how many visible tasks it sits after). Reading marks them shown, so the same day returns the same cards. None when idea cards are off, on the evening review or day plan screens, or when there are no ideas.",
  risk: "read",
  input: z
    .object({
      day: dayKeySchema.optional(),
      surface: z.enum(["today", "home", "review", "plan"]).optional(),
      visibleTasks: z.number().int().min(0).max(500).optional(),
    })
    .strict(),
  async run(ctx, input) {
    const timeZone = await userTimeZone(ctx.tx, ctx.userId);
    const result = await readIdeaCards({
      userId: ctx.userId,
      scope: ctx.scope,
      timeZone,
      day: input.day,
      surface: input.surface,
      visibleTasks: input.visibleTasks,
    });
    return { result };
  },
});

// ---------------------------------------------------------------- writes

export const ideaCreate = defineOp({
  name: "idea.create",
  description:
    "Save an idea: something optional to read, watch or try. It has no due date or schedule and is never overdue; it is offered now and then as a card. Undo archives it.",
  risk: "reversible",
  input: z
    .object({
      title: z.string().trim().min(1).max(160),
      notes: z.string().max(20000).optional(),
      projectId: z.string().min(1).optional(),
      goalId: z.string().min(1).optional(),
      tagIds: z.array(z.string().min(1)).max(50).optional(),
      estimateMinutes: estimate.optional(),
      priority: z.enum(["NONE", "LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
      source: z.enum(["user", "agent"]).optional(),
    })
    .strict(),
  async run(ctx, input) {
    if (input.projectId) await assertProjectUsable(ctx, input.projectId);
    if (input.goalId) await assertGoalUsable(ctx, input.goalId);
    if (input.tagIds) await assertTagsOwned(ctx, input.tagIds);
    return createIdeaRow(ctx, {
      title: input.title,
      notes: input.notes,
      projectId: input.projectId,
      goalId: input.goalId,
      tagIds: input.tagIds,
      estimateMinutes: input.estimateMinutes,
      priority: input.priority,
      source: input.source ?? sourceForActor(ctx.actor),
    });
  },
});

export const ideaConvert = defineOp({
  name: "idea.convert",
  description:
    "Turn a task into an idea (to: idea: its due date, schedule, blocks and reminders are cleared; undo brings the task back with them) or an idea into a plain task (to: task: no placement; use idea.take to place it now).",
  risk: "reversible",
  input: z
    .object({
      taskId,
      to: z.enum(["idea", "task"]),
      /** converted marks a conversion made by the idea sweep. */
      source: z.enum(["user", "converted", "agent"]).optional(),
    })
    .strict(),
  async run(ctx, input) {
    const task = await findScopedTask(ctx, input.taskId);
    return convertTask(ctx, task, {
      to: input.to,
      source: input.source ?? sourceForActor(ctx.actor),
    });
  },
});

export const ideaSkip = defineOp({
  name: "idea.skip",
  description:
    "Skip an idea: it is hidden for 7 days and the skip is counted; the 3rd skip archives it (it stays listed with state all). Undo brings it back.",
  risk: "reversible",
  input: z.object({ taskId }).strict(),
  async run(ctx, input) {
    const task = await findIdea(ctx, input.taskId);
    assertProjectActive(task);
    const now = newDate();
    const skip = skipResult(task.ideaSkipCount, now);
    const fields = pickRestorable(task, [
      "ideaSkipCount",
      "ideaSnoozedUntil",
      "isArchived",
      "archivedAt",
    ]);
    const updated = await ctx.tx.task.update({
      where: { id: task.id },
      data: {
        ideaSkipCount: skip.ideaSkipCount,
        ideaSnoozedUntil: skip.ideaSnoozedUntil,
        ...(skip.archive ? { isArchived: true, archivedAt: now } : {}),
        ...activity(
          ctx,
          skip.archive ? "ARCHIVED" : "UPDATED",
          task.workspaceId
        ),
      },
      include: taskInclude,
    });
    return {
      result: {
        task: taskView(updated),
        snoozedUntil: skip.ideaSnoozedUntil.toISOString(),
        archived: skip.archive,
      },
      before: { fields },
      inverse: { op: "task.restore", input: { taskId: task.id, fields } },
      touched: [touched("task", updated, task)],
      afterCommit: [
        publishTasksUpdated(ctx.userId),
        () =>
          recordActivation("idea_skipped", ctx.userId, {
            source: task.ideaSource ?? "user",
            skipCount: skip.ideaSkipCount,
          }),
      ],
    };
  },
});

/**
 * Take: the idea becomes a task and the scheduler places it now. The first free
 * slot today from the current time; when today has no room (the working day is
 * over, or the day already holds as many tasks as the day limit) it goes to the
 * first later day with room, held there by the scheduler's not-before date. It
 * is placed, never given a due date. The scheduler owns its own transactions,
 * so this op is not transactional (as `schedule.auto`): the flip is one write,
 * then the scheduler runs.
 */
export const ideaTake = defineOp({
  name: "idea.take",
  description:
    "Take an idea: it becomes an open, auto-scheduled task (its estimate, or 30 minutes), placed by the scheduler in the first free slot today from now, or on the first later day with room. It gets no due date. Undo makes it an idea again and removes the placement.",
  risk: "reversible",
  transactional: false,
  input: z.object({ taskId }).strict(),
  async run(ctx, input) {
    const task = await findIdea(ctx, input.taskId);
    assertProjectActive(task);
    if (task.isArchived) {
      throw new OpError("CONFLICT", "That idea is archived");
    }
    const now = newDate();
    const timeZone = await userTimeZone(ctx.tx, ctx.userId);
    const today = formatInTimeZone(now, timeZone, "yyyy-MM-dd");
    const minutes =
      task.estimatedMinutes ?? task.duration ?? TAKE_DEFAULT_MINUTES;

    // Which day has room: today's free time, and fewer than the day limit
    // tasks already on it; else the first day after it that fits.
    const todayStart = startOfZonedDay(today, timeZone);
    const tomorrowStart = startOfZonedDay(nextDayKey(today), timeZone);
    const onToday = await ctx.tx.task.count({
      where: {
        ...ctx.scope,
        ...openTaskWhere(),
        userId: ctx.userId,
        isArchived: false,
        trashedAt: null,
        somedayAt: null,
        status: { in: OPEN_STATUSES },
        OR: [
          { scheduledStart: { gte: todayStart, lt: tomorrowStart } },
          { dueDate: { gte: todayStart, lt: tomorrowStart } },
        ],
      },
    });
    const days = (
      await loadSpreadDays({
        userId: ctx.userId,
        workspace: ctx.workspace,
        timeZone,
        today,
        days: SPREAD_DEFAULT_DAYS,
        now,
        exclude: new Set([task.id]),
      })
    ).map((day) =>
      day.date === today && onToday >= DAY_TASK_LIMIT
        ? { ...day, free: 0 }
        : day
    );
    const plan = spreadAcrossDays([{ id: task.id, minutes }], days);
    const day = plan.placed[0]?.date ?? null;

    const fields = pickRestorable(task, [
      "kind",
      "ideaSnoozedUntil",
      "ideaCheckedAt",
      "status",
      "isAutoScheduled",
      "autoScheduled",
      "estimatedMinutes",
      "duration",
      "postponedUntil",
      "scheduledStart",
      "scheduledEnd",
      "scheduleScore",
    ]);
    await ctx.tx.task.update({
      where: { id: task.id },
      data: {
        kind: "TASK",
        ideaSnoozedUntil: null,
        // The person took it: the sweep never turns it back into an idea.
        ideaCheckedAt: now,
        status: "todo",
        isAutoScheduled: true,
        estimatedMinutes: minutes,
        duration: minutes,
        ...(day && day !== today
          ? { postponedUntil: startOfZonedDay(day, timeZone) }
          : {}),
        ...activity(ctx, "UPDATED", task.workspaceId),
      },
    });

    // The scheduler places the one task (it replans for the person under its
    // own lock). A failure leaves the task open and auto-scheduled, so the
    // next run places it; the Take itself stands.
    try {
      await scheduleAllTasksForUser(ctx.userId, {
        workspaceId:
          ctx.workspace.dataScope.mode === "workspace"
            ? ctx.workspaceId
            : undefined,
      });
    } catch (error) {
      logger.warn(
        "Scheduler did not run after Take",
        {
          taskId: task.id,
          error: error instanceof Error ? error.message : String(error),
        },
        LOG_SOURCE
      );
    }
    const updated = await ctx.tx.task.findFirst({
      where: { id: task.id },
      include: taskInclude,
    });
    if (!updated) throw new OpError("NOT_FOUND", "Task not found");
    const placedToday =
      !!updated.scheduledStart &&
      formatInTimeZone(updated.scheduledStart, timeZone, "yyyy-MM-dd") ===
        today;
    const schedulingUserId = updated.assigneeId ?? ctx.userId;

    return {
      result: {
        task: taskView(updated),
        placed: updated.scheduledStart
          ? {
              start: updated.scheduledStart.toISOString(),
              end: updated.scheduledEnd?.toISOString() ?? null,
              today: placedToday,
            }
          : null,
        day,
      },
      before: { fields },
      inverse: {
        op: "task.restore",
        input: {
          taskId: task.id,
          fields: {
            ...fields,
            // Whatever the scheduler wrote, the idea has none of it.
            scheduledStart: null,
            scheduledEnd: null,
            scheduleScore: null,
            isAutoScheduled: false,
            autoScheduled: false,
          },
          blocks: [],
          blocksUserId: schedulingUserId,
        },
      },
      touched: [touched("task", updated, task)],
      afterCommit: [
        () => schedulePushTaskBlock(schedulingUserId, task.id),
        publishTasksUpdated(ctx.userId),
        () =>
          recordActivation("idea_taken", ctx.userId, {
            source: task.ideaSource ?? "user",
            skipCount: task.ideaSkipCount,
            placedToday,
          }),
        // Easy start sees an ordinary new task with no first step.
        () => queueEasyStart(updated),
      ],
    };
  },
});

export const ideaOps = [
  ideaList,
  ideaCards,
  ideaCreate,
  ideaConvert,
  ideaSkip,
  ideaTake,
];
