import { personalBusyBlocks } from "@/services/personal-time/service";
import { scheduleAllTasksForUserDetailed } from "@/services/scheduling/TaskSchedulingService";
import {
  blockingEventWhere,
  resolveBusyFeedIds,
} from "@/services/scheduling/busy-feeds";
import {
  type ScopedReplanSkipReason,
  overlaps,
  planScopedReplan,
} from "@/services/scheduling/scoped-replan";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";

import {
  type ActivationEventName,
  recordActivation,
} from "@/lib/activation-events";
import {
  type WorkspaceAccess,
  workspaceDataScopeWhere,
} from "@/lib/auth/workspace-auth";
import { addCalendarDays, formatInTimeZone, newDate } from "@/lib/date-utils";
import { normalizeUserTimeZone } from "@/lib/habit-completion-date";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { publishRealtimeEvent } from "@/lib/realtime/publish";
import { loadWeekHours } from "@/lib/work-week-server";

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
  /**
   * Set on a scoped preview (`taskIds`): the only tasks apply and undo read
   * or write. `before` and `after` hold just these. Absent on a whole-schedule
   * preview, which compares and restores everything as before.
   */
  scopeTaskIds?: string[];
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
  /** Scoped previews only: why this task moves. */
  reason?: "missed" | "overlaps";
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

  const busyFeedIds = await resolveBusyFeedIds(
    userId,
    legacy.excludedCalendars
  );
  const sourceFeeds = await prisma.calendarFeed.findMany({
    where: { id: { in: busyFeedIds }, userId, enabled: true },
    select: {
      id: true,
      events: {
        where: {
          archivedAt: null,
          allDay: false,
          ...blockingEventWhere,
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

async function captureContextVersion(userId: string) {
  const settings = await prisma.autoScheduleSettings.findUnique({
    where: { userId },
    select: { excludedCalendars: true, updatedAt: true },
  });
  const busyFeedIds = await resolveBusyFeedIds(
    userId,
    settings?.excludedCalendars
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
          feedId: { in: busyFeedIds },
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
  after: ScheduleSnapshot,
  scopeTaskIds?: string[]
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
      ...(scopeTaskIds ? { scopeTaskIds } : {}),
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

/** `chat`: a preview card is shown and Keep applies it. `fill`: one click, nothing shown. */
export type ReschedulePreviewVia = "chat" | "fill";
export type ReschedulePreviewOptions = {
  via?: ReschedulePreviewVia;
  /**
   * Re-plan only these tasks (missed or overlapping, open, not pinned) into
   * free gaps from now. Left out: the whole schedule, as before.
   */
  taskIds?: string[];
};

/** Restricts a snapshot to the given task ids. */
function onlyTasks(
  snapshot: ScheduleSnapshot,
  ids: Set<string>
): ScheduleSnapshot {
  return {
    tasks: snapshot.tasks.filter((task) => ids.has(task.id)),
    blocks: snapshot.blocks.filter((block) => ids.has(block.taskId)),
  };
}

/**
 * The activation event one step of the flow counts as, or null. A preview is
 * a replan the person was shown only from the chat card; "Fill it" places in
 * one click with nothing shown, so it is `fill_applied` and never Keep.
 */
export function replanActivationEvent(
  step: "preview" | "apply" | "undo",
  via: ReschedulePreviewVia = "chat"
): ActivationEventName | null {
  if (via === "fill") return step === "apply" ? "fill_applied" : null;
  if (step === "preview") return "replan_shown";
  return step === "apply" ? "keep_applied" : "undo_applied";
}

export async function createReschedulePreview(
  userId: string,
  workspace: WorkspaceAccess,
  options: ReschedulePreviewOptions = {}
) {
  if (options.taskIds) {
    return createScopedReschedulePreview(
      userId,
      workspace,
      options.taskIds,
      options
    );
  }
  const before = await captureSnapshot(userId, workspace);
  const contextVersion = await captureContextVersion(userId);
  const staged = await computeStagedSnapshot(userId, workspace, before);
  const changes = diffScheduleSnapshots(before, staged.snapshot);
  logger.info(
    "Created schedule preview",
    { userId, changes: changes.length },
    LOG_SOURCE
  );
  /* A proposal the person is shown; an empty one is not a replan. */
  const shown = replanActivationEvent("preview", options.via);
  if (changes.length > 0 && shown) recordActivation(shown, userId);
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

/**
 * A preview of one task moved to a slot the caller already checked (the first
 * replan demo, where the slot is the first free gap after the meeting). It is
 * the same preview token as the scheduler's, so Keep and Undo are the real
 * apply and undo; only the proposed time comes from the caller.
 */
export async function createTargetedReschedulePreview(
  userId: string,
  workspace: WorkspaceAccess,
  move: { taskId: string; start: Date; end: Date },
  options: ReschedulePreviewOptions = {}
) {
  const before = await captureSnapshot(userId, workspace);
  const contextVersion = await captureContextVersion(userId);
  const after: ScheduleSnapshot = {
    ...before,
    tasks: before.tasks.map((task) =>
      task.id === move.taskId
        ? {
            ...task,
            scheduledStart: move.start.toISOString(),
            scheduledEnd: move.end.toISOString(),
            lastScheduled: newDate().toISOString(),
          }
        : task
    ),
  };
  const changes = diffScheduleSnapshots(before, after);
  const shown = replanActivationEvent("preview", options.via);
  if (changes.length > 0 && shown) recordActivation(shown, userId);
  return {
    changes,
    unscheduled: [],
    previewToken: encodeToken(
      "preview",
      userId,
      workspace.workspaceId,
      contextVersion,
      before,
      after
    ),
  };
}

const SKIP_TEXT: Record<ScopedReplanSkipReason, string> = {
  not_found: "Not one of your open tasks.",
  completed: "Already completed.",
  pinned: "Pinned in place; left where it is.",
  split: "Split over several blocks or one is pinned; left where it is.",
  blocked: "Waits on an unfinished task; left where it is.",
  own_hours: "Follows its own work schedule; left where it is.",
  not_scheduled: "Has no time slot to replace.",
  not_missed: "Not missed and not overlapping anything.",
};

/**
 * A preview that moves only `taskIds`: the missed (or overlapping) open ones
 * among them, into the first free gap from now inside work hours. Every other
 * task block, pinned or auto, and every calendar event is busy time, and
 * nothing is placed earlier than now. Ids that are unknown, foreign,
 * completed, pinned or not missed are not an error: they come back in
 * `skipped` with a reason and stay as they are. The token is scoped: Keep and
 * Undo read and write exactly the moved tasks.
 */
export async function createScopedReschedulePreview(
  userId: string,
  workspace: WorkspaceAccess,
  taskIds: string[],
  options: ReschedulePreviewOptions = {}
) {
  const now = newDate();
  const horizon = addCalendarDays(now, 22);
  const scope = workspaceDataScopeWhere(workspace, userId);
  const [before, contextVersion, settings, hoursRow, defaultSchedule] =
    await Promise.all([
      captureSnapshot(userId, workspace),
      captureContextVersion(userId),
      prisma.userSettings.findUnique({
        where: { userId },
        select: { timeZone: true },
      }),
      prisma.autoScheduleSettings.findUnique({
        where: { userId },
        select: { excludedCalendars: true },
      }),
      prisma.workSchedule.findFirst({
        where: { userId, isDefault: true },
        select: { id: true },
      }),
    ]);
  const zone = normalizeUserTimeZone(settings?.timeZone);
  const today = new Date(
    `${formatInTimeZone(now, zone, "yyyy-MM-dd")}T00:00:00.000Z`
  );
  const openTask = {
    ...scope,
    isArchived: false,
    trashedAt: null,
    status: { notIn: ["completed", "done"] },
  };
  const busyFeedIds = await resolveBusyFeedIds(
    userId,
    hoursRow?.excludedCalendars
  );
  const [rows, blocks, events, personal, week, overrides] = await Promise.all([
    prisma.task.findMany({
      where: {
        ...scope,
        isArchived: false,
        trashedAt: null,
        OR: [
          { id: { in: taskIds } },
          {
            status: { notIn: ["completed", "done"] },
            scheduledEnd: { gt: now },
            scheduledStart: { lt: horizon },
          },
        ],
      },
      select: {
        id: true,
        title: true,
        status: true,
        userId: true,
        assigneeId: true,
        scheduledStart: true,
        scheduledEnd: true,
        estimatedMinutes: true,
        duration: true,
        scheduleLocked: true,
        isFrozen: true,
        scheduleId: true,
        availableFrom: true,
        startDate: true,
        postponedUntil: true,
        dependsOnId: true,
        dependsOn: { select: { status: true } },
        blockedByDependencies: {
          where: { removedAt: null },
          select: { blocker: { select: { status: true } } },
        },
      },
      orderBy: { id: "asc" },
    }),
    prisma.scheduledBlock.findMany({
      where: {
        userId,
        task: openTask,
        OR: [
          { taskId: { in: taskIds } },
          { end: { gt: now }, start: { lt: horizon } },
        ],
      },
      select: {
        taskId: true,
        start: true,
        end: true,
        chunkCount: true,
        isFrozen: true,
      },
    }),
    prisma.calendarEvent.findMany({
      where: {
        feedId: { in: busyFeedIds },
        feed: { userId, enabled: true },
        archivedAt: null,
        allDay: false,
        ...blockingEventWhere,
        start: { lt: horizon },
        end: { gt: now },
      },
      select: { start: true, end: true },
    }),
    personalBusyBlocks(userId, now, horizon),
    loadWeekHours(userId),
    prisma.flexibleHoursOverride.findMany({
      where: { userId, date: { gte: today, lt: horizon } },
      select: { date: true, kind: true, startTime: true, endTime: true },
    }),
  ]);

  const isDone = (status: string) =>
    status === "completed" || status === "done";
  const plan = planScopedReplan({
    requestedIds: taskIds,
    tasks: rows.map((row) => {
      const latest = [row.availableFrom, row.startDate, row.postponedUntil]
        .filter((value): value is Date => value !== null)
        .reduce<Date | null>(
          (max, value) => (!max || value > max ? value : max),
          null
        );
      return {
        id: row.id,
        title: row.title,
        scheduledStart: row.scheduledStart,
        scheduledEnd: row.scheduledEnd,
        minutes:
          row.estimatedMinutes && row.estimatedMinutes > 0
            ? row.estimatedMinutes
            : row.duration && row.duration > 0
              ? row.duration
              : 30,
        pinned: row.scheduleLocked || row.isFrozen,
        done: isDone(row.status),
        // Blocks are kept per person, so only the caller's own tasks move.
        owned: row.assigneeId
          ? row.assigneeId === userId
          : row.userId === userId,
        notBefore: latest,
        blocked:
          (row.dependsOnId !== null &&
            !!row.dependsOn &&
            !isDone(row.dependsOn.status)) ||
          row.blockedByDependencies.some((d) => !isDone(d.blocker.status)),
        ownHours:
          row.scheduleId !== null && row.scheduleId !== defaultSchedule?.id,
      };
    }),
    events: [...events, ...personal],
    blocks,
    week,
    overrides: overrides.map((o) => ({
      date: o.date.toISOString().slice(0, 10),
      kind: o.kind,
      startTime: o.startTime,
      endTime: o.endTime,
    })),
    now,
    zone,
  });

  const scopeIds = plan.moves.map((move) => move.taskId);
  const scopeSet = new Set(scopeIds);
  const moveById = new Map(plan.moves.map((move) => [move.taskId, move]));
  const scopedBefore = onlyTasks(before, scopeSet);
  const scopedAfter: ScheduleSnapshot = {
    tasks: scopedBefore.tasks.map((task) => {
      const move = moveById.get(task.id)!;
      return {
        ...task,
        scheduledStart: move.to.start.toISOString(),
        scheduledEnd: move.to.end.toISOString(),
        lastScheduled: now.toISOString(),
      };
    }),
    // A task that had chunk blocks now has one block at the new slot.
    blocks: [...new Set(scopedBefore.blocks.map((block) => block.taskId))].map(
      (taskId): SnapshotBlock => {
        const move = moveById.get(taskId)!;
        return {
          taskId,
          start: move.to.start.toISOString(),
          end: move.to.end.toISOString(),
          chunkIndex: 0,
          chunkCount: 1,
          isFrozen: false,
        };
      }
    ),
  };
  const changes = diffScheduleSnapshots(scopedBefore, scopedAfter).map(
    (change) => {
      const move = moveById.get(change.taskId)!;
      return { ...change, explanation: move.explanation, reason: move.reason };
    }
  );
  logger.info(
    "Created scoped schedule preview",
    {
      userId,
      requested: taskIds.length,
      moved: changes.length,
      skipped: plan.skipped.length,
    },
    LOG_SOURCE
  );
  const shown = replanActivationEvent("preview", options.via);
  if (changes.length > 0 && shown) recordActivation(shown, userId);
  return {
    changes,
    unscheduled: plan.unscheduled,
    skipped: plan.skipped.map((item) => ({
      ...item,
      explanation: SKIP_TEXT[item.reason],
    })),
    previewToken: encodeToken(
      "preview",
      userId,
      workspace.workspaceId,
      contextVersion,
      scopedBefore,
      scopedAfter,
      scopeIds
    ),
  };
}

/**
 * The context version covers the calendar but not other tasks, so a task that
 * moved into a previewed slot since (or a second preview that chose the same
 * slot and was kept first) would be double-booked. Before a scoped apply,
 * every target slot must be clear of open tasks and blocks outside the set.
 */
async function assertScopedSlotsFree(
  userId: string,
  workspace: WorkspaceAccess,
  value: ScheduleToken,
  scope: Set<string>
) {
  const targets = value.after.tasks.flatMap((task) =>
    task.scheduledStart && task.scheduledEnd
      ? [
          {
            start: newDate(task.scheduledStart),
            end: newDate(task.scheduledEnd),
          },
        ]
      : []
  );
  if (!targets.length) return;
  const from = new Date(Math.min(...targets.map((t) => t.start.getTime())));
  const to = new Date(Math.max(...targets.map((t) => t.end.getTime())));
  const outside = {
    ...workspaceDataScopeWhere(workspace, userId),
    id: { notIn: [...scope] },
    isArchived: false,
    trashedAt: null,
    status: { notIn: ["completed", "done"] },
  };
  const [tasks, blocks] = await Promise.all([
    prisma.task.findMany({
      where: {
        ...outside,
        scheduledStart: { lt: to },
        scheduledEnd: { gt: from },
      },
      select: { scheduledStart: true, scheduledEnd: true },
    }),
    prisma.scheduledBlock.findMany({
      where: {
        userId,
        taskId: { notIn: [...scope] },
        task: outside,
        start: { lt: to },
        end: { gt: from },
      },
      select: { start: true, end: true },
    }),
  ]);
  const taken = [
    ...tasks.flatMap((t) =>
      t.scheduledStart && t.scheduledEnd
        ? [{ start: t.scheduledStart, end: t.scheduledEnd }]
        : []
    ),
    ...blocks,
  ];
  if (targets.some((slot) => taken.some((t) => overlaps(slot, t)))) {
    throw new SchedulePreviewConflictError();
  }
}

export async function applyReschedulePreview(
  userId: string,
  workspace: WorkspaceAccess,
  token: string,
  options: ReschedulePreviewOptions = {}
) {
  const value = decodeToken(token, userId, workspace.workspaceId, "preview");
  const scope = value.scopeTaskIds ? new Set(value.scopeTaskIds) : null;
  const [captured, contextVersion] = await Promise.all([
    captureSnapshot(userId, workspace),
    captureContextVersion(userId),
  ]);
  // A scoped token compares and writes only its own tasks; whatever else
  // changed meanwhile is not its business.
  const current = scope ? onlyTasks(captured, scope) : captured;
  if (
    !snapshotsMatch(current, value.before) ||
    contextVersion !== value.contextVersion
  ) {
    throw new SchedulePreviewConflictError();
  }
  if (scope) await assertScopedSlotsFree(userId, workspace, value, scope);
  await restoreSnapshot(userId, workspace, value.after);
  const appliedAll = await captureSnapshot(userId, workspace);
  const applied = scope ? onlyTasks(appliedAll, scope) : appliedAll;
  await publishScheduleChange(userId);
  logger.info("Applied schedule preview", { userId }, LOG_SOURCE);
  /* From the chat card, applying is the person pressing Keep. "Fill it"
     shows no preview, so it is its own event and never counts as Keep. */
  const kept = replanActivationEvent("apply", options.via);
  if (kept) recordActivation(kept, userId);
  return {
    changes: diffScheduleSnapshots(value.before, applied),
    undoToken: encodeToken(
      "undo",
      userId,
      workspace.workspaceId,
      await captureContextVersion(userId),
      value.before,
      applied,
      value.scopeTaskIds
    ),
  };
}

export async function undoReschedulePreview(
  userId: string,
  workspace: WorkspaceAccess,
  token: string,
  options: ReschedulePreviewOptions = {}
) {
  const value = decodeToken(token, userId, workspace.workspaceId, "undo");
  const scope = value.scopeTaskIds ? new Set(value.scopeTaskIds) : null;
  const [captured, contextVersion] = await Promise.all([
    captureSnapshot(userId, workspace),
    captureContextVersion(userId),
  ]);
  const current = scope ? onlyTasks(captured, scope) : captured;
  if (
    !snapshotsMatch(current, value.after) ||
    contextVersion !== value.contextVersion
  ) {
    throw new SchedulePreviewConflictError();
  }
  await restoreSnapshot(userId, workspace, value.before);
  await publishScheduleChange(userId);
  logger.info("Undid schedule preview", { userId }, LOG_SOURCE);
  const undone = replanActivationEvent("undo", options.via);
  if (undone) recordActivation(undone, userId);
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
