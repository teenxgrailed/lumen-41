import { sendConnectorWebhook } from "@/services/connectors/webhooks";
import { scheduleAllTasksForUserDetailed } from "@/services/scheduling/TaskSchedulingService";
import { SchedulingRunSource, SchedulingRunStatus } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";
import { activeProjectTaskWhere } from "@/lib/projects/archive";
import { publishRealtimeEvent } from "@/lib/realtime/publish";
import { repushDirtyBlocks } from "@/lib/task-block-push";

type ScheduleSnapshot = Map<
  string,
  { start: number | null; end: number | null; auto: boolean }
>;

async function scheduleSnapshot(
  userId: string,
  workspaceId?: string | null
): Promise<ScheduleSnapshot> {
  const tasks = await prisma.task.findMany({
    where: {
      assigneeId: userId,
      ...(workspaceId ? { workspaceId } : {}),
      isArchived: false,
      AND: [activeProjectTaskWhere],
    },
    select: {
      id: true,
      scheduledStart: true,
      scheduledEnd: true,
      isAutoScheduled: true,
      autoScheduled: true,
    },
  });
  return new Map(
    tasks.map((task) => [
      task.id,
      {
        start: task.scheduledStart?.getTime() ?? null,
        end: task.scheduledEnd?.getTime() ?? null,
        auto: task.isAutoScheduled || task.autoScheduled,
      },
    ])
  );
}

export async function createSchedulingRun(input: {
  userId: string;
  workspaceId?: string;
  source: SchedulingRunSource;
  dedupeKey: string;
}) {
  return prisma.schedulingRun.upsert({
    where: {
      userId_dedupeKey: {
        userId: input.userId,
        dedupeKey: input.dedupeKey,
      },
    },
    update: {},
    create: input,
  });
}

export async function executeSchedulingRun(runId: string) {
  const run = await prisma.schedulingRun.findUnique({
    where: { id: runId },
  });
  // Queue retention and database retention are intentionally independent.
  // A delayed/retried job can outlive its finished run row; treating that as
  // already handled keeps the worker idempotent instead of retrying forever.
  if (!run) return null;
  if (run.status === SchedulingRunStatus.SUCCEEDED) return run;

  await prisma.schedulingRun.update({
    where: { id: run.id },
    data: {
      status: SchedulingRunStatus.RUNNING,
      startedAt: newDate(),
      errorCode: null,
      errorMessage: null,
    },
  });

  try {
    const before = await scheduleSnapshot(run.userId, run.workspaceId);
    const { tasks, scheduleResult } = await scheduleAllTasksForUserDetailed(
      run.userId,
      { workspaceId: run.workspaceId ?? undefined }
    );
    const after = await scheduleSnapshot(run.userId, run.workspaceId);
    let changedTaskCount = 0;
    let placedBlockCount = 0;

    for (const [taskId, next] of after) {
      const previous = before.get(taskId);
      if (
        !previous ||
        previous.start !== next.start ||
        previous.end !== next.end
      ) {
        changedTaskCount += 1;
      }
      if (next.auto && next.start !== null && next.end !== null) {
        placedBlockCount += 1;
      }
    }

    const unscheduled = scheduleResult.unscheduled.map(
      ({ taskId, reason }) => ({ taskId, reason })
    );

    await repushDirtyBlocks(run.userId, run.workspaceId ?? undefined);
    await sendConnectorWebhook({
      userId: run.userId,
      event: "schedule.changed",
      payload: {
        changedTaskCount,
        unscheduledCount: unscheduled.length,
        atRiskTaskIds: (scheduleResult.atRisk ?? []).map((t) => t.taskId),
      },
    });

    const completed = await prisma.schedulingRun.update({
      where: { id: run.id },
      data: {
        status: SchedulingRunStatus.SUCCEEDED,
        changedTaskCount,
        placedBlockCount,
        unchangedTaskCount: Math.max(0, tasks.length - changedTaskCount),
        unscheduled,
        finishedAt: newDate(),
      },
    });
    await publishRealtimeEvent(run.userId, "schedule-run-updated", {
      runId: run.id,
      status: completed.status,
    });
    await publishRealtimeEvent(run.userId, "tasks-updated");
    return completed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failed = await prisma.schedulingRun.update({
      where: { id: run.id },
      data: {
        status: SchedulingRunStatus.FAILED,
        errorCode: "SCHEDULING_FAILED",
        errorMessage: message.slice(0, 500),
        finishedAt: newDate(),
      },
    });
    await publishRealtimeEvent(run.userId, "schedule-run-updated", {
      runId: run.id,
      status: failed.status,
    });
    throw error;
  }
}

export async function reapSchedulingRuns() {
  const staleBefore = newDate(newDate().getTime() - 15 * 60 * 1_000);
  const retentionBefore = newDate(
    newDate().getTime() - 30 * 24 * 60 * 60 * 1_000
  );
  const [failed, deleted] = await prisma.$transaction([
    prisma.schedulingRun.updateMany({
      where: {
        status: SchedulingRunStatus.RUNNING,
        startedAt: { lt: staleBefore },
      },
      data: {
        status: SchedulingRunStatus.FAILED,
        errorCode: "WORKER_TIMEOUT",
        errorMessage: "The worker stopped before completing this run.",
        finishedAt: newDate(),
      },
    }),
    prisma.schedulingRun.deleteMany({
      where: {
        status: {
          in: [SchedulingRunStatus.SUCCEEDED, SchedulingRunStatus.FAILED],
        },
        finishedAt: { lt: retentionBefore },
      },
    }),
  ]);
  return { failed: failed.count, deleted: deleted.count };
}
