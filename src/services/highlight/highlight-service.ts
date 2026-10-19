import { prisma } from "@/lib/prisma";

export const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export const highlightTaskSelect = {
  id: true,
  title: true,
  status: true,
  dueDate: true,
  estimatedMinutes: true,
  duration: true,
  scheduledStart: true,
  scheduledEnd: true,
  trashedAt: true,
} as const;

/** The day's highlight row with its task, or null when none is set. */
export function loadHighlight(
  userId: string,
  workspaceId: string,
  date: string
) {
  return prisma.dailyHighlight.findUnique({
    where: { userId_workspaceId_date: { userId, workspaceId, date } },
    include: { task: { select: highlightTaskSelect } },
  });
}

export type HighlightRow = NonNullable<
  Awaited<ReturnType<typeof loadHighlight>>
>;

/** The day as `{ date, taskId, task }`, or null (none set, or its task is in Trash). */
export function shapeHighlight(row: HighlightRow | null) {
  if (!row || row.task.trashedAt) return null;
  return {
    date: row.date,
    taskId: row.taskId,
    task: {
      id: row.task.id,
      title: row.task.title,
      status: row.task.status,
      dueDate: row.task.dueDate?.toISOString() ?? null,
      estimatedMinutes: row.task.estimatedMinutes,
    },
  };
}
