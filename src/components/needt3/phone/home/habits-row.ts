/**
 * Home's row of habit circles on the phone, pure. One circle per live habit:
 * its emoji (or the first letter of its title), a ring for the week so far,
 * and whether today is kept. The ticks are `useToggleHabitToday`, the same
 * mutation as the Habits screen.
 */
import {
  type Checkin,
  habitColor,
  habitDoneOn,
  habitWeek,
  liveHabits,
} from "@/lib/needt3/derive";
import type { V3Habit, V3Project } from "@/lib/needt3/map";

export interface HabitDot {
  id: string;
  /** The emoji, or the title's first letter (upper case). */
  mark: string;
  hue: string;
  on: boolean;
  /** 0..1, the week so far against the habit's weekly target (7 if none). */
  frac: number;
  /** For the accessible name: "Run, kept today, tap to undo". */
  say: string;
}

const EMOJI = /^\p{Extended_Pictographic}/u;

/** An emoji icon as it is, else the title's first letter. */
export function habitMark(h: Pick<V3Habit, "icon" | "title">): string {
  const icon = (h.icon ?? "").trim();
  if (icon && EMOJI.test(icon)) return Array.from(icon)[0] ?? "";
  const first = Array.from(h.title.trim())[0] ?? "?";
  return first.toLocaleUpperCase();
}

export function habitDots(
  habits: readonly V3Habit[],
  checkins: readonly Checkin[],
  today: string,
  projects: readonly V3Project[]
): HabitDot[] {
  return liveHabits(habits).map((h) => {
    const on = habitDoneOn(h.id, today, checkins);
    const target = h.schedule.perWeek || 7;
    const frac = Math.min(1, habitWeek(h.id, checkins, today) / target);
    return {
      id: h.id,
      mark: habitMark(h),
      hue: habitColor(h, projects) ?? "var(--text-tertiary)",
      on,
      frac,
      say: `${h.title}, ${on ? "kept today, tap to undo" : "tap to keep today"}`,
    };
  });
}
