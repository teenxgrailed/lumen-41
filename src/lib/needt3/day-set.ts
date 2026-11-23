/**
 * "Today's tasks", the ONE definition behind every counter that says how many
 * tasks a day holds or how many minutes they come to: the phone Home's
 * greeting, its "x of y" line, its focus total, the time-left card, the
 * Calendar's day line and the menu's Today / Calendar rows.
 *
 * The set of a day (the person's day, `day` = "YYYY-MM-DD" already in their
 * saved zone, never read from a clock here):
 * - kind TASK only (an Idea card is not work, so never counted);
 * - not in Trash, not "no slot";
 * - sits on the day by the one rule of `task-day` (`taskDay`): due that day,
 *   or scheduled that day; overdue work is NOT part of today;
 * - done tasks stay in the set (they are what "x of y" counts), and `done`
 *   says which. A hidden-done view setting never changes a count.
 *
 * Minutes are the task's estimate, else the length of its scheduled block,
 * else 0 (an unestimated task is not given invented minutes).
 */
import { minutesBetween } from "./derive";
import { hourOn, taskDay } from "./task-day";
import type { DayFields } from "./task-day";

export interface DaySetTask extends DayFields {
  id: string;
  estimatedMinutes?: number | null;
  scheduledEnd?: string | null;
  /** Absent on the client list (ideas are not sent); IDEA is left out here too. */
  kind?: "TASK" | "IDEA";
}

/** Minutes a task takes: its estimate, else its scheduled block, else 0. */
export function taskMinutes(
  t: Pick<DaySetTask, "estimatedMinutes" | "scheduledStart" | "scheduledEnd">
): number {
  if (t.estimatedMinutes && t.estimatedMinutes > 0) return t.estimatedMinutes;
  if (t.scheduledStart && t.scheduledEnd && t.scheduledEnd > t.scheduledStart)
    return Math.max(0, minutesBetween(t.scheduledStart, t.scheduledEnd));
  return 0;
}

/**
 * The tasks that sit on `day`. `include` = ids that belong to the day although
 * no date says so (the day plan's picks), when the caller has such a list.
 */
export function tasksOnDay<T extends DaySetTask>(
  tasks: readonly T[],
  day: string,
  include?: ReadonlySet<string>
): T[] {
  return tasks
    .filter(
      (t) =>
        t.kind !== "IDEA" &&
        !t.trashedAt &&
        (include?.has(t.id) || (!t.noSlot && taskDay(t, day) === day))
    )
    .sort((a, b) => (hourOn(a, day) ?? 99) - (hourOn(b, day) ?? 99));
}

export interface DaySummary<T extends DaySetTask = DaySetTask> {
  /** The day's tasks, done ones included, timed by hour then the rest. */
  items: T[];
  /** Tasks on the day, done included. */
  total: number;
  done: number;
  open: number;
  /** Minutes of every task on the day, done included. */
  minutes: number;
  /** Minutes of the tasks still open. */
  openMinutes: number;
}

/** The counters of one day, from the one set. */
export function daySummary<T extends DaySetTask>(
  tasks: readonly T[],
  day: string,
  include?: ReadonlySet<string>
): DaySummary<T> {
  const items = tasksOnDay(tasks, day, include);
  const open = items.filter((t) => !t.done);
  const sum = (l: readonly T[]) => l.reduce((s, t) => s + taskMinutes(t), 0);
  return {
    items,
    total: items.length,
    done: items.length - open.length,
    open: open.length,
    minutes: sum(items),
    openMinutes: sum(open),
  };
}

/**
 * The next open task of `day` that has a time and has not started, as
 * `{ title, at: "HH:mm" }`; `now` = "YYYY-MM-DDTHH:mm", the person's local now.
 */
export function nextTimedTask<T extends DaySetTask & { title: string }>(
  tasks: readonly T[],
  now: string
): { title: string; at: string } | null {
  const day = now.slice(0, 10);
  let next: T | null = null;
  for (const t of tasksOnDay(tasks, day)) {
    if (t.done || !t.scheduledStart) continue;
    if (t.scheduledStart.slice(0, 10) !== day || t.scheduledStart < now)
      continue;
    if (!next || t.scheduledStart < (next.scheduledStart as string)) next = t;
  }
  return next && next.scheduledStart
    ? { title: next.title, at: next.scheduledStart.slice(11, 16) }
    : null;
}
