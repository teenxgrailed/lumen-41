import { logger } from "@/lib/logger";
import { enqueueEasyStartCreate } from "@/lib/queue/enqueue";

const LOG_SOURCE = "easy-start-queue";

/**
 * Called after a task is created: a task with no entry is queued for its easy
 * first step. Never throws and never waits for the AI (the worker does that),
 * so creating a task cannot fail or slow down because of this feature. The
 * worker re-checks the person's setting, the kill switch and the task.
 */
export async function queueEasyStart(task: {
  id: string;
  entry?: string | null;
}): Promise<void> {
  if ((task.entry ?? "").trim()) return;
  try {
    await enqueueEasyStartCreate(task.id);
  } catch (error) {
    logger.warn(
      "Could not queue the easy start step",
      {
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
  }
}
