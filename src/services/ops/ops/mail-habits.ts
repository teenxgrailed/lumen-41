import {
  habitTodayKey,
  setHabitCompletion,
} from "@/services/habits/habit-service";
import { z } from "zod";

import { getMailMessage } from "@/lib/mail-db";

import { OpError } from "../errors";
import {
  dayKeySchema,
  publishTasksUpdated,
  taskView,
  touched,
} from "../helpers";
import { defineOp } from "../types";
import type { OpContext } from "../types";

export const mailToTask = defineOp({
  name: "mail.to_task",
  description:
    "Create a follow-up task from a synced mail message. Undo archives the task.",
  risk: "reversible",
  // Copies the message's sender, subject and snippet into the task.
  scopes: ["mail.read"],
  input: z
    .object({
      messageId: z.string().min(1),
      title: z.string().trim().min(1).max(160).optional(),
      estimateMinutes: z.number().int().min(5).max(1440).optional(),
    })
    .strict(),
  async run(ctx, input) {
    // Mail is account-global (see ACCOUNT_GLOBAL_RESOURCES); ownership is
    // checked by the mail account's user, not the workspace.
    const message = await getMailMessage(ctx.userId, input.messageId);
    if (!message) throw new OpError("NOT_FOUND", "Mail message not found");
    const task = await ctx.tx.task.create({
      data: {
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        assigneeId: ctx.userId,
        title: input.title ?? `Follow up: ${message.subject}`.slice(0, 160),
        description: `From ${message.fromName || message.fromAddress || "unknown sender"}\n\n${message.snippet}`,
        status: "todo",
        source: "mail",
        estimatedMinutes: input.estimateMinutes,
        duration: input.estimateMinutes,
        isAutoScheduled: true,
        activities: {
          create: {
            workspaceId: ctx.workspaceId,
            actorId: ctx.userId,
            action: "CREATED",
          },
        },
      },
      include: { tags: { select: { id: true } } },
    });
    return {
      result: { task: taskView(task), messageId: message.id },
      before: null,
      inverse: { op: "task.archive", input: { taskId: task.id } },
      touched: [touched("task", task, null)],
      afterCommit: [publishTasksUpdated(ctx.userId)],
    };
  },
});

const habitInput = z
  .object({ habitId: z.string().min(1), date: dayKeySchema.optional() })
  .strict();

async function setHabitDay(
  ctx: OpContext,
  input: z.infer<typeof habitInput>,
  completed: boolean
) {
  const today = await habitTodayKey(ctx.userId);
  const dateKey = input.date ?? today;
  // Keys are YYYY-MM-DD, so string order is calendar order.
  if (dateKey > today) {
    throw new OpError(
      "INVALID_INPUT",
      "A habit cannot be logged for a future day"
    );
  }
  const outcome = await setHabitCompletion(ctx.tx, {
    userId: ctx.userId,
    workspace: ctx.workspace,
    habitId: input.habitId,
    dateKey,
    completed,
  });
  if (!outcome) throw new OpError("NOT_FOUND", "Habit not found");
  const { changed, ...result } = outcome;
  return {
    result: { ...result, changed },
    before: { completed: changed ? !completed : completed },
    // Only a real change has something to undo; a repeated log stays put.
    inverse: changed
      ? {
          op: completed ? "habit.unlog" : "habit.log",
          input: { habitId: outcome.habitId, date: dateKey },
        }
      : null,
    // HabitCompletion has no updatedAt, so there is no row version to check.
    touched: [],
  };
}

export const habitLog = defineOp({
  name: "habit.log",
  description:
    "Mark a habit done for a day (default: today in the user's time zone). Undo clears the day.",
  risk: "reversible",
  input: habitInput,
  run: (ctx, input) => setHabitDay(ctx, input, true),
});

export const habitUnlog = defineOp({
  name: "habit.unlog",
  description: "Clear a habit's done mark for a day. Undo marks it again.",
  risk: "reversible",
  input: habitInput,
  run: (ctx, input) => setHabitDay(ctx, input, false),
});

export const mailHabitOps = [mailToTask, habitLog, habitUnlog];
