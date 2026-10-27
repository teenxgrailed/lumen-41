/* WHEN A REMINDER FIRES, AND WHAT IT IS CALLED — pure, shared by the API, the
 * feed, the worker and the bell, so all four agree on one time.
 *
 *  - BEFORE_START / BEFORE_DEADLINE: the anchor (the task's start or
 *    deadline, an event's start) minus offsetMinutes. With atTime ("09:00")
 *    it fires at that wall time, in the person's zone, on the day of
 *    (anchor minus offsetMinutes): "1 day before, 09:00". A moved task moves
 *    its reminder because nothing here is stored as a time.
 *  - AT_TIME: fireAt.
 *  - snoozedUntil, when set, wins over both.
 */
import { TaskReminderKind } from "@prisma/client";

import { formatInTimeZone, fromZonedTime, newDate } from "@/lib/date-utils";

export const MAX_OFFSET_MINUTES = 43_200; // 30 days
export const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface ReminderAnchors {
  task?: {
    scheduledStart: Date | null;
    deadline: Date | null;
    dueDate: Date | null;
  } | null;
  event?: { start: Date } | null;
}

export interface ReminderTiming extends ReminderAnchors {
  kind: TaskReminderKind;
  offsetMinutes: number;
  atTime?: string | null;
  fireAt?: Date | null;
  snoozedUntil?: Date | null;
}

/** The time the reminder is anchored to, or null when the task has none. */
export function reminderAnchor(r: ReminderTiming): Date | null {
  if (r.event) return r.event.start;
  if (!r.task) return null;
  return r.kind === TaskReminderKind.BEFORE_START
    ? r.task.scheduledStart
    : (r.task.deadline ?? r.task.dueDate);
}

/** When it fires, before any snooze. */
export function plannedFireTime(
  r: ReminderTiming,
  timeZone = "UTC"
): Date | null {
  if (r.kind === TaskReminderKind.AT_TIME) return r.fireAt ?? null;
  const anchor = reminderAnchor(r);
  if (!anchor) return null;
  const base = newDate(anchor.getTime() - r.offsetMinutes * 60_000);
  if (!r.atTime || !TIME_OF_DAY.test(r.atTime)) return base;
  const zone = safeZone(timeZone);
  const day = formatInTimeZone(base, zone, "yyyy-MM-dd");
  return fromZonedTime(`${day}T${r.atTime}:00.000`, zone);
}

/** When it fires: the snooze when there is one, else the planned time. */
export function reminderFireTime(
  r: ReminderTiming,
  timeZone = "UTC"
): Date | null {
  return r.snoozedUntil ?? plannedFireTime(r, timeZone);
}

export function safeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}

/**
 * The (taskId, kind, offsetMinutes) key stays unique per task; an AT_TIME
 * reminder takes minus its fire minute since the epoch, so two at the same
 * minute are one and relative offsets (never negative) never collide.
 */
export function atTimeKey(fireAt: Date): number {
  return -Math.floor(fireAt.getTime() / 60_000);
}

function amount(minutes: number): string {
  if (minutes % 10_080 === 0) {
    const w = minutes / 10_080;
    return `${w} week${w === 1 ? "" : "s"}`;
  }
  if (minutes % 1_440 === 0) {
    const d = minutes / 1_440;
    return `${d} day${d === 1 ? "" : "s"}`;
  }
  if (minutes % 60 === 0) {
    const h = minutes / 60;
    return `${h} hour${h === 1 ? "" : "s"}`;
  }
  return `${minutes} min`;
}

/**
 * What the reminder is, in the words of the picker: "At start", "10 min
 * before", "1 day before, 09:00", "1 hour before the deadline", or for an
 * absolute one the time in the person's zone ("Wed 28 Oct, 14:00").
 */
export function reminderLabel(
  r: Pick<ReminderTiming, "kind" | "offsetMinutes" | "atTime" | "fireAt"> & {
    onEvent?: boolean;
  },
  timeZone = "UTC"
): string {
  if (r.kind === TaskReminderKind.AT_TIME) {
    return r.fireAt
      ? formatInTimeZone(r.fireAt, safeZone(timeZone), "EEE d MMM, HH:mm")
      : "At a time";
  }
  const deadline = r.kind === TaskReminderKind.BEFORE_DEADLINE && !r.onEvent;
  const base =
    r.offsetMinutes === 0
      ? r.atTime
        ? deadline
          ? "On the deadline day"
          : "On the day"
        : deadline
          ? "At the deadline"
          : "At start"
      : `${amount(r.offsetMinutes)} before${deadline ? " the deadline" : ""}`;
  return r.atTime ? `${base}, ${r.atTime}` : base;
}
