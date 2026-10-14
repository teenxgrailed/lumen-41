import { NextRequest, NextResponse } from "next/server";

import { collectOperationsHealth } from "@/services/operations/health";
import { collectServiceReadiness } from "@/services/operations/readiness";

import { requireAdmin } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

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
  return NextResponse.json({
    lastSuccessfulBySource,
    queues: health.queues,
    cronStates: health.cronStates,
    lastError: runs.find((run) => run.status === "FAILED") ?? null,
    services,
  });
}
