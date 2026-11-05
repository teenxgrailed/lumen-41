import { formatInTimeZone } from "@/lib/date-utils";
import {
  habitDayKey,
  normalizeUserTimeZone,
} from "@/lib/habit-completion-date";

/**
 * QUIT habits: streak, milestone and urge maths. Pure (no database, no clock):
 * the caller passes `now`, the events and the person's time zone, so the same
 * data gives the same answer in a test, in the API and in the worker.
 *
 * A "day" is a calendar day in the person's time zone, never 24 hours: a streak
 * that crosses a daylight-saving change is not a day short or long, and moving
 * to another zone moves the day boundary with the person.
 */

/** Days of a clean streak that count as a milestone, in order. */
export const QUIT_MILESTONES = [1, 3, 7, 14, 30, 90, 365] as const;

export type QuitEventType = "URGE" | "RESISTED" | "RELAPSE" | "MILESTONE";

export interface QuitEventInput {
  type: QuitEventType;
  at: Date;
  tag?: string | null;
}

export interface QuitSummaryInput {
  /** When the clean streak began; null when the person has not started yet. */
  quitStartedAt: Date | null;
  events: readonly QuitEventInput[];
  now: Date;
  timeZone: string | null | undefined;
}

export interface UrgeDistribution {
  /** 24 counts, index = hour of day (0 to 23) in the person's time zone. */
  byHour: number[];
  /** 7 counts, index = weekday in the person's time zone, 0 = Sunday. */
  byWeekday: number[];
  total: number;
}

export interface NextMilestone {
  days: number;
  daysLeft: number;
}

export interface QuitSummary {
  /** False until `quitStartedAt` is set; every number below is then 0. */
  started: boolean;
  timeZone: string;
  /** The instant the current streak began (start, or the last relapse). */
  streakStartedAt: Date | null;
  currentStreak: number;
  bestStreak: number;
  totalCleanDays: number;
  /** Largest milestone already reached by the current streak, or null. */
  lastMilestone: number | null;
  nextMilestone: NextMilestone | null;
  counts: Record<QuitEventType, number>;
  urges: UrgeDistribution;
  /** Most used urge tags, most frequent first (at most 5). */
  topUrgeTags: { tag: string; count: number }[];
}

const MS_PER_DAY = 86_400_000;

/** Whole calendar days from one yyyy-MM-dd key to a later one (never < 0). */
export function calendarDaysBetweenKeys(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const diff = Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd);
  return Math.max(0, Math.round(diff / MS_PER_DAY));
}

export function nextQuitMilestone(streak: number): NextMilestone | null {
  const days = QUIT_MILESTONES.find((milestone) => milestone > streak);
  return days === undefined ? null : { days, daysLeft: days - streak };
}

export function lastQuitMilestone(streak: number): number | null {
  let reached: number | null = null;
  for (const milestone of QUIT_MILESTONES) {
    if (milestone <= streak) reached = milestone;
  }
  return reached;
}

/** The urge histogram by hour and weekday, in the person's time zone. */
export function urgeDistribution(
  events: readonly Pick<QuitEventInput, "type" | "at">[],
  timeZone: string | null | undefined
): UrgeDistribution {
  const zone = normalizeUserTimeZone(timeZone);
  const byHour = new Array<number>(24).fill(0);
  const byWeekday = new Array<number>(7).fill(0);
  let total = 0;
  for (const event of events) {
    if (event.type !== "URGE") continue;
    const hour = Number(formatInTimeZone(event.at, zone, "H"));
    // ISO weekday: 1 = Monday ... 7 = Sunday; stored as 0 = Sunday.
    const weekday = Number(formatInTimeZone(event.at, zone, "i")) % 7;
    byHour[hour] += 1;
    byWeekday[weekday] += 1;
    total += 1;
  }
  return { byHour, byWeekday, total };
}

export function summarizeQuit(input: QuitSummaryInput): QuitSummary {
  const zone = normalizeUserTimeZone(input.timeZone);
  const counts: Record<QuitEventType, number> = {
    URGE: 0,
    RESISTED: 0,
    RELAPSE: 0,
    MILESTONE: 0,
  };
  const tags = new Map<string, number>();
  for (const event of input.events) {
    counts[event.type] += 1;
    if (event.type === "URGE" && event.tag) {
      tags.set(event.tag, (tags.get(event.tag) ?? 0) + 1);
    }
  }
  const topUrgeTags = [...tags.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([tag, count]) => ({ tag, count }));
  const urges = urgeDistribution(input.events, zone);

  const start = input.quitStartedAt;
  if (!start || start.getTime() > input.now.getTime()) {
    return {
      started: Boolean(start),
      timeZone: zone,
      streakStartedAt: start,
      currentStreak: 0,
      bestStreak: 0,
      totalCleanDays: 0,
      lastMilestone: null,
      nextMilestone: nextQuitMilestone(0),
      counts,
      urges,
      topUrgeTags,
    };
  }

  // Segment starts: the quit date, then each relapse on or after it and not
  // in the future. A relapse on the same day as the previous start closes a
  // segment of 0 days.
  const relapses = input.events
    .filter(
      (event) =>
        event.type === "RELAPSE" &&
        event.at.getTime() >= start.getTime() &&
        event.at.getTime() <= input.now.getTime()
    )
    .map((event) => event.at)
    .sort((a, b) => a.getTime() - b.getTime());

  const starts = [start, ...relapses];
  const keys = starts.map((date) => habitDayKey(date, zone));
  const nowKey = habitDayKey(input.now, zone);

  let best = 0;
  let total = 0;
  for (let index = 0; index < keys.length; index += 1) {
    const end = index + 1 < keys.length ? keys[index + 1] : nowKey;
    const length = calendarDaysBetweenKeys(keys[index], end);
    total += length;
    if (length > best) best = length;
  }
  const current = calendarDaysBetweenKeys(keys[keys.length - 1], nowKey);

  return {
    started: true,
    timeZone: zone,
    streakStartedAt: starts[starts.length - 1],
    currentStreak: current,
    bestStreak: best,
    totalCleanDays: total,
    lastMilestone: lastQuitMilestone(current),
    nextMilestone: nextQuitMilestone(current),
    counts,
    urges,
    topUrgeTags,
  };
}
