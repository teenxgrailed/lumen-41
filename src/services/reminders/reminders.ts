/* REMINDERS — one service behind the app's routes, the connector API and the
 * MCP tool, so all three create, move and cancel reminders the same way.
 *
 * A reminder is on a task, on a calendar event, or on its own (a title and a
 * time). It fires on a BullMQ delayed job scheduled for its fire time; the
 * minute sweep in the worker is the safety net. A job never trusts the time
 * it was scheduled for: deliverTaskReminder recomputes the fire time and
 * skips one that is not due, so a moved task leaves its old job harmless and
 * `rescheduleRemindersFor` adds a job for the new time.
 */
import {
  type Prisma,
  ReminderDeliveryStatus,
  TaskReminderKind,
} from "@prisma/client";
import { z } from "zod";

import { newDate } from "@/lib/date-utils";
import { limitStatus } from "@/lib/entitlements";
import { getPlan } from "@/lib/entitlements";
import { logger } from "@/lib/logger";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import { prisma } from "@/lib/prisma";
import { scheduleReminderDelivery } from "@/lib/queue/enqueue";

import {
  MAX_OFFSET_MINUTES,
  TIME_OF_DAY,
  atTimeKey,
  reminderFireTime,
  reminderLabel,
  safeZone,
} from "./reminder-time";

const LOG_SOURCE = "Reminders";

export const reminderInclude = {
  task: {
    select: {
      id: true,
      title: true,
      status: true,
      isArchived: true,
      scheduledStart: true,
      deadline: true,
      dueDate: true,
    },
  },
  event: { select: { id: true, title: true, start: true, archivedAt: true } },
} satisfies Prisma.TaskReminderInclude;

export type ReminderRow = Prisma.TaskReminderGetPayload<{
  include: typeof reminderInclude;
}>;

const channelSchema = z.array(z.enum(["push", "email"])).max(2);

/** What a caller sends. `at` makes it absolute; otherwise it is relative. */
export const reminderSpecSchema = z
  .object({
    at: z
      .string()
      .datetime({ offset: true })
      .optional()
      .describe("Fire at this ISO 8601 time. Leave out for a relative one."),
    anchor: z
      .enum(["start", "deadline"])
      .optional()
      .describe(
        "What a relative reminder counts back from: the task's start (default) or its deadline. An event's is always its start."
      ),
    offsetMinutes: z
      .number()
      .int()
      .min(0)
      .max(MAX_OFFSET_MINUTES)
      .optional()
      .describe("Minutes before the anchor; 0 is at the anchor itself."),
    atTime: z
      .string()
      .regex(TIME_OF_DAY)
      .nullable()
      .optional()
      .describe(
        'Fire at this wall time (HH:mm, the person\'s zone) on the day of anchor minus offsetMinutes: offsetMinutes 1440 with atTime "09:00" is "1 day before, 09:00".'
      ),
    channels: channelSchema.optional(),
  })
  .strict();

export const reminderCreateSchema = reminderSpecSchema
  .extend({
    taskId: z.string().min(1).optional(),
    eventId: z.string().min(1).optional(),
    title: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .optional()
      .describe("For a reminder on its own (no taskId or eventId)."),
  })
  .strict()
  .refine((v) => !(v.taskId && v.eventId), {
    message: "Give taskId or eventId, not both.",
  })
  .refine((v) => v.taskId || v.eventId || (v.title && v.at), {
    message: "A reminder on its own needs a title and an absolute at.",
  })
  .refine((v) => v.at || v.taskId || v.eventId, {
    message: "A relative reminder needs a task or an event.",
  });

export const reminderUpdateSchema = reminderSpecSchema
  .extend({
    title: z.string().trim().min(1).max(500).optional(),
    snoozeUntil: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .optional()
      .describe("Fire again at this time; null clears the snooze."),
  })
  .strict();

export type ReminderCreate = z.infer<typeof reminderCreateSchema>;
export type ReminderUpdate = z.infer<typeof reminderUpdateSchema>;

export type ServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: unknown };

