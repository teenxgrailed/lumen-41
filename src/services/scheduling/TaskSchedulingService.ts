import { getLearnedDurationRatio } from "@/services/ai/memory";
import { personalBusyBlocks } from "@/services/personal-time/service";
import {
  blockingEventWhere,
  pushedBlockExternalIds,
  resolveBusyFeedIds,
} from "@/services/scheduling/busy-feeds";
import { selectTasksWithinAutoScheduleLimit } from "@/services/scheduling/entitlement-selection";
import { withUserScheduleLock } from "@/services/scheduling/user-schedule-lock";
import { getCalibrationContext } from "@/services/time-tracking/calibration";

import { addCalendarDays, formatInTimeZone } from "@/lib/date-utils";
import { canAutoScheduleMore } from "@/lib/entitlements";
import { normalizeUserTimeZone } from "@/lib/habit-completion-date";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { activeProjectTaskWhere } from "@/lib/projects/archive";
import { deriveProjectBlockerDependencies } from "@/lib/projects/blockers";

import { ProjectStatus } from "@/types/project";
import {
  EnergyLevel,
  Priority,
  SchedulingEnergyLevel,
  SchedulingTaskPriority,
  TaskStatus,
  TaskWithRelations,
  TimePreference,
} from "@/types/task";

import {
  CalendarBusyBlock,
  SchedulableTask,
  ScheduleResult,
  SchedulingPreferences,
  scheduleTasks,
} from "./engine";

const LOG_SOURCE = "TaskSchedulingService";
const DEFAULT_HORIZON_DAYS = 21;
const DEFAULT_WORK_HOURS: SchedulingPreferences["workHours"] = {
  "1": { start: "09:00", end: "17:00" },
  "2": { start: "09:00", end: "17:00" },
  "3": { start: "09:00", end: "17:00" },
  "4": { start: "09:00", end: "17:00" },
  "5": { start: "09:00", end: "17:00" },
};

type DbTaskWithRelations = {
  id: string;
  title: string;
  assigneeId: string | null;
  description: string | null;
  status: string;
  dueDate: Date | null;
  startDate: Date | null;
  duration: number | null;
  priority: string | null;
  energyLevel: string | null;
  preferredTime: string | null;
  energyRequired: SchedulingEnergyLevel;
  estimatedMinutes: number | null;
  estLikely: number | null;
  minChunkMinutes: number | null;
  maxChunkMinutes: number | null;
  deadline: Date | null;
  hardDeadline: boolean;
  priorityLevel: SchedulingTaskPriority;
  contextTag: string | null;
  isFrozen: boolean;
  dependsOnId: string | null;
  dependsOn?: {
    status: string;
  } | null;
  blockedByDependencies?: {
    blockerTaskId: string;
    blocker: {
      status: string;
    };
  }[];
  projectBlockersTargeted?: {
    id: string;
    blockerTask: { status: string } | null;
  }[];
  stage?: {
    blockers: {
      id: string;
      blockerTask: { status: string } | null;
    }[];
  } | null;
  autoScheduled: boolean;
  scheduledBlocks?: {
    id: string;
    taskId: string;
    userId: string | null;
    start: Date;
    end: Date;
    chunkIndex: number;
    chunkCount: number;
    isFrozen: boolean;
  }[];
  projectId: string | null;
  createdAt: Date;
  updatedAt: Date;
  recurrenceRule: string | null;
  lastCompletedDate: Date | null;
  completedAt: Date | null;
  isRecurring: boolean;
  isAutoScheduled: boolean;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  scheduleId: string | null;
  scheduleScore: number | null;
  lastScheduled: Date | null;
  scheduleLocked: boolean;
  availableFrom: Date | null;
  postponedUntil: Date | null;
  isArchived: boolean;
  archivedAt: Date | null;
  userId: string | null;
  tags: {
    id: string;
    name: string;
    color: string | null;
    userId: string | null;
  }[];
  project: {
    id: string;
    name: string;
    description: string | null;
    color: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    userId: string | null;
  } | null;
};

function parseWorkDays(value: string | null | undefined): number[] {
  if (!value) {
    return [1, 2, 3, 4, 5];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is number =>
            Number.isInteger(item) && item >= 0 && item <= 6
        )
      : [1, 2, 3, 4, 5];
  } catch {
    return [1, 2, 3, 4, 5];
  }
}

