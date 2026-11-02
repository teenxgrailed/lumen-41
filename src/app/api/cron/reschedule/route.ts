import { NextRequest, NextResponse } from "next/server";

import {
  createSchedulingRun,
  executeSchedulingRun,
  reapSchedulingRuns,
} from "@/services/scheduling/runs";
import { SchedulingRunSource } from "@prisma/client";

import { requireCronSecret } from "@/lib/cron/auth";
import { prisma } from "@/lib/prisma";
import { reapExpiredIdempotencyRecords } from "@/lib/pwa/offline-mutation";
import { enqueueReschedule, isQueueConfigured } from "@/lib/queue/enqueue";

const CRON_STATE_ID = "reschedule";
const BATCH_SIZE = 50;
const BUDGET_MS = 45_000;

export async function GET(request: NextRequest) {
  const unauthorized = requireCronSecret(request);
  if (unauthorized) return unauthorized;

  const startedAt = Date.now();
  await Promise.all([reapSchedulingRuns(), reapExpiredIdempotencyRecords()]);
  const state = await prisma.cronState.upsert({
    where: { id: CRON_STATE_ID },
    update: { lastStartedAt: new Date() },
    create: { id: CRON_STATE_ID, lastStartedAt: new Date() },
  });
  let userIds = Array.isArray(state.pendingUserIds)
    ? state.pendingUserIds.filter(
        (value): value is string => typeof value === "string"
      )
    : [];
  if (userIds.length === 0) {
    const users = await prisma.user.findMany({
      where: {
        // No settings row means nothing to schedule; skip instead of failing.
        autoScheduleSettings: { isNot: null },
        ...(state.completedCursor ? { id: { gt: state.completedCursor } } : {}),
      },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      select: { id: true },
    });
    userIds = users.map((user) => user.id);
    if (userIds.length === 0 && state.completedCursor) {
      await prisma.cronState.update({
        where: { id: CRON_STATE_ID },
        data: { completedCursor: null },
      });
      return NextResponse.json({ ok: true, queued: 0, wrapped: true });
    }
    await prisma.cronState.update({
      where: { id: CRON_STATE_ID },
      data: {
        pendingCursor: userIds.at(-1) ?? state.completedCursor,
        pendingUserIds: userIds,
      },
    });
  }

  const results: Array<{
    userId: string;
    runId?: string;
    ok: boolean;
    error?: string;
  }> = [];
  const cronWindow = Math.floor(Date.now() / (30 * 60 * 1_000));
  for (const userId of userIds) {
    if (Date.now() - startedAt >= BUDGET_MS) break;
    try {
      const run = await createSchedulingRun({
        userId,
        source: SchedulingRunSource.CRON,
        dedupeKey: `cron:${cronWindow}:${userId}`,
      });
      if (isQueueConfigured()) {
        await enqueueReschedule(userId, run.id);
      } else {
        await executeSchedulingRun(run.id);
      }
      results.push({ userId, runId: run.id, ok: true });
    } catch (error) {
      results.push({
        userId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const processed = new Set(results.map((result) => result.userId));
  const remaining = userIds.filter((userId) => !processed.has(userId));
  await prisma.cronState.update({
    where: { id: CRON_STATE_ID },
    data:
      remaining.length > 0
        ? {
            pendingUserIds: remaining,
            lastError: results.find((r) => !r.ok)?.error,
          }
        : {
            completedCursor: userIds.at(-1) ?? state.completedCursor,
            pendingCursor: null,
            pendingUserIds: [],
            lastSucceededAt: new Date(),
            lastError: results.find((result) => !result.ok)?.error ?? null,
          },
  });

  return NextResponse.json({
    ok: results.every((result) => result.ok),
    queued: results.length,
    remaining: remaining.length,
    elapsedMs: Date.now() - startedAt,
    results,
  });
}