/** What the API returns for one reminder. */
export interface ReminderView {
  id: string;
  taskId: string | null;
  eventId: string | null;
  /** The task's or event's title, or the reminder's own. */
  title: string;
  kind: TaskReminderKind;
  anchor: "start" | "deadline" | null;
  offsetMinutes: number | null;
  atTime: string | null;
  /** The absolute time of an AT_TIME reminder. */
  at: string | null;
  /** When it fires next (snooze included), or null when nothing anchors it. */
  firesAt: string | null;
  snoozedUntil: string | null;
  status: ReminderDeliveryStatus;
  deliveredAt: string | null;
  channels: string[];
  label: string;
  link: string;
}

export function reminderLink(r: {
  taskId: string | null;
  eventId: string | null;
}): string {
  if (r.taskId) return `/today?task=${encodeURIComponent(r.taskId)}`;
  if (r.eventId) return `/calendar?event=${encodeURIComponent(r.eventId)}`;
  return "/today";
}

export function reminderTitle(r: {
  title: string | null;
  task: { title: string } | null;
  event: { title: string } | null;
}): string {
  return r.task?.title ?? r.event?.title ?? r.title ?? "Reminder";
}

export function toReminderView(r: ReminderRow, timeZone: string): ReminderView {
  const fires = reminderFireTime(r, timeZone);
  return {
    id: r.id,
    taskId: r.taskId,
    eventId: r.eventId,
    title: reminderTitle(r),
    kind: r.kind,
    anchor:
      r.kind === TaskReminderKind.AT_TIME
        ? null
        : r.kind === TaskReminderKind.BEFORE_DEADLINE && !r.eventId
          ? "deadline"
          : "start",
    offsetMinutes: r.kind === TaskReminderKind.AT_TIME ? null : r.offsetMinutes,
    atTime: r.atTime,
    at: r.fireAt?.toISOString() ?? null,
    firesAt: fires?.toISOString() ?? null,
    snoozedUntil: r.snoozedUntil?.toISOString() ?? null,
    status: r.deliveryStatus,
    deliveredAt: r.deliveredAt?.toISOString() ?? null,
    channels: Array.isArray(r.channels) ? (r.channels as string[]) : [],
    label: reminderLabel({ ...r, onEvent: !!r.eventId }, timeZone),
    link: reminderLink(r),
  };
}

export async function userTimeZone(userId: string): Promise<string> {
  const row = await prisma.userSettings.findUnique({
    where: { userId },
    select: { timeZone: true },
  });
  return safeZone(row?.timeZone);
}

/** The columns a spec sets. */
function specColumns(
  spec: z.infer<typeof reminderSpecSchema>,
  onEvent: boolean
): {
  kind: TaskReminderKind;
  offsetMinutes: number;
  atTime: string | null;
  fireAt: Date | null;
} {
  if (spec.at) {
    const fireAt = newDate(spec.at);
    return {
      kind: TaskReminderKind.AT_TIME,
      offsetMinutes: atTimeKey(fireAt),
      atTime: null,
      fireAt,
    };
  }
  return {
    kind:
      spec.anchor === "deadline" && !onEvent
        ? TaskReminderKind.BEFORE_DEADLINE
        : TaskReminderKind.BEFORE_START,
    offsetMinutes: spec.offsetMinutes ?? 0,
    atTime: spec.atTime ?? null,
    fireAt: null,
  };
}

const PENDING_AGAIN = {
  canceledAt: null,
  deliveryStatus: ReminderDeliveryStatus.PENDING,
  deliveredAt: null,
  lastError: null,
  attemptCount: 0,
} as const;

async function canAdd(
  userId: string,
  where: { taskId: string } | { eventId: string }
) {
  const [plan, used] = await Promise.all([
    getPlan(userId),
    prisma.taskReminder.count({
      where: { userId, canceledAt: null, ...where },
    }),
  ]);
  return limitStatus(plan, PLAN_LIMITS[plan].remindersPerTask, used);
}

