import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ImportHeartbeat";

/** How often a live run proves itself to the sweeper at most. */
export const HEARTBEAT_INTERVAL_MS = 60_000;

/**
 * A run's heartbeat: bumps `updatedAt` on the ImportRun while it is still
 * `running`, so the 30-minute sweeper never fails a live run during a long
 * stretch without a progress tick (discovery, the tree, a large download).
 *
 * Throttled: the first call writes, later calls write only when
 * `intervalMs` has passed since the last write. The clock is injected so the
 * throttle is testable. A failed write is logged, never fatal to the import.
 */
export function createImportHeartbeat(
  importRunId: string,
  options: { now?: () => Date; intervalMs?: number } = {}
): () => Promise<void> {
  const now = options.now ?? (() => newDate());
  const intervalMs = options.intervalMs ?? HEARTBEAT_INTERVAL_MS;
  let last: number | null = null;
  return async () => {
    const at = now();
    if (last !== null && at.getTime() - last < intervalMs) return;
    last = at.getTime();
    try {
      await prisma.importRun.updateMany({
        where: { id: importRunId, status: "running" },
        data: { updatedAt: at },
      });
    } catch (error) {
      await logger.warn(
        "Import heartbeat failed",
        {
          importRunId,
          error: error instanceof Error ? error.message : String(error),
        },
        LOG_SOURCE
      );
    }
  };
}
