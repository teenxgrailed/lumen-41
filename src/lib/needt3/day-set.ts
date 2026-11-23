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
 *   or scheduled that day; overdue work is NOT part of today (a done task due
 *   earlier is not today's either, whatever day it was ticked);
 * - the day plan's picks (`include`) join even with no date or an overdue one,
 *   never when the task now sits on a later day. A pick the evening close sent
 *   away (resolution tomorrow or Someday) leaves `include`, but a task that is
 *   still DATED today stays in today's set: the close never changes a date,
 *   and the plan list still draws it;
 * - done tasks stay in the set (they are what "x of y" counts), and `done`
 *   says which. A hidden-done view setting never changes a count.
 *
 * Minutes (`taskMinutes`, the one rule): the task's estimate, else 30 when it
 * has a block on that day (the length the Calendar draws a timed task at),
 * else 0. Done work counts in the day total; "left" figures use `open*`.
 *
 * What reads this set: the phone Home (greeting, "x of y", focus total,
 * progress, time-left), the Calendar's day line ("planned" and "booked",
 * events apart) and the menu's Today and Calendar rows. The Calendar's ROWS
 * and the week/month dots are still drawn from `calendarItems` (a task by its
 * block or due date), which can differ for a pick with no date; only the
 * "N done hidden" figure comes from what Hide done really removed.
 */
import { hourOn, taskDay } from "./task-day";
import type { DayFields } from "./task-day";

/** What the Calendar draws a task with a time but no estimate at, minutes. */
export const TIMED_DEFAULT_MINUTES = 30;

export interface DaySetTask extends DayFields {
  id: string;
  estimatedMinutes?: number | null;
  /** Absent on the client list (ideas are not sent); IDEA is left out here too. */
  kind?: "TASK" | "IDEA";
}

/**
 * Minutes a task takes: its estimate, else 30 when it has a time ON `day` (a
 * stale block on another day is not a time today), else 0. The Calendar draws
 * its timed blocks with this same rule (`blocks.ts`).
 */
export function taskMinutes(
  t: Pick<DaySetTask, "estimatedMinutes" | "scheduledStart">,
  day: string
): number {
  if (t.estimatedMinutes && t.estimatedMinutes > 0) return t.estimatedMinutes;
  return hourOn(t, day) != null ? TIMED_DEFAULT_MINUTES : 0;
}

/**
 * The tasks that sit on `day`. `include` = ids that belong to the day although
 * no date says so (the day plan's picks, `planPickIds`): they join when the
 * task has no day or an earlier one, never when it now sits on a later day.
 */
export function tasksOnDay<T extends DaySetTask>(
  tasks: readonly T[],
  day: string,
  include?: ReadonlySet<string>
): T[] {
  const picked = (t: T) => {
    if (!include?.has(t.id)) return false;
    const d = taskDay(t, day);
    return d == null || d <= day;
  };
  return tasks
    .filter(
      (t) =>
        t.kind !== "IDEA" &&
        !t.trashedAt &&
        ((!t.noSlot && taskDay(t, day) === day) || picked(t))
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
  const sum = (l: readonly T[]) =>
    l.reduce((s, t) => s + taskMinutes(t, day), 0);
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
 * The next open task with a time that has not started, as
 * `{ title, at: "HH:mm" }`. `dayTasks` = the day's set (`daySummary().items`,
 * already built by the caller); `now` = "YYYY-MM-DDTHH:mm", the person's now.
 */
export function nextTimedTask<T extends DaySetTask & { title: string }>(
  dayTasks: readonly T[],
  now: string
): { title: string; at: string } | null {
  const day = now.slice(0, 10);
  let next: T | null = null;
  for (const t of dayTasks) {
    if (t.done || !t.scheduledStart) continue;
    if (t.scheduledStart.slice(0, 10) !== day || t.scheduledStart < now)
      continue;
    if (!next || t.scheduledStart < (next.scheduledStart as string)) next = t;
  }
  return next && next.scheduledStart
    ? { title: next.title, at: next.scheduledStart.slice(11, 16) }
    : null;
}
