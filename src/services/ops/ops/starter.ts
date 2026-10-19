import { SubscriptionPlan } from "@prisma/client";
import { z } from "zod";

import { formatInTimeZone, newDate } from "@/lib/date-utils";
import { canCreateHabit, getPlan } from "@/lib/entitlements";
import {
  type StarterCreateResult,
  starterCreateSchema,
} from "@/lib/starter-game";

import { OpError } from "../errors";
import {
  publishTasksUpdated,
  startOfZonedDay,
  touched,
  userTimeZone,
} from "../helpers";
import { defineOp } from "../types";
import type { OpRunOutput, TouchedRow } from "../types";
import { projectArchive } from "./projects";
import { taskArchive, taskCreate } from "./tasks";

/** The Sunday that ends the week `dayKey` is in (itself when it is a Sunday). */
export function endOfWeekKey(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = newDate(Date.UTC(year, month - 1, day));
  const toSunday = (7 - date.getUTCDay()) % 7;
  return newDate(Date.UTC(year, month - 1, day + toSunday))
    .toISOString()
    .slice(0, 10);
}

/** An agent-suggested day if it lies in [from, to], else `fallback`. */
function dayWithin(
  suggested: string | undefined,
  from: string,
  to: string,
  fallback: string
) {
  return suggested && suggested >= from && suggested <= to
    ? suggested
    : fallback;
}

export const starterCreate = defineOp({
  name: "starter.create",
  description:
    "Create what a person sorted in the Starter game in one go: tasks (today or this week, with due dates), habits (with a weekly cadence) and projects (each with a first step). Pro, Lifetime and trial only. One undoable action: undo archives all of it.",
  risk: "reversible",
  input: starterCreateSchema,
  async run(ctx, input) {
    if ((await getPlan(ctx.userId)) === SubscriptionPlan.FREE) {
      throw new OpError(
        "UPGRADE_REQUIRED",
        "The Starter game is available on Needt Pro and Lifetime."
      );
    }
    if (input.habits.length) {
      // Pro has no habit limit; this stays true to the rule if that ever changes.
      const status = await canCreateHabit(ctx.userId);
      if (
        status.limit !== null &&
        status.used + input.habits.length > status.limit
      ) {
        throw new OpError("UPGRADE_REQUIRED", "The habit limit is reached.");
      }
    }

    const timeZone = await userTimeZone(ctx.tx, ctx.userId);
    const today = formatInTimeZone(newDate(), timeZone, "yyyy-MM-dd");
    const weekEnd = endOfWeekKey(today);
    const dueAt = (day: string) => startOfZonedDay(day, timeZone).toISOString();

    const rows: TouchedRow[] = [];
    const effects: NonNullable<OpRunOutput<unknown>["afterCommit"]> = [];
    // `task.create` only has its realtime nudge as a side effect; one nudge
    // for the whole action is added at the end.
    const keep = (out: OpRunOutput<unknown>) => {
      rows.push(...(out.touched ?? []));
    };

    const result: StarterCreateResult = {
      counts: { tasks: 0, habits: 0, projects: 0 },
      tasks: [],
      habits: [],
      projects: [],
    };
    const created = {
      taskIds: [] as string[],
      projectIds: [] as string[],
      habitIds: [] as string[],
    };

    for (const t of input.tasks) {
      const day =
        t.group === "today"
          ? today
          : dayWithin(t.dueDay, today, weekEnd, weekEnd);
      const out = await taskCreate.run(ctx, {
        title: t.title,
        dueDate: dueAt(day),
        estimateMinutes: t.estimateMinutes,
        autoSchedule: true,
      });
      keep(out);
      const task = (out.result as { task: { id: string } }).task;
      created.taskIds.push(task.id);
      result.tasks.push({ id: task.id, title: t.title, group: t.group });
    }

    for (const h of input.habits) {
      const habit = await ctx.tx.habit.create({
        data: {
          userId: ctx.userId,
          workspaceId: ctx.workspaceId,
          title: h.title,
          targetOccurrencesPerWeek: h.perWeek,
          daysOfWeek: [],
          estimatedMinutes: h.estimateMinutes ?? 30,
        },
      });
      rows.push(touched("habit", habit, null));
      created.habitIds.push(habit.id);
      result.habits.push({ id: habit.id, title: habit.title });
    }

    for (const p of input.projects) {
      const project = await ctx.tx.project.create({
        data: {
          userId: ctx.userId,
          workspaceId: ctx.workspaceId,
          name: p.name,
          description: p.horizon,
          ...(p.deadlineDay
            ? { deadline: startOfZonedDay(p.deadlineDay, timeZone) }
            : {}),
        },
      });
      rows.push(touched("project", project, null));
      created.projectIds.push(project.id);
      let firstStepTaskId: string | null = null;
      if (p.firstStep) {
        const stepOut = await taskCreate.run(ctx, {
          title: p.firstStep,
          projectId: project.id,
          autoSchedule: true,
        });
        keep(stepOut);
        firstStepTaskId = (stepOut.result as { task: { id: string } }).task.id;
        created.taskIds.push(firstStepTaskId);
      }
      result.projects.push({ id: project.id, name: p.name, firstStepTaskId });
    }

    result.counts = {
      tasks: result.tasks.length,
      habits: result.habits.length,
      projects: result.projects.length,
    };

    return {
      result,
      before: null,
      inverse: { op: "starter.undo", input: created },
      touched: rows,
      afterCommit: [publishTasksUpdated(ctx.userId), ...effects],
    };
  },
});

/** Inverse-only: archives what `starter.create` made. */
export const starterUndo = defineOp({
  name: "starter.undo",
  description: "Archive what the Starter game created. Used only by undo.",
  risk: "reversible",
  internal: true,
  input: z
    .object({
      taskIds: z.array(z.string().min(1)).max(120),
      projectIds: z.array(z.string().min(1)).max(40),
      habitIds: z.array(z.string().min(1)).max(40),
    })
    .strict(),
  async run(ctx, input) {
    const rows: TouchedRow[] = [];
    const effects: NonNullable<OpRunOutput<unknown>["afterCommit"]> = [];
    for (const taskId of input.taskIds) {
      const out = await taskArchive.run(ctx, { taskId });
      rows.push(...(out.touched ?? []));
      // `task.archive` lists the block push first and the realtime nudge last.
      effects.push(...(out.afterCommit ?? []).slice(0, 1));
    }
    for (const projectId of input.projectIds) {
      const out = await projectArchive.run(ctx, { projectId });
      rows.push(...(out.touched ?? []));
    }
    for (const habitId of input.habitIds) {
      const habit = await ctx.tx.habit.findFirst({
        where: { id: habitId, ...ctx.scope },
      });
      if (!habit) throw new OpError("NOT_FOUND", "Habit not found");
      if (habit.archivedAt) continue;
      const updated = await ctx.tx.habit.update({
        where: { id: habit.id },
        data: { archivedAt: newDate(), isActive: false },
      });
      rows.push(touched("habit", updated, habit));
    }
    return {
      result: {
        tasks: input.taskIds.length,
        projects: input.projectIds.length,
        habits: input.habitIds.length,
      },
      touched: rows,
      afterCommit: [publishTasksUpdated(ctx.userId), ...effects],
    };
  },
});

export const starterOps = [starterCreate, starterUndo];
