import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";
import { enqueueTaskListSync } from "@/lib/queue/enqueue";

export const STALE_TASK_MAPPING_SWEEP_INTERVAL_MS = 30 * 60_000;
export const STALE_TASK_MAPPING_AFTER_MS = 6 * 60 * 60_000;
export const STALE_TASK_MAPPING_BATCH = 25;

/**
 * Task providers have no push, so a mapping that was never synced (connected
 * before the first-sync hook, or the first sync failed) stayed empty. Re-sync a
 * small batch of Google Tasks and Outlook Tasks mappings that never synced or
 * are older than six hours.
 */
export async function sweepStaleTaskMappings(): Promise<number> {
  const types = ["OUTLOOK", "GOOGLE"];
  const cutoff = newDate(newDate().getTime() - STALE_TASK_MAPPING_AFTER_MS);
  const mappings = await prisma.taskListMapping.findMany({
    where: {
      syncEnabled: true,
      provider: {
        enabled: true,
        syncEnabled: true,
        OR: types.map((type) => ({
          type: { equals: type, mode: "insensitive" as const },
        })),
      },
      AND: [
        { OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: cutoff } }] },
        // A list that keeps failing waits out its backoff instead of being
        // picked first on every run.
        {
          OR: [
            { nextSyncAttemptAt: null },
            { nextSyncAttemptAt: { lte: newDate() } },
          ],
        },
      ],
    },
    select: { id: true },
    orderBy: { lastSyncedAt: { sort: "asc", nulls: "first" } },
    take: STALE_TASK_MAPPING_BATCH,
  });
  await Promise.all(mappings.map((m) => enqueueTaskListSync(m.id)));
  return mappings.length;
}