function toTime(hour: number): string {
  return `${hour.toString().padStart(2, "0")}:00`;
}

function addDays(date: Date, days: number): Date {
  return addCalendarDays(date, days);
}

function convertDbTaskToTaskWithRelations(
  dbTask: DbTaskWithRelations
): TaskWithRelations {
  return {
    ...dbTask,
    status: dbTask.status as TaskStatus,
    priority: dbTask.priority as Priority | null,
    energyLevel: dbTask.energyLevel as EnergyLevel | null,
    preferredTime: dbTask.preferredTime as TimePreference | null,
    tags: dbTask.tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      color: tag.color || undefined,
    })),
    project: dbTask.project
      ? {
          ...dbTask.project,
          status: dbTask.project.status as ProjectStatus,
        }
      : null,
  };
}

function toSchedulableTask(task: DbTaskWithRelations): SchedulableTask {
  const availabilityDates = [
    task.availableFrom,
    task.startDate,
    task.postponedUntil,
  ].filter((value): value is Date => value !== null);
  const projectBlockers = deriveProjectBlockerDependencies([
    ...(task.projectBlockersTargeted ?? []),
    ...(task.stage?.blockers ?? []),
  ]);
  return {
    id: task.id,
    title: task.title,
    assigneeId: task.assigneeId,
    status: task.status,
    createdAt: task.createdAt,
    estimatedMinutes: task.estLikely ?? task.estimatedMinutes,
    durationMinutes: task.duration,
    minChunkMinutes: task.minChunkMinutes,
    maxChunkMinutes: task.maxChunkMinutes,
    deadline: task.deadline ?? task.dueDate,
    hardDeadline: task.hardDeadline,
    availableFrom:
      availabilityDates.length > 0
        ? availabilityDates.reduce((latest, value) =>
            value > latest ? value : latest
          )
        : null,
    priority: task.priorityLevel,
    energyRequired: task.energyRequired,
    contextTag: task.contextTag,
    isFrozen: task.isFrozen || task.scheduleLocked,
    dependsOnId: task.dependsOnId,
    dependencyIds: [
      ...(task.blockedByDependencies?.map(
        (dependency) => dependency.blockerTaskId
      ) ?? []),
      ...projectBlockers.dependencyIds,
    ],
    completedDependencyIds: [
      ...(task.blockedByDependencies
        ?.filter(
          (dependency) => dependency.blocker.status === TaskStatus.COMPLETED
        )
        .map((dependency) => dependency.blockerTaskId) ?? []),
      ...(task.dependsOnId && task.dependsOn?.status === TaskStatus.COMPLETED
        ? [task.dependsOnId]
        : []),
      ...projectBlockers.completedDependencyIds,
    ],
    autoScheduled: task.autoScheduled || task.isAutoScheduled,
    scheduledStart: task.scheduledStart,
    scheduledEnd: task.scheduledEnd,
    scheduleId: task.scheduleId,
    isRecurring: task.isRecurring,
    recurrenceRule: task.recurrenceRule,
  };
}

