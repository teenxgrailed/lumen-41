/**
 * SPREAD, pure: give each task of a set the first day, from today over a short
 * horizon, that still has room for it. "Room" is the day's working time left
 * (its own hours, less events and personal time, from now on for today) less
 * what is already on that day. A task that fits nowhere stays where it is.
 *
 * The answer is per day, not per hour: the task gets that day as its due day
 * and Home draws it there; the scheduler still places the hour for a task
 * that has Auto-schedule on. Nothing here reads the clock or the database.
 */
import { formatInTimeZone } from "@/lib/date-utils";

/** A task with no estimate takes this long, as it does in the scheduler. */
export const SPREAD_DEFAULT_MINUTES = 30;
/** How many calendar days, today included, a spread looks at by default. */
export const SPREAD_DEFAULT_DAYS = 7;

export interface SpreadDay {
  /** "YYYY-MM-DD" in the person's zone. */
  date: string;
  /** Minutes still free for more work on that day (may be negative). */
  free: number;
}

export interface SpreadItem {
  id: string;
  minutes: number;
}

export interface SpreadResult {
  /** Every task that fits, with the day it goes to (it may be its own day). */
  placed: Array<{ id: string; date: string }>;
  /** The ones that fit on no day; they stay where they are. */
  unplaced: string[];
}

/** First fit, in the order given: the earliest day with room takes the task. */
export function spreadAcrossDays(
  items: readonly SpreadItem[],
  days: readonly SpreadDay[]
): SpreadResult {
  const room = days.map((day) => ({ date: day.date, free: day.free }));
  const placed: SpreadResult["placed"] = [];
  const unplaced: string[] = [];
  for (const item of items) {
    const minutes = Math.max(1, item.minutes);
    const day = room.find((d) => d.free >= minutes);
    if (!day) {
      unplaced.push(item.id);
      continue;
    }
    day.free -= minutes;
    placed.push({ id: item.id, date: day.date });
  }
  return { placed, unplaced };
}

const PRIORITY_RANK: Record<string, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

/**
 * The order a spread takes tasks in: higher priority first (it gets the
 * earlier day), then the earlier due day, then the order they came in.
 */
export function spreadOrder<
  T extends { priorityLevel?: string | null; dueDate?: Date | null },
>(tasks: readonly T[]): T[] {
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((a, b) => {
      const rank =
        (PRIORITY_RANK[a.task.priorityLevel ?? "MEDIUM"] ?? 2) -
        (PRIORITY_RANK[b.task.priorityLevel ?? "MEDIUM"] ?? 2);
      if (rank) return rank;
      const due =
        (a.task.dueDate?.getTime() ?? Infinity) -
        (b.task.dueDate?.getTime() ?? Infinity);
      if (due && Number.isFinite(due)) return due;
      if (a.task.dueDate && !b.task.dueDate) return -1;
      if (!a.task.dueDate && b.task.dueDate) return 1;
      return a.index - b.index;
    })
    .map(({ task }) => task);
}

/** Minutes a task takes on its day: its estimate, else the default. */
export function spreadMinutes(task: {
  estimatedMinutes?: number | null;
  duration?: number | null;
}) {
  return task.estimatedMinutes || task.duration || SPREAD_DEFAULT_MINUTES;
}

/**
 * A stored due date as the person's day. A bare date is saved as UTC
 * midnight and reads as that date; anything else is read in their zone (the
 * same rule as the client's `isoToDay`).
 */
export function dayInZone(value: Date | null | undefined, timeZone: string) {
  if (!value) return null;
  const iso = value.toISOString();
  return iso.endsWith("T00:00:00.000Z")
    ? iso.slice(0, 10)
    : formatInTimeZone(value, timeZone, "yyyy-MM-dd");
}

/**
 * The day a task sits on, the server twin of `@/lib/needt3/task-day`
 * `taskDay`: due today or before → its due day; scheduled today or later →
 * that day; else its due day, or none.
 */
export function taskDayInZone(
  task: { dueDate: Date | null; scheduledStart: Date | null },
  today: string,
  timeZone: string
): string | null {
  const due = dayInZone(task.dueDate, timeZone);
  if (due && due <= today) return due;
  const scheduled = task.scheduledStart
    ? formatInTimeZone(task.scheduledStart, timeZone, "yyyy-MM-dd")
    : null;
  if (scheduled && scheduled >= today) return scheduled;
  return due;
}
