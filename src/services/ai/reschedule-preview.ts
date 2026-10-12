import { scheduleAllTasksForUserDetailed } from "@/services/scheduling/TaskSchedulingService";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";

import {
  type WorkspaceAccess,
  workspaceDataScopeWhere,
} from "@/lib/auth/workspace-auth";
import { addCalendarDays, newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { publishRealtimeEvent } from "@/lib/realtime/publish";

import { decryptSecret, encryptSecret } from "./encryption";

const LOG_SOURCE = "ai-reschedule-preview";
const TOKEN_TTL_MS = 15 * 60 * 1000;

type SnapshotTask = {
  id: string;
  title: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  scheduleScore: number | null;
  lastScheduled: string | null;
  isAutoScheduled: boolean;
  autoScheduled: boolean;
  updatedAt: string;
};

type SnapshotBlock = {
  taskId: string;
  start: string;
  end: string;
  chunkIndex: number;
  chunkCount: number;
  isFrozen: boolean;
};

export type ScheduleSnapshot = {
  tasks: SnapshotTask[];
  blocks: SnapshotBlock[];
};

type ScheduleToken = {
  version: 2;
  kind: "preview" | "undo";
  userId: string;
  workspaceId: string;
  expiresAt: string;
  contextVersion: string;
  before: ScheduleSnapshot;
  after: ScheduleSnapshot;
};

export type RescheduleChange = {
  taskId: string;
  title: string;
  fromStart: string | null;
  toStart: string | null;
  fromEnd: string | null;
  toEnd: string | null;
  explanation: string;
  score: number | null;
};

export class SchedulePreviewConflictError extends Error {
  constructor() {
    super("The schedule changed after this preview was created.");
    this.name = "SchedulePreviewConflictError";
  }
}

type SnapshotClient = Prisma.TransactionClient;

export async function captureSnapshot(
  userId: string,
  workspace: WorkspaceAccess,
  client: SnapshotClient = prisma
): Promise<ScheduleSnapshot> {
  const scope = workspaceDataScopeWhere(workspace, userId);
  const [tasks, blocks] = await Promise.all([
    client.task.findMany({
      where: { ...scope, isArchived: false },
      select: {
        id: true,
        title: true,
        scheduledStart: true,
        scheduledEnd: true,
        scheduleScore: true,
        lastScheduled: true,
        isAutoScheduled: true,
        autoScheduled: true,
        updatedAt: true,
      },
      orderBy: { id: "asc" },
    }),
    client.scheduledBlock.findMany({
      where: { userId, task: scope },
      select: {
        taskId: true,
        start: true,
        end: true,
        chunkIndex: true,
        chunkCount: true,
        isFrozen: true,
      },
      orderBy: [{ taskId: "asc" }, { chunkIndex: "asc" }],
    }),
  ]);
  return {
    tasks: tasks.map((task) => ({
      ...task,
      scheduledStart: task.scheduledStart?.toISOString() ?? null,
      scheduledEnd: task.scheduledEnd?.toISOString() ?? null,
      lastScheduled: task.lastScheduled?.toISOString() ?? null,
      updatedAt: task.updatedAt.toISOString(),
    })),
    blocks: blocks.map((block) => ({
      ...block,
      start: block.start.toISOString(),
      end: block.end.toISOString(),
    })),
  };
}

async function computeStagedSnapshot(
  userId: string,
  workspace: WorkspaceAccess,
  before: ScheduleSnapshot
): Promise<{
  snapshot: ScheduleSnapshot;
  unscheduled: Array<{ taskId: string; title: string; reason: string }>;
}> {
  const now = newDate();
  const [legacy, preferences, energyWindows, sourceTasks] = await Promise.all([
    prisma.autoScheduleSettings.findUnique({ where: { userId } }),
    prisma.schedulingPreferences.findUnique({ where: { userId } }),
    prisma.energyProfileWindow.findMany({ where: { userId } }),
    prisma.task.findMany({
      where: {
        ...workspaceDataScopeWhere(workspace, userId),
        isArchived: false,
        OR: [{ isAutoScheduled: true }, { autoScheduled: true }],
        status: { notIn: ["completed", "in_progress"] },
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        dueDate: true,
        startDate: true,
        duration: true,
        priority: true,
        energyLevel: true,
        preferredTime: true,
        energyRequired: true,
        estimatedMinutes: true,
        estLikely: true,
        minChunkMinutes: true,
        maxChunkMinutes: true,
        deadline: true,
        priorityLevel: true,
        contextTag: true,
        isFrozen: true,
        dependsOnId: true,
        autoScheduled: true,
        isAutoScheduled: true,
        scheduleLocked: true,
        scheduledStart: true,
        scheduledEnd: true,
        scheduleScore: true,
        lastScheduled: true,
        postponedUntil: true,
        isRecurring: true,
        recurrenceRule: true,
        lastCompletedDate: true,
        completedAt: true,
      },
    }),
  ]);
  if (!legacy) {
    throw new Error("Auto-schedule settings not found for user");
  }

  const selectedCalendarIds = parseStringArray(legacy.selectedCalendars);
  const sourceFeeds = await prisma.calendarFeed.findMany({
    where: { id: { in: selectedCalendarIds }, userId, enabled: true },
    select: {
      id: true,
      events: {
        where: {
          archivedAt: null,
          start: { lt: addCalendarDays(now, 21) },
          end: { gt: now },
        },
        select: { start: true, end: true, description: true },
      },
    },
  });

  const stagingUser = await prisma.user.create({
    data: { name: "Schedule preview staging" },
    select: { id: true },
  });
  try {
    const stagedFeeds = await Promise.all(
      sourceFeeds.map((feed) =>
        prisma.calendarFeed.create({
          data: {
            userId: stagingUser.id,
            name: "Schedule preview busy time",
            type: "LOCAL",
            enabled: true,
            events: {
              create: feed.events.map((event) => ({
                title: "Busy",
                start: event.start,
                end: event.end,
                description: event.description,
              })),
            },
          },
          select: { id: true },
        })
      )
    );
    await prisma.autoScheduleSettings.create({
      data: {
        userId: stagingUser.id,
        workDays: legacy.workDays,
        workHourStart: legacy.workHourStart,
        workHourEnd: legacy.workHourEnd,
        selectedCalendars: JSON.stringify(stagedFeeds.map((feed) => feed.id)),
        bufferMinutes: legacy.bufferMinutes,
        highEnergyStart: legacy.highEnergyStart,
        highEnergyEnd: legacy.highEnergyEnd,
        mediumEnergyStart: legacy.mediumEnergyStart,
        mediumEnergyEnd: legacy.mediumEnergyEnd,
        lowEnergyStart: legacy.lowEnergyStart,
        lowEnergyEnd: legacy.lowEnergyEnd,
        groupByProject: legacy.groupByProject,
        pushTasksToCalendar: false,
      },
    });
    if (preferences) {
      await prisma.schedulingPreferences.create({
        data: {
          userId: stagingUser.id,
          workHours:
            (preferences.workHours as Prisma.InputJsonValue | null) ??
            undefined,
          bufferMinutes: preferences.bufferMinutes,
          maxDeepWorkPerDay: preferences.maxDeepWorkPerDay,
          minBreakMinutes: preferences.minBreakMinutes,
          autoRescheduleOnMiss: preferences.autoRescheduleOnMiss,
          enableBodyDoubling: preferences.enableBodyDoubling,
          enableTaskBatching: preferences.enableTaskBatching,
          hardStopTime: preferences.hardStopTime,
          bufferMultiplier: preferences.bufferMultiplier,
        },
      });
    }
    if (energyWindows.length) {
      await prisma.energyProfileWindow.createMany({
        data: energyWindows.map((window) => ({
          userId: stagingUser.id,
          dayOfWeek: window.dayOfWeek,
          startTime: window.startTime,
          endTime: window.endTime,
          energyLevel: window.energyLevel,
          sortOrder: window.sortOrder,
        })),
      });
    }

    const stagedPairs = await Promise.all(
      sourceTasks.map(async ({ id, dependsOnId, ...task }) => ({
        originalId: id,
        dependsOnId,
        staged: await prisma.task.create({
          data: {
            ...task,
            userId: stagingUser.id,
            assigneeId: stagingUser.id,
          },
          select: { id: true },
        }),
      }))
    );
    const stagedIdByOriginal = new Map(
      stagedPairs.map((pair) => [pair.originalId, pair.staged.id])
    );
    await Promise.all(
      stagedPairs.flatMap((pair) => {
        const stagedDependency = pair.dependsOnId
          ? stagedIdByOriginal.get(pair.dependsOnId)
          : null;
        return stagedDependency
          ? [
              prisma.task.update({
                where: { id: pair.staged.id },
                data: { dependsOnId: stagedDependency },
              }),
            ]
          : [];
      })
    );

    const { scheduleResult } = await scheduleAllTasksForUserDetailed(
      stagingUser.id,
      {
        entitlementUserId: userId,
      }
    );
    const [stagedTasks, stagedBlocks] = await Promise.all([
      prisma.task.findMany({
        where: { userId: stagingUser.id },
        select: {
          id: true,
          scheduledStart: true,
          scheduledEnd: true,
          scheduleScore: true,
          lastScheduled: true,
          isAutoScheduled: true,
          autoScheduled: true,
        },
      }),
      prisma.scheduledBlock.findMany({
        where: { userId: stagingUser.id },
      }),
    ]);
    const originalIdByStaged = new Map(
      stagedPairs.map((pair) => [pair.staged.id, pair.originalId])
    );
    const stagedByOriginal = new Map(
      stagedTasks.flatMap((task) => {
        const originalId = originalIdByStaged.get(task.id);
        return originalId ? [[originalId, task] as const] : [];
      })
    );
    const mutableOriginalIds = new Set(
      sourceTasks
        .filter((task) => !task.isFrozen && !task.scheduleLocked)
        .map((task) => task.id)
    );

    return {
      unscheduled: scheduleResult.unscheduled,
      snapshot: {
        tasks: before.tasks.map((task) => {
          const staged = stagedByOriginal.get(task.id);
          return staged
            ? {
                ...task,
                scheduledStart: staged.scheduledStart?.toISOString() ?? null,
                scheduledEnd: staged.scheduledEnd?.toISOString() ?? null,
                scheduleScore: staged.scheduleScore,
                lastScheduled: staged.lastScheduled?.toISOString() ?? null,
                isAutoScheduled: staged.isAutoScheduled,
                autoScheduled: staged.autoScheduled,
              }
            : task;
        }),
        blocks: [
          ...before.blocks.filter(
            (block) => !mutableOriginalIds.has(block.taskId)
          ),
          ...stagedBlocks.flatMap((block): SnapshotBlock[] => {
            const originalId = originalIdByStaged.get(block.taskId);
            return originalId
              ? [
                  {
                    taskId: originalId,
                    start: block.start.toISOString(),
                    end: block.end.toISOString(),
                    chunkIndex: block.chunkIndex,
                    chunkCount: block.chunkCount,
                    isFrozen: block.isFrozen,
                  },
                ]
              : [];
          }),
        ],
      },
    };
  } finally {
    await prisma.calendarFeed.deleteMany({ where: { userId: stagingUser.id } });
    await prisma.user.delete({ where: { id: stagingUser.id } });
  }
}

function parseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

async function captureContextVersion(userId: string) {
  const settings = await prisma.autoScheduleSettings.findUnique({
    where: { userId },
    select: { selectedCalendars: true, updatedAt: true },
  });
  const selectedCalendarIds = parseStringArray(
    settings?.selectedCalendars ?? "[]"
  );
  const [preferences, energyWindows, workSchedules, overrides, events] =
    await Promise.all([
      prisma.schedulingPreferences.findUnique({
        where: { userId },
        select: { updatedAt: true },
      }),
      prisma.energyProfileWindow.findMany({
        where: { userId },
        select: { id: true, updatedAt: true },
        orderBy: { id: "asc" },
      }),
      prisma.workSchedule.findMany({
        where: { userId },
        select: {
          id: true,
          updatedAt: true,
          windows: {
            select: { id: true, updatedAt: true },
            orderBy: { id: "asc" },
          },
        },
        orderBy: { id: "asc" },
      }),
      prisma.flexibleHoursOverride.findMany({
        where: { userId },
        select: { id: true, updatedAt: true },
        orderBy: { id: "asc" },
      }),
      prisma.calendarEvent.findMany({
        where: {
          feedId: { in: selectedCalendarIds },
          feed: { userId, enabled: true },
          archivedAt: null,
        },
        select: { id: true, updatedAt: true },
        orderBy: { id: "asc" },
      }),
    ]);
  return createHash("sha256")
    .update(
      JSON.stringify({
        settings,
        preferences,
        energyWindows,
        workSchedules,
        overrides,
        events,
      })
    )
    .digest("hex");
}

function snapshotsMatch(current: ScheduleSnapshot, expected: ScheduleSnapshot) {
  return JSON.stringify(current) === JSON.stringify(expected);
}

/**
 * Writes a snapshot back. Pass `client` to run inside a caller's transaction
 * (the ops undo path); without it the restore opens its own.
 */
export async function restoreSnapshot(
  userId: string,
  workspace: WorkspaceAccess,
  snapshot: ScheduleSnapshot,
  client?: SnapshotClient
) {
  const scope = workspaceDataScopeWhere(workspace, userId);
  const ownedTasks = await (client ?? prisma).task.findMany({
    where: { ...scope, id: { in: snapshot.tasks.map((task) => task.id) } },
    select: { id: true },
  });
  const ownedIds = new Set(ownedTasks.map((task) => task.id));
  const tasks = snapshot.tasks.filter((task) => ownedIds.has(task.id));
  const blocks = snapshot.blocks.filter((block) => ownedIds.has(block.taskId));

  const write = async (tx: SnapshotClient) => {
    await tx.scheduledBlock.deleteMany({
      where: { userId, taskId: { in: [...ownedIds] } },
    });
    await Promise.all(
      tasks.map((task) =>
        tx.task.updateMany({
          where: { id: task.id, ...scope },
          data: {
            scheduledStart: task.scheduledStart
              ? newDate(task.scheduledStart)
              : null,
            scheduledEnd: task.scheduledEnd ? newDate(task.scheduledEnd) : null,
            scheduleScore: task.scheduleScore,
            lastScheduled: task.lastScheduled
              ? newDate(task.lastScheduled)
              : null,
            isAutoScheduled: task.isAutoScheduled,
            autoScheduled: task.autoScheduled,
          },
        })
      )
    );
    if (blocks.length) {
      await tx.scheduledBlock.createMany({
        data: blocks.map((block) => ({
          userId,
          taskId: block.taskId,
          start: newDate(block.start),
          end: newDate(block.end),
          chunkIndex: block.chunkIndex,
          chunkCount: block.chunkCount,
          isFrozen: block.isFrozen,
        })),
      });
    }
  };

  if (client) {
    await write(client);
  } else {
    await prisma.$transaction(write);
  }
}

export function diffScheduleSnapshots(
  before: ScheduleSnapshot,
  after: ScheduleSnapshot
) {
  const oldById = new Map(before.tasks.map((task) => [task.id, task]));
  return after.tasks.flatMap((task): RescheduleChange[] => {
    const previous = oldById.get(task.id);
    if (
      previous?.scheduledStart === task.scheduledStart &&
      previous?.scheduledEnd === task.scheduledEnd
    ) {
      return [];
    }
    return [
      {
        taskId: task.id,
        title: task.title,
        fromStart: previous?.scheduledStart ?? null,
        toStart: task.scheduledStart,
        fromEnd: previous?.scheduledEnd ?? null,
        toEnd: task.scheduledEnd,
        explanation: task.scheduledStart
          ? previous?.scheduledStart
            ? "Moved to the next deterministic available slot."
            : "Placed in deterministic available working time."
          : "No valid working-time slot is currently available.",
        score: task.scheduleScore,
      },
    ];
  });
}

function encodeToken(
  kind: ScheduleToken["kind"],
  userId: string,
  workspaceId: string,
  contextVersion: string,
  before: ScheduleSnapshot,
  after: ScheduleSnapshot
) {
  return encryptSecret(
    JSON.stringify({
      version: 2,
      kind,
      userId,
      workspaceId,
      expiresAt: newDate(newDate().getTime() + TOKEN_TTL_MS).toISOString(),
      contextVersion,
      before,
      after,
    } satisfies ScheduleToken)
  );
}

function decodeToken(
  token: string,
  userId: string,
  workspaceId: string,
  kind: ScheduleToken["kind"]
) {
  const decrypted = decryptSecret(token);
  if (!decrypted) throw new Error("Invalid schedule token");
  const value = JSON.parse(decrypted) as ScheduleToken;
  if (
    value.version !== 2 ||
    value.kind !== kind ||
    value.userId !== userId ||
    value.workspaceId !== workspaceId ||
    newDate(value.expiresAt) < newDate()
  ) {
    throw new Error("Expired or invalid schedule token");
  }
  return value;
}

export async function createReschedulePreview(
  userId: string,
  workspace: WorkspaceAccess
) {
  const before = await captureSnapshot(userId, workspace);
  const contextVersion = await captureContextVersion(userId);
  const staged = await computeStagedSnapshot(userId, workspace, before);
  const changes = diffScheduleSnapshots(before, staged.snapshot);
  logger.info(
    "Created schedule preview",
    { userId, changes: changes.length },
    LOG_SOURCE
  );
  return {
    changes,
    unscheduled: staged.unscheduled,
    previewToken: encodeToken(
      "preview",
      userId,
      workspace.workspaceId,
      contextVersion,
      before,
      staged.snapshot
    ),
  };
}

export async function applyReschedulePreview(
  userId: string,
  workspace: WorkspaceAccess,
  token: string
) {
  const value = decodeToken(token, userId, workspace.workspaceId, "preview");
  const [current, contextVersion] = await Promise.all([
    captureSnapshot(userId, workspace),
    captureContextVersion(userId),
  ]);
  if (
    !snapshotsMatch(current, value.before) ||
    contextVersion !== value.contextVersion
  ) {
    throw new SchedulePreviewConflictError();
  }
  await restoreSnapshot(userId, workspace, value.after);
  const applied = await captureSnapshot(userId, workspace);
  await publishScheduleChange(userId);
  logger.info("Applied schedule preview", { userId }, LOG_SOURCE);
  return {
    changes: diffScheduleSnapshots(value.before, applied),
    undoToken: encodeToken(
      "undo",
      userId,
      workspace.workspaceId,
      await captureContextVersion(userId),
      value.before,
      applied
    ),
  };
}

export async function undoReschedulePreview(
  userId: string,
  workspace: WorkspaceAccess,
  token: string
) {
  const value = decodeToken(token, userId, workspace.workspaceId, "undo");
  const [current, contextVersion] = await Promise.all([
    captureSnapshot(userId, workspace),
    captureContextVersion(userId),
  ]);
  if (
    !snapshotsMatch(current, value.after) ||
    contextVersion !== value.contextVersion
  ) {
    throw new SchedulePreviewConflictError();
  }
  await restoreSnapshot(userId, workspace, value.before);
  await publishScheduleChange(userId);
  logger.info("Undid schedule preview", { userId }, LOG_SOURCE);
  return { changes: diffScheduleSnapshots(value.after, value.before) };
}

async function publishScheduleChange(userId: string) {
  try {
    await publishRealtimeEvent(userId, "tasks-updated");
  } catch (error) {
    logger.warn(
      "Could not publish schedule realtime event",
      { userId, error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
  }
}

export function schedulePreviewJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
