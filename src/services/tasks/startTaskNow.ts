import { FocusSessionMode, IdempotencyStatus, Prisma } from "@prisma/client";

import {
  type WorkspaceAccess,
  workspaceDataScopeWhere,
} from "@/lib/auth/workspace-auth";
import { formatInTimeZone, newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";
import { openTaskWhere } from "@/lib/tasks/open-task";

import { TaskStatus } from "@/types/task";

export class ActiveFocusSessionError extends Error {}
export class TaskNotFoundError extends Error {}
export class OutsideWorkHoursError extends Error {}

export async function startTaskNow(input: {
  userId: string;
  workspace?: WorkspaceAccess;
  taskId: string;
  durationMinutes: number;
  startFocus: boolean;
  idempotencyKey: string;
  confirmOutsideWorkHours?: boolean;
}) {
  const operation = "start-task-now";
  const existing = await prisma.idempotencyRecord.findUnique({
    where: {
      userId_operation_key: {
        userId: input.userId,
        operation,
        key: input.idempotencyKey,
      },
    },
  });
  if (existing) return existing;

  const [task, activeFocus] = await Promise.all([
    prisma.task.findFirst({
      where: {
        id: input.taskId,
        ...workspaceDataScopeWhere(input.workspace, input.userId),
        // An idea has no time to start now (idea cards): not found.
        ...openTaskWhere(),
        isArchived: false,
      },
      select: { id: true, scheduleId: true },
    }),
    input.startFocus
      ? prisma.focusSession.findFirst({
          where: { userId: input.userId, endedAt: null },
          select: { id: true },
        })
      : null,
  ]);
  if (!task) throw new TaskNotFoundError("Task not found.");
  if (activeFocus) {
    throw new ActiveFocusSessionError("A focus session is already active.");
  }
  const schedule =
    (task.scheduleId
      ? await prisma.workSchedule.findFirst({
          where: { id: task.scheduleId, userId: input.userId },
          include: { windows: true },
        })
      : null) ??
    (await prisma.workSchedule.findFirst({
      where: { userId: input.userId },
      include: { windows: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    }));
  if (schedule) {
    const now = newDate();
    const dayOfWeek = Number(formatInTimeZone(now, schedule.timeZone, "i")) % 7;
    const time = formatInTimeZone(now, schedule.timeZone, "HH:mm");
    const inside = schedule.windows.some(
      (window) =>
        window.dayOfWeek === dayOfWeek &&
        time >= window.startTime &&
        time < window.endTime
    );
    if (!inside && !input.confirmOutsideWorkHours) {
      throw new OutsideWorkHoursError("OUTSIDE_WORK_HOURS");
    }
  }

  let command;
  try {
    command = await prisma.idempotencyRecord.create({
      data: {
        userId: input.userId,
        operation,
        key: input.idempotencyKey,
        expiresAt: new Date(Date.now() + 2 * 60 * 1_000),
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return prisma.idempotencyRecord.findUniqueOrThrow({
        where: {
          userId_operation_key: {
            userId: input.userId,
            operation,
            key: input.idempotencyKey,
          },
        },
      });
    }
    throw error;
  }

  try {
    const start = newDate();
    const end = newDate(start.getTime() + input.durationMinutes * 60_000);
    const result = await prisma.$transaction(async (tx) => {
      const updatedTask = await tx.task.update({
        where: { id: task.id },
        data: {
          duration: input.durationMinutes,
          estimatedMinutes: input.durationMinutes,
          scheduledStart: start,
          scheduledEnd: end,
          isAutoScheduled: true,
          autoScheduled: true,
          scheduleLocked: true,
          status: TaskStatus.IN_PROGRESS,
        },
      });
      const block = await tx.scheduledBlock.upsert({
        where: { taskId_chunkIndex: { taskId: task.id, chunkIndex: 0 } },
        update: { userId: input.userId, start, end, isFrozen: true },
        create: {
          userId: input.userId,
          taskId: task.id,
          start,
          end,
          chunkIndex: 0,
          chunkCount: 1,
          isFrozen: true,
        },
      });
      const focusSession = input.startFocus
        ? await tx.focusSession.create({
            data: {
              userId: input.userId,
              taskId: task.id,
              mode: FocusSessionMode.POMODORO,
              plannedMinutes: input.durationMinutes,
              startedAt: start,
              source: "start-task-now",
            },
          })
        : null;
      return { updatedTask, block, focusSession };
    });

    return prisma.idempotencyRecord.update({
      where: { id: command.id },
      data: {
        status: IdempotencyStatus.SUCCEEDED,
        result: {
          taskId: result.updatedTask.id,
          blockId: result.block.id,
          focusSessionId: result.focusSession?.id ?? null,
        },
      },
    });
  } catch (error) {
    await prisma.idempotencyRecord.update({
      where: { id: command.id },
      data: {
        status: IdempotencyStatus.FAILED,
        result: {
          error:
            error instanceof ActiveFocusSessionError
              ? "ACTIVE_FOCUS_SESSION"
              : error instanceof TaskNotFoundError
                ? "TASK_NOT_FOUND"
                : error instanceof OutsideWorkHoursError
                  ? "OUTSIDE_WORK_HOURS"
                  : "START_FAILED",
        },
      },
    });
    throw error;
  }
}