function buildPreferences(
  smartPrefs: {
    workHours: unknown;
    bufferMinutes: number;
    maxDeepWorkPerDay: number;
    minBreakMinutes: number;
    autoRescheduleOnMiss: boolean;
    enableBodyDoubling: boolean;
    enableTaskBatching: boolean;
    hardStopTime: string;
    bufferMultiplier: number;
  } | null,
  legacySettings: {
    workDays: string;
    workHourStart: number;
    workHourEnd: number;
    bufferMinutes: number;
  }
): SchedulingPreferences {
  if (smartPrefs) {
    return {
      workHours:
        smartPrefs.workHours &&
        typeof smartPrefs.workHours === "object" &&
        !Array.isArray(smartPrefs.workHours)
          ? (smartPrefs.workHours as SchedulingPreferences["workHours"])
          : DEFAULT_WORK_HOURS,
      bufferMinutes: smartPrefs.bufferMinutes,
      maxDeepWorkPerDay: smartPrefs.maxDeepWorkPerDay,
      minBreakMinutes: smartPrefs.minBreakMinutes,
      autoRescheduleOnMiss: smartPrefs.autoRescheduleOnMiss,
      enableBodyDoubling: smartPrefs.enableBodyDoubling,
      enableTaskBatching: smartPrefs.enableTaskBatching,
      hardStopTime: smartPrefs.hardStopTime,
      bufferMultiplier: smartPrefs.bufferMultiplier,
    };
  }

  return {
    workHours: Object.fromEntries(
      parseWorkDays(legacySettings.workDays).map((day) => [
        String(day),
        {
          start: toTime(legacySettings.workHourStart),
          end: toTime(legacySettings.workHourEnd),
        },
      ])
    ),
    bufferMinutes: legacySettings.bufferMinutes,
    maxDeepWorkPerDay: 180,
    minBreakMinutes: 15,
    autoRescheduleOnMiss: true,
    enableBodyDoubling: false,
    enableTaskBatching: true,
    hardStopTime: toTime(legacySettings.workHourEnd),
    bufferMultiplier: 1.3,
  };
}

function summarizeSchedule(result: ScheduleResult) {
  return {
    blocks: result.blocks.length,
    frozenBlocks: result.frozenBlocks.length,
    unscheduled: result.unscheduled.length,
    atRisk: result.atRisk?.length ?? 0,
  };
}

/**
 * Plans and writes the person's schedule. Runs for one person never overlap
 * (see `withUserScheduleLock`), so a second run sees the first one's blocks
 * instead of racing it for the same slots.
 */
export function scheduleAllTasksForUserDetailed(
  userId: string,
  options: { entitlementUserId?: string; workspaceId?: string } = {}
): Promise<{ tasks: TaskWithRelations[]; scheduleResult: ScheduleResult }> {
  return withUserScheduleLock(userId, () =>
    scheduleAllTasksForUserLocked(userId, options)
  );
}

