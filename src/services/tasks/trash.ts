import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { deleteTaskBlockEvent } from "@/lib/task-block-push";

const LOG_SOURCE = "task-trash";

type TrashedTask = {
  id: string;
  assigneeId: string | null;
  userId: string | null;
  blockEventId: string | null;
  blockFeedId: string | null;
};

const SELECT = {
  id: true,
  assigneeId: true,
  userId: true,
  blockEventId: true,
  blockFeedId: true,
} as const;

/**
 * The delete itself, shared by Delete forever and the 30-day purge. Parts,
 * waits, reminders, time entries and blocks go with the task (cascade); the
 * calendar block it pushed is removed first, best effort.
 */
async function destroyTask(task: TrashedTask) {
  const owner = task.assigneeId ?? task.userId;
  if (owner && task.blockEventId && task.blockFeedId) {
    try {
      await deleteTaskBlockEvent(owner, task.blockEventId, task.blockFeedId);
    } catch (error) {
      logger.warn(
        "Could not remove the calendar block of a purged task",
        { taskId: task.id, error: error instanceof Error ? error.message : "" },
        LOG_SOURCE
      );
    }
  }
  await prisma.task.delete({ where: { id: task.id } });
}

/**
 * Deletes one task that is already in Trash for good. `scope` carries the
 * caller's workspace scope. A task that is not in Trash is refused: Delete
 * forever is only offered from Trash.
 */
export async function deleteTaskForever(
  id: string,
  scope: Record<string, unknown>
): Promise<"deleted" | "not-found" | "not-trashed"> {
  const task = await prisma.task.findFirst({
    where: { id, ...scope },
    select: { ...SELECT, trashedAt: true },
  });
  if (!task) return "not-found";
  if (!task.trashedAt) return "not-trashed";
  await destroyTask(task);
  return "deleted";
}

/**
 * The worker's 30-day purge: every task in Trash since before `cutoff` goes
 * for good. One task failing (a recurring master that still has occurrences)
 * does not stop the rest; the next sweep retries it. Returns how many went.
 */
export async function purgeTrashedTasksBefore(cutoff: Date) {
  const due = await prisma.task.findMany({
    where: { trashedAt: { not: null, lt: cutoff } },
    select: SELECT,
    take: 500,
  });
  let removed = 0;
  for (const task of due) {
    try {
      await destroyTask(task);
      removed += 1;
    } catch (error) {
      logger.warn(
        "Could not purge a trashed task",
        { taskId: task.id, error: error instanceof Error ? error.message : "" },
        LOG_SOURCE
      );
    }
  }
  return removed;
}
