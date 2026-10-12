import type { SubscriptionPlan, TaskReminderKind } from "@prisma/client";

export type DefaultTaskReminder = {
  kind: TaskReminderKind;
  offsetMinutes: number;
};

/**
 * Reminders every new task gets. Free gets one: an hour before the deadline
 * when there is one, otherwise ten minutes before the start. Paid plans get
 * both.
 */
export function defaultTaskReminders(
  plan: SubscriptionPlan,
  task: { deadline: Date | null; dueDate: Date | null }
): DefaultTaskReminder[] {
  if (plan === "FREE") {
    return task.deadline || task.dueDate
      ? [{ kind: "BEFORE_DEADLINE", offsetMinutes: 60 }]
      : [{ kind: "BEFORE_START", offsetMinutes: 10 }];
  }
  return [
    { kind: "BEFORE_START", offsetMinutes: 10 },
    { kind: "BEFORE_DEADLINE", offsetMinutes: 60 },
  ];
}

export function defaultTaskReminderRows(
  plan: SubscriptionPlan,
  task: { id: string; deadline: Date | null; dueDate: Date | null },
  userId: string
) {
  return defaultTaskReminders(plan, task).map((reminder) => ({
    userId,
    taskId: task.id,
    ...reminder,
    channels: ["push", "email"],
  }));
}