/** Workspace-scoped task access: the task must be the person's own. */
async function ownTask(userId: string, taskId: string) {
  return prisma.task.findFirst({
    where: { id: taskId, OR: [{ userId }, { assigneeId: userId }] },
    select: { id: true },
  });
}

async function ownEvent(userId: string, eventId: string) {
  return prisma.calendarEvent.findFirst({
    where: { id: eventId, feed: { userId } },
    select: { id: true },
  });
}

export async function listReminders(
  userId: string,
  filter: {
    taskId?: string;
    eventId?: string;
    /** "upcoming" (default): not delivered and not canceled. */
    status?: "upcoming" | "all";
  } = {}
): Promise<ReminderView[]> {
  const timeZone = await userTimeZone(userId);
  const rows = await prisma.taskReminder.findMany({
    where: {
      userId,
      canceledAt: null,
      ...(filter.taskId ? { taskId: filter.taskId } : {}),
      ...(filter.eventId ? { eventId: filter.eventId } : {}),
      ...(filter.status === "all" ? {} : { deliveredAt: null }),
    },
    include: reminderInclude,
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  return rows
    .map((r) => toReminderView(r, timeZone))
    .sort((a, b) =>
      (a.firesAt ?? "9999") < (b.firesAt ?? "9999")
        ? -1
        : (a.firesAt ?? "9999") > (b.firesAt ?? "9999")
          ? 1
          : 0
    );
}

export async function getReminder(userId: string, id: string) {
  return prisma.taskReminder.findFirst({
    where: { id, userId, canceledAt: null },
    include: reminderInclude,
  });
}

export async function createReminder(
  userId: string,
  input: ReminderCreate
): Promise<ServiceResult<ReminderView>> {
  if (input.taskId && !(await ownTask(userId, input.taskId))) {
    return { ok: false, status: 404, error: "Task not found" };
  }
  if (input.eventId && !(await ownEvent(userId, input.eventId))) {
    return { ok: false, status: 404, error: "Event not found" };
  }
  const columns = specColumns(input, !!input.eventId);
  const channels = input.channels ?? ["push", "email"];
  const entity = input.taskId
    ? { taskId: input.taskId }
    : input.eventId
      ? { eventId: input.eventId }
      : null;

  const same = await prisma.taskReminder.findFirst({
    where: {
      userId,
      ...(entity ?? { taskId: null, eventId: null, title: input.title }),
      kind: columns.kind,
      offsetMinutes: columns.offsetMinutes,
      ...(input.taskId ? {} : { atTime: columns.atTime }),
    },
    select: { id: true, canceledAt: true },
  });
  if (!same || same.canceledAt) {
    if (entity) {
      const entitlement = await canAdd(userId, entity);
      if (!entitlement.allowed) {
        return {
          ok: false,
          status: 403,
          error: { error: "UPGRADE_REQUIRED", entitlement },
        };
      }
    }
  }
  const data = {
    ...columns,
    channels,
    snoozedUntil: null,
    ...PENDING_AGAIN,
  };
  const row = same
    ? await prisma.taskReminder.update({
        where: { id: same.id },
        data,
        include: reminderInclude,
      })
    : await prisma.taskReminder.create({
        data: {
          userId,
          ...(entity ?? {}),
          title: entity ? null : (input.title ?? null),
          ...data,
        },
        include: reminderInclude,
      });
  await scheduleReminder(row);
  return { ok: true, value: toReminderView(row, await userTimeZone(userId)) };
}

export async function updateReminder(
  userId: string,
  id: string,
  input: ReminderUpdate
): Promise<ServiceResult<ReminderView>> {
  const current = await getReminder(userId, id);
  if (!current) return { ok: false, status: 404, error: "Reminder not found" };

  const data: Prisma.TaskReminderUpdateInput = {};
  const touchesSpec =
    input.at !== undefined ||
    input.anchor !== undefined ||
    input.offsetMinutes !== undefined ||
    input.atTime !== undefined;
  if (touchesSpec) {
    const merged = input.at
      ? { at: input.at }
      : {
          anchor:
            input.anchor ??
            (current.kind === TaskReminderKind.BEFORE_DEADLINE
              ? ("deadline" as const)
              : ("start" as const)),
          offsetMinutes:
            input.offsetMinutes ??
            (current.kind === TaskReminderKind.AT_TIME
              ? 0
              : current.offsetMinutes),
          atTime: input.atTime === undefined ? current.atTime : input.atTime,
        };
    if (!merged.at && !current.taskId && !current.eventId) {
      return {
        ok: false,
        status: 400,
        error: "A reminder on its own needs an absolute at.",
      };
    }
    Object.assign(data, specColumns(merged, !!current.eventId), {
      snoozedUntil: null,
      ...PENDING_AGAIN,
    });
  }
  if (input.snoozeUntil !== undefined) {
    data.snoozedUntil = input.snoozeUntil ? newDate(input.snoozeUntil) : null;
    Object.assign(data, PENDING_AGAIN);
  }
  if (input.channels) data.channels = input.channels;
  if (input.title && !current.taskId && !current.eventId) {
    data.title = input.title;
  }
  try {
    const row = await prisma.taskReminder.update({
      where: { id },
      data,
      include: reminderInclude,
    });
    await scheduleReminder(row);
    return { ok: true, value: toReminderView(row, await userTimeZone(userId)) };
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return {
        ok: false,
        status: 409,
        error: "This task already has a reminder at that time.",
      };
    }
    throw error;
  }
}

export async function snoozeReminder(
  userId: string,
  id: string,
  until: Date
): Promise<ServiceResult<ReminderView>> {
  return updateReminder(userId, id, { snoozeUntil: until.toISOString() });
}

export async function deleteReminder(
  userId: string,
  id: string
): Promise<ServiceResult<{ id: string }>> {
  const result = await prisma.taskReminder.updateMany({
    where: { id, userId, canceledAt: null },
    data: { canceledAt: newDate() },
  });
  return result.count
    ? { ok: true, value: { id } }
    : { ok: false, status: 404, error: "Reminder not found" };
}

/** Puts a delayed job at the reminder's fire time. Safe to call twice. */
export async function scheduleReminder(
  row: Pick<ReminderRow, "id" | "userId"> &
    Parameters<typeof reminderFireTime>[0],
  timeZone?: string
) {
  const fires = reminderFireTime(
    row,
    timeZone ?? (await userTimeZone(row.userId))
  );
  if (!fires) return null;
  try {
    return await scheduleReminderDelivery(row.id, fires);
  } catch (error) {
    // The minute sweep still finds it; a queue hiccup must not fail the write.
    await logger.warn(
      "Could not schedule a reminder job",
      {
        reminderId: row.id,
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    return null;
  }
}

/**
 * After a task or event moved: re-arm reminders that now fire later than
 * they were delivered (a moved meeting reminds again) and schedule a job for
 * every pending one. Completed tasks keep their reminders quiet; the worker
 * cancels them when they come due.
 */
export async function rescheduleRemindersFor(
  target: { taskId: string } | { eventId: string },
  now = newDate()
) {
  const rows = await prisma.taskReminder.findMany({
    where: { ...target, canceledAt: null },
    include: reminderInclude,
    take: 50,
  });
  if (!rows.length) return 0;
  const timeZone = await userTimeZone(rows[0].userId);
  let scheduled = 0;
  for (const row of rows) {
    const fires = reminderFireTime(row, timeZone);
    if (!fires) continue;
    if (row.deliveredAt && !row.snoozedUntil) {
      if (fires <= now || fires <= row.deliveredAt) continue;
      await prisma.taskReminder.update({
        where: { id: row.id },
        data: PENDING_AGAIN,
      });
    } else if (row.deliveredAt) {
      continue;
    }
    await scheduleReminder(row, timeZone);
    scheduled += 1;
  }
  return scheduled;
}

/** Fire-and-forget form for write paths that must not wait on the queue. */
export function rescheduleRemindersSoon(
  target: { taskId: string } | { eventId: string }
) {
  void rescheduleRemindersFor(target).catch((error) =>
    logger.warn(
      "Could not reschedule reminders",
      {
        ...target,
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    )
  );
}