async function scheduleAllTasksForUserLocked(
  userId: string,
  options: { entitlementUserId?: string; workspaceId?: string }
): Promise<{ tasks: TaskWithRelations[]; scheduleResult: ScheduleResult }> {
  try {
    logger.info("Starting task scheduling for user", { userId }, LOG_SOURCE);

    const legacySettings = await prisma.autoScheduleSettings.findUnique({
      where: { userId },
    });

    if (!legacySettings) {
      throw new Error("Auto-schedule settings not found for user");
    }

    // Hours and days are wall-clock in the person's zone; the server runs UTC.
    const userSettings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { timeZone: true },
    });
    const timeZone = normalizeUserTimeZone(userSettings?.timeZone);
    const [smartPrefs, workSchedules, flexibleHoursOverrides] =
      await Promise.all([
        prisma.schedulingPreferences.findUnique({ where: { userId } }),
        prisma.workSchedule.findMany({
          where: { userId },
          include: {
            windows: {
              orderBy: [{ dayOfWeek: "asc" }, { sortOrder: "asc" }],
            },
          },
          orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        }),
        prisma.flexibleHoursOverride.findMany({
          where: {
            userId,
            date: {
              // The column is a date: today in the person's zone, as UTC midnight.
              gte: new Date(
                `${formatInTimeZone(new Date(), timeZone, "yyyy-MM-dd")}T00:00:00.000Z`
              ),
              lt: addDays(new Date(), DEFAULT_HORIZON_DAYS + 1),
            },
          },
          orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        }),
      ]);
    const calibration = await getCalibrationContext(userId);
    // Null unless the person turned "Let Needt learn about me" on.
    const learnedRatio = await getLearnedDurationRatio(
      userId,
      options.workspaceId
    );
    const now = new Date();
    const busyFeedIds = await resolveBusyFeedIds(
      userId,
      legacySettings.excludedCalendars
    );
    // An event that echoes a task block we pushed to a calendar is not busy
    // time: the task owns that slot.
    const pushedBlockIds = await pushedBlockExternalIds(userId);
    const busyEventRows = await prisma.calendarEvent.findMany({
      where: {
        archivedAt: null,
        // All-day events (holidays, working locations) describe the day, not busy time.
        allDay: false,
        ...blockingEventWhere,
        feedId: { in: busyFeedIds },
        feed: { userId, enabled: true },
        start: { lt: addDays(now, DEFAULT_HORIZON_DAYS) },
        end: { gt: now },
        OR: [
          { description: null },
          { NOT: { description: { startsWith: "[NEEDT_DAY_BLOCK]" } } },
        ],
      },
      select: { id: true, start: true, end: true, externalEventId: true },
    });
    const busyEvents = busyEventRows.filter(
      (event) =>
        !event.externalEventId || !pushedBlockIds.has(event.externalEventId)
    );

    const personalBusy: CalendarBusyBlock[] = await personalBusyBlocks(
      userId,
      now,
      addDays(now, DEFAULT_HORIZON_DAYS)
    );

    // A task with fixed times that Needt does not schedule (pinned by hand,
    // made with a start through MCP, dragged) still occupies its slot.
    const pinnedRows = await prisma.task.findMany({
      where: {
        ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
        isAutoScheduled: false,
        autoScheduled: false,
        assigneeId: userId,
        isArchived: false,
        status: { not: TaskStatus.COMPLETED },
        scheduledStart: { not: null, lt: addDays(now, DEFAULT_HORIZON_DAYS) },
        scheduledEnd: { not: null, gt: now },
        AND: [activeProjectTaskWhere],
      },
      select: {
        id: true,
        title: true,
        scheduledStart: true,
        scheduledEnd: true,
      },
    });
    const pinnedBusy: CalendarBusyBlock[] = pinnedRows.flatMap((task) =>
      task.scheduledStart && task.scheduledEnd
        ? [
            {
              id: task.id,
              title: task.title,
              start: task.scheduledStart,
              end: task.scheduledEnd,
              source: "task" as const,
            },
          ]
        : []
    );

    let dbTasks = (await prisma.task.findMany({
      where: {
        ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
        OR: [{ isAutoScheduled: true }, { autoScheduled: true }],
        status: {
          not: {
            in: [TaskStatus.COMPLETED, TaskStatus.IN_PROGRESS],
          },
        },
        assigneeId: userId,
        isArchived: false,
        AND: [activeProjectTaskWhere],
      },
      include: {
        project: true,
        tags: true,
        scheduledBlocks: { orderBy: { chunkIndex: "asc" } },
        dependsOn: { select: { status: true } },
        blockedByDependencies: {
          where: { removedAt: null },
          include: {
            blocker: { select: { status: true } },
          },
        },
        projectBlockersTargeted: {
          where: { resolvedAt: null },
          select: {
            id: true,
            blockerTask: { select: { status: true } },
          },
        },
        stage: {
          select: {
            blockers: {
              where: { resolvedAt: null },
              select: {
                id: true,
                blockerTask: { select: { status: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    })) as DbTaskWithRelations[];
    const entitlement = await canAutoScheduleMore(
      options.entitlementUserId || userId
    );
    dbTasks = selectTasksWithinAutoScheduleLimit(
      dbTasks,
      entitlement,
      (task) =>
        task.scheduledStart !== null || Boolean(task.scheduledBlocks?.length)
    );

    const result = scheduleTasks({
      tasks: dbTasks.map(toSchedulableTask),
      busyBlocks: [
        ...busyEvents.map(
          (event): CalendarBusyBlock => ({
            id: event.id,
            title: "Busy",
            start: event.start,
            end: event.end,
            source: "calendar",
          })
        ),
        // Personal time (Lunch, Walk, Gym...) is protected: no task is placed
        // in it, repeats and blocks linked to an event included.
        ...personalBusy,
        ...pinnedBusy,
      ],
      // Energy windows no longer constrain placement. They narrowed the day to
      // a few hours, so tasks either piled into those hours or found no slot at
      // all, and anything with a hard deadline then fell through to the
      // overflow path — which ignores work hours entirely and could land a task
      // at three in the morning. Owner decision 2026-08-31: schedule against
      // work hours only. `EnergyProfileWindow` rows are left untouched in the
      // database, so an assistant can still read them as a stated preference;
      // they simply no longer decide where a block goes.
      energyProfile: { windows: [] },
      prefs: {
        ...buildPreferences(smartPrefs, legacySettings),
        timeZone,
        calibrationFactors: calibration.factors,
        learnedDurationRatio: learnedRatio ?? undefined,
        defaultScheduleId:
          workSchedules.find((schedule) => schedule.isDefault)?.id ??
          workSchedules[0]?.id ??
          null,
        workHoursBySchedule: Object.fromEntries(
          workSchedules.map((schedule) => [
            schedule.id,
            schedule.windows.reduce<
              Record<string, Array<{ start: string; end: string }>>
            >((days, window) => {
              const day = String(window.dayOfWeek);
              (days[day] ??= []).push({
                start: window.startTime,
                end: window.endTime,
              });
              return days;
            }, {}),
          ])
        ),
        flexibleHoursOverrides: flexibleHoursOverrides.map((override) => ({
          date: override.date.toISOString().slice(0, 10),
          kind: override.kind,
          startTime: override.startTime,
          endTime: override.endTime,
        })),
      },
      now,
    });

    await prisma.task.updateMany({
      where: {
        id: {
          in: dbTasks
            .filter((task) => !task.scheduleLocked && !task.isFrozen)
            .map((task) => task.id),
        },
        assigneeId: userId,
      },
      data: {
        scheduledStart: null,
        scheduledEnd: null,
        scheduleScore: null,
        scheduleAtRisk: false,
      },
    });
    await prisma.scheduledBlock.deleteMany({
      where: {
        userId,
        taskId: {
          in: dbTasks
            .filter((task) => !task.scheduleLocked && !task.isFrozen)
            .map((task) => task.id),
        },
      },
    });

    const firstBlockByTask = new Map<string, (typeof result.blocks)[number]>();
    for (const block of result.blocks) {
      const existing = firstBlockByTask.get(block.taskId);
      if (!existing || block.start < existing.start) {
        firstBlockByTask.set(block.taskId, block);
      }
    }

    const atRiskIds = new Set((result.atRisk ?? []).map((t) => t.taskId));
    await Promise.all(
      [...firstBlockByTask.values()].map((block) =>
        prisma.task.update({
          where: { id: block.taskId, assigneeId: userId },
          data: {
            scheduledStart: block.start,
            scheduledEnd: block.end,
            isAutoScheduled: true,
            autoScheduled: true,
            scheduleScore: 1,
            scheduleAtRisk: atRiskIds.has(block.taskId),
            lastScheduled: now,
          },
        })
      )
    );
    if (result.blocks.length > 0) {
      await prisma.scheduledBlock.createMany({
        data: result.blocks.map((block) => ({
          taskId: block.taskId,
          userId,
          start: block.start,
          end: block.end,
          chunkIndex: block.chunkIndex,
          chunkCount: block.chunkCount,
          isFrozen: block.isFrozen,
        })),
        skipDuplicates: true,
      });
    }

    const updatedDbTasks = (await prisma.task.findMany({
      where: {
        ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
        assigneeId: userId,
        isArchived: false,
        AND: [activeProjectTaskWhere],
      },
      include: {
        tags: true,
        project: true,
        scheduledBlocks: { orderBy: { chunkIndex: "asc" } },
      },
      orderBy: {
        createdAt: "desc",
      },
    })) as DbTaskWithRelations[];

    const tasksWithRelations = updatedDbTasks.map(
      convertDbTaskToTaskWithRelations
    );

    if (result.atRisk?.length) {
      logger.warn(
        "Tasks placed after their due date: no free time before it",
        { userId, taskIds: result.atRisk.map((task) => task.taskId) },
        LOG_SOURCE
      );
    }

    logger.info(
      "Task scheduling completed successfully",
      { userId, summary: JSON.stringify(summarizeSchedule(result)) },
      LOG_SOURCE
    );

    return { tasks: tasksWithRelations, scheduleResult: result };
  } catch (error) {
    logger.error(
      "Error scheduling tasks",
      {
        error: error instanceof Error ? error.message : String(error),
        userId,
      },
      LOG_SOURCE
    );
    throw error;
  }
}

export async function scheduleAllTasksForUser(
  userId: string,
  options: { entitlementUserId?: string; workspaceId?: string } = {}
): Promise<TaskWithRelations[]> {
  const { tasks } = await scheduleAllTasksForUserDetailed(userId, options);
  return tasks;
}
