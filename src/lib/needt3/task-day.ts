/**
 * Which day a task belongs to, and whether it is overdue — the one rule every
 * design_v3 surface reads (Home desktop + phone, Tasks desktop + phone, the
 * project page, the calendar, the sidebar badge and every "Move to today").
 *
 * Owner decision (2026-10-12):
 * - OVERDUE = open and its due date is before today (the person's day, in
 *   their saved time zone). Nothing else makes a task overdue: a block whose
 *   scheduled time has passed does not, and neither does a stale
 *   `scheduledStart` on a task with no due date.
 * - A task due today belongs to Today, even when its scheduled time has
 *   already passed. A task scheduled today belongs to Today too.
 *
 * Every day here is "YYYY-MM-DD" already local to the person's zone (map.ts
 * converts on the way in); `today` is always an argument, so nothing reads
 * the clock.
 */
import { hourOf } from "./derive";

export interface DayFields {
  done: boolean;
  dueDate: string | null;
  scheduledStart?: string | null;
  noSlot?: boolean;
  /** RRULE of a repeating series row; null or absent when it does not repeat. */
  repeat?: string | null;
  trashedAt?: string | null;
}

/** The day of a task's `scheduledStart`, or null. */
export const scheduledDay = (t: Pick<DayFields, "scheduledStart">) =>
  t.scheduledStart ? t.scheduledStart.slice(0, 10) : null;

/** Open, placeable, not in Trash, and due before today. */
export function isOverdue(t: DayFields, today: string): boolean {
  return (
    !t.done && !t.noSlot && !t.trashedAt && !!t.dueDate && t.dueDate < today
  );
}

/**
 * The day a task is drawn on:
 * - due before today → its due day (overdue when still open);
 * - due today → today, wherever its block sits;
 * - scheduled today or later → the scheduled day;
 * - otherwise its due day, or null (no day: Inbox). A `scheduledStart` that
 *   has passed on a task with no due date gives it no day — it is not late.
 */
export function taskDay(
  t: Pick<DayFields, "dueDate" | "scheduledStart" | "repeat">,
  today: string
): string | null {
  if (t.dueDate && t.dueDate <= today) return t.dueDate;
  // A repeating series row sits on its next occurrence. A block left over
  // from before that date (the task was ticked early) does not pull it back
  // into today.
  if (t.repeat && t.dueDate) return t.dueDate;
  const s = scheduledDay(t);
  if (s && s >= today) return s;
  return t.dueDate ?? null;
}

/** True when the task sits on today (due or scheduled today, not overdue). */
export const isOnToday = (
  t: Pick<DayFields, "dueDate" | "scheduledStart" | "repeat">,
  today: string
) => taskDay(t, today) === today;

/**
 * The hour (decimal) the task sits at on `day`, or null: only a
 * `scheduledStart` on that very day gives an hour, so a task due today whose
 * block was yesterday at 19:00 reads as "anytime today", not "19:00".
 */
export function hourOn(t: Pick<DayFields, "scheduledStart">, day: string) {
  return scheduledDay(t) === day ? hourOf(t.scheduledStart) : null;
}

/** Overdue first by due day (oldest first), then by hour. */
export function byOverdue<T extends DayFields>(a: T, b: T) {
  const d = (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
  return (
    d || (hourOf(a.scheduledStart) ?? 99) - (hourOf(b.scheduledStart) ?? 99)
  );
}

/** The open overdue tasks, oldest first. */
export function overdueTasks<T extends DayFields>(
  tasks: readonly T[],
  today: string
): T[] {
  return tasks.filter((t) => isOverdue(t, today)).sort(byOverdue);
}

/** How many open tasks are overdue (badges, counters). */
export const overdueCount = (tasks: readonly DayFields[], today: string) =>
  tasks.filter((t) => isOverdue(t, today)).length;

/** Today's tasks (open and done), timed ones by hour, untimed after. */
export function todayTasks<T extends DayFields>(
  tasks: readonly T[],
  today: string
): T[] {
  return tasks
    .filter((t) => !t.noSlot && !t.trashedAt && isOnToday(t, today))
    .sort((a, b) => (hourOn(a, today) ?? 99) - (hourOn(b, today) ?? 99));
}
