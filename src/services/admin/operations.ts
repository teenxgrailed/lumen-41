import { collectOperationsHealth } from "@/services/operations/health";
import { collectServiceReadiness } from "@/services/operations/readiness";

import { prisma } from "@/lib/prisma";

/**
 * What the admin Operations page shows: queue depth, cron state, the last
 * good run per source, the last failed run and whether each service is
 * configured. Read by `GET /api/admin/operations` and the MCP admin tools.
 */
export async function getAdminOperations() {
  const [runs, health, services] = await Promise.all([
    prisma.schedulingRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        source: true,
        status: true,
        finishedAt: true,
        errorCode: true,
        errorMessage: true,
      },
    }),
    collectOperationsHealth(),
    collectServiceReadiness(),
  ]);
  const lastSuccessfulBySource = Object.values(
    runs
      .filter((run) => run.status === "SUCCEEDED")
      .reduce<Record<string, (typeof runs)[number]>>((result, run) => {
        result[run.source] ??= run;
        return result;
      }, {})
  );
  return {
    lastSuccessfulBySource,
    queues: health.queues,
    cronStates: health.cronStates,
    lastError: runs.find((run) => run.status === "FAILED") ?? null,
    failedRuns: runs.filter((run) => run.status === "FAILED").slice(0, 20),
    services,
  };
}
