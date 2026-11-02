import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { TaskSyncManager } from "@/lib/task-sync/task-sync-manager";

const LOG_SOURCE = "TaskMappingSync";

/**
 * Run the one-way selective task sync for a mapping. The manager picks the
 * provider (Google Tasks, Outlook, CalDAV) from the mapping's provider row and
 * records the outcome on the mapping, so a failure here is retried by the sweep.
 */
export async function syncTaskMapping(mappingId: string): Promise<void> {
  const mapping = await prisma.taskListMapping.findUnique({
    where: { id: mappingId },
    include: { provider: true },
  });
  if (!mapping || !mapping.syncEnabled) {
    await logger.info(
      "Skipping unavailable or disabled task list mapping",
      { mappingId },
      LOG_SOURCE
    );
    return;
  }
  if (!mapping.provider.enabled || !mapping.provider.syncEnabled) {
    await logger.info(
      "Skipping task list mapping of a disabled provider",
      { mappingId },
      LOG_SOURCE
    );
    return;
  }
  await new TaskSyncManager().syncTaskList(mapping);
}
