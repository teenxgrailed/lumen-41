import { habitDateFromKey } from "@/lib/habit-completion-date";

/**
 * The day streak behind Home's small streak card. Pure: the route reads the
 * rows, this turns them into numbers. A day counts when the person closed at
 * least one task or kept one habit on it; days are the person's own
 * ("YYYY-MM-DD" in their saved time zone).
 */

export interface StreakDay {
  date: string;
  done: boolean;
}

export interface Streak {
  /** Days in a row ending today, or yesterday while today is still open. */
  current: number;
  /** The longest run in the stretch that was read. */
  best: number;
  /** The person's today ("YYYY-MM-DD"). */
  today: string;
  /** The last seven days, oldest first, ending on today. */
  days: StreakDay[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const dayNumber = (key: string) =>
  Math.round(habitDateFromKey(key).getTime() / DAY_MS);

export function buildStreak(input: {
  /** The person's today. */
  today: string;
  /** The last seven days, oldest first, ending on `today`. */
  window: readonly string[];
  /** Every day with a closed task or a kept habit (any order, any length). */
  doneDays: Iterable<string>;
}): Streak {
  const done = new Set(input.doneDays);
  const numbers = [...new Set([...done].map(dayNumber))].sort((a, b) => a - b);

  // longest run of consecutive days
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const n of numbers) {
    run = prev !== null && n === prev + 1 ? run + 1 : 1;
    if (run > best) best = run;
    prev = n;
  }

  // today is still open, so it can only join the streak, never break it
  const set = new Set(numbers);
  const t = dayNumber(input.today);
  let cursor = set.has(t) ? t : t - 1;
  let current = 0;
  while (set.has(cursor)) {
    current++;
    cursor--;
  }

  return {
    current,
    best,
    today: input.today,
    days: input.window.map((date) => ({ date, done: done.has(date) })),
  };
}
