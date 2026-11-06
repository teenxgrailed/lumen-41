import { formatInTimeZone } from "@/lib/date-utils";
import {
  habitDayKey,
  normalizeUserTimeZone,
} from "@/lib/habit-completion-date";
import { calendarDaysBetweenKeys } from "@/lib/habits-quit";

/**
 * Habit presence: when a push is due. Pure (no database, no clock), so the
 * rules are tested directly; the sweep in presence-sweep.ts does the reading,
 * the dedup and the sending.
 *
 * Every time here is a wall-clock time in the person's zone. "Due" is a
 * window that opens at that time and stays open for `PRESENCE_WINDOW_MIN`
 * minutes, so a sweep that runs a few minutes late, or a skipped wall time at
 * a daylight-saving change, still fires once. Dedup is the sweep's job.
 */

export const PRESENCE_WINDOW_MIN = 60;
/** The soft re-engage push goes out around midday, never at night. */
export const REENGAGE_TIME = "12:00";
/** A QUIT streak milestone is announced in the morning, never at night. */
export const MILESTONE_TIME = "09:00";
/** Days without a check-in before the soft re-engage push. */
export const REENGAGE_AFTER_DAYS = 3;
/** At most one re-engage push in this many days. */
export const REENGAGE_COOLDOWN_DAYS = 7;

const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface LocalClock {
  /** yyyy-MM-dd in the person's zone. */
  dayKey: string;
  /** Minutes since local midnight. */
  minutes: number;
  /** 0 = Sunday. */
  weekday: number;
}

export function localClock(now: Date, timeZone: string | null | undefined) {
  const zone = normalizeUserTimeZone(timeZone);
  const [hour, minute] = formatInTimeZone(now, zone, "HH:mm")
    .split(":")
    .map(Number);
  return {
    dayKey: habitDayKey(now, zone),
    minutes: hour * 60 + minute,
    weekday: Number(formatInTimeZone(now, zone, "i")) % 7,
  } satisfies LocalClock;
}

/** The window of a "HH:mm" wall time, clipped to the end of the day. */
export function inPresenceWindow(
  timeOfDay: string | null | undefined,
  clock: LocalClock
): boolean {
  if (!timeOfDay || !TIME_OF_DAY.test(timeOfDay)) return false;
  const start = Number(timeOfDay.slice(0, 2)) * 60 + Number(timeOfDay.slice(3));
  return clock.minutes >= start && clock.minutes < start + PRESENCE_WINDOW_MIN;
}

/** Habit days: an empty list means every day. */
export function habitRunsToday(
  daysOfWeek: readonly number[],
  clock: LocalClock
): boolean {
  return daysOfWeek.length === 0 || daysOfWeek.includes(clock.weekday);
}

export function habitReminderDue(
  habit: { at: string | null; daysOfWeek: readonly number[] },
  clock: LocalClock,
  doneToday: boolean
): boolean {
  return (
    !doneToday &&
    habitRunsToday(habit.daysOfWeek, clock) &&
    inPresenceWindow(habit.at, clock)
  );
}

/**
 * A QUIT streak milestone to announce: the largest one reached, if it was
 * reached today or yesterday (a sweep held back by quiet hours may announce it
 * the next morning, never a week later).
 */
export function milestoneToAnnounce(streak: {
  currentStreak: number;
  lastMilestone: number | null;
}): number | null {
  if (streak.lastMilestone === null) return null;
  return streak.currentStreak - streak.lastMilestone <= 1
    ? streak.lastMilestone
    : null;
}

/**
 * Whole days since the last check-in; the habit's age when there is none.
 * `completionKeys` are yyyy-MM-dd days.
 */
export function daysSinceCheckIn(
  todayKey: string,
  completionKeys: readonly string[],
  createdKey: string
): number {
  const latest = completionKeys.reduce<string | null>(
    (best, key) => (key <= todayKey && (!best || key > best) ? key : best),
    null
  );
  return calendarDaysBetweenKeys(latest ?? createdKey, todayKey);
}

export function reengageDue(input: {
  clock: LocalClock;
  /** Days since the most recent check-in across the person's habits. */
  daysQuiet: number;
  lastReengageAt: Date | null;
  now: Date;
}): boolean {
  if (!inPresenceWindow(REENGAGE_TIME, input.clock)) return false;
  if (input.daysQuiet < REENGAGE_AFTER_DAYS) return false;
  if (!input.lastReengageAt) return true;
  const cooldownMs = REENGAGE_COOLDOWN_DAYS * 86_400_000;
  return input.now.getTime() - input.lastReengageAt.getTime() >= cooldownMs;
}

export type PresenceKind = "reminder" | "checkin" | "milestone" | "reengage";

/**
 * One name for one moment, shared by the push (the notification's tag, so
 * the OS replaces a repeat instead of stacking it) and the open app's island
 * (which closes the push with that tag once it has said the same thing).
 */
export function presenceTag(moment: {
  kind: PresenceKind;
  habitId: string | null;
  dayKey: string;
  /** Milestones: the step in days. */
  days?: number;
}): string {
  switch (moment.kind) {
    case "reminder":
      return `rem:${moment.habitId}:${moment.dayKey}`;
    case "checkin":
      return `checkin:${moment.dayKey}`;
    case "milestone":
      return `ms:${moment.habitId}:${moment.days}`;
    case "reengage":
      return `reengage:${moment.dayKey}`;
  }
}

export interface PresenceText {
  title: string;
  body: string;
}

/** Short, plain, never shaming. English only until the app has copy files. */
export const presenceText = {
  reminder: (title: string): PresenceText => ({
    title,
    body: "Whenever you are ready.",
  }),
  checkin: (open: number): PresenceText => ({
    title: "Evening check-in",
    body:
      open === 1
        ? "1 habit is still open today."
        : `${open} habits are still open today.`,
  }),
  milestone: (title: string, days: number): PresenceText => ({
    title: days === 1 ? "1 day in" : `${days} days in`,
    body: title,
  }),
  reengage: (): PresenceText => ({
    title: "Your habits are here",
    body: "Pick up whenever it suits you.",
  }),
};
