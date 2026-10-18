import { formatInTimeZone } from "@/lib/date-utils";

/**
 * The numbers behind Home's "This week" card and its full stats view. Pure:
 * the route reads the rows, this turns them into days. A day is the person's
 * own ("YYYY-MM-DD" in their saved time zone); `days` is the window, oldest
 * first, ending on their today.
 */

export type StatsRange = "week" | "month";

export const STATS_DAYS: Record<StatsRange, number> = { week: 7, month: 30 };

export interface StatsDay {
  date: string;
  done: number;
  /** Minutes of focus that day; 0 when none. */
  focusMinutes: number;
}

export interface StatsByProject {
  projectId: string | null;
  name: string;
  color: string | null;
  done: number;
}

export interface Stats {
  range: StatsRange;
  from: string;
  to: string;
  timeZone: string;
  /** Tasks closed in the window. */
  total: number;
  days: StatsDay[];
  /** The day with the most closed tasks, or null when none was closed. */
  bestDay: string | null;
  byProject: StatsByProject[];
  /** Closed tasks per weekday (0 = Sunday), all seven always present. */
  byWeekday: { weekday: number; done: number }[];
  /** The weekday with the most closed tasks, or null when none was closed. */
  bestWeekday: number | null;
  /** Focus minutes in the window, or null when no Focus session was stored. */
  focusMinutes: number | null;
  focusSessions: number;
}

export interface StatsInput {
  range: StatsRange;
  days: readonly string[];
  timeZone: string;
  tasks: readonly { completedAt: Date | null; projectId: string | null }[];
  sessions: readonly { startedAt: Date; elapsedMinutes: number }[];
  projects: readonly { id: string; name: string; color: string | null }[];
}

const weekdayOf = (key: string) => new Date(`${key}T00:00:00.000Z`).getUTCDay();

export function buildStats(input: StatsInput): Stats {
  const { days, timeZone } = input;
  const local = (d: Date) => formatInTimeZone(d, timeZone, "yyyy-MM-dd");
  const done = new Map<string, number>(days.map((d) => [d, 0]));
  const focus = new Map<string, number>(days.map((d) => [d, 0]));
  const perProject = new Map<string | null, number>();

  for (const t of input.tasks) {
    if (!t.completedAt) continue;
    const day = local(t.completedAt);
    if (!done.has(day)) continue;
    done.set(day, (done.get(day) ?? 0) + 1);
    perProject.set(t.projectId, (perProject.get(t.projectId) ?? 0) + 1);
  }

  let sessions = 0;
  for (const s of input.sessions) {
    const day = local(s.startedAt);
    if (!focus.has(day) || s.elapsedMinutes <= 0) continue;
    focus.set(day, (focus.get(day) ?? 0) + s.elapsedMinutes);
    sessions++;
  }

  const rows: StatsDay[] = days.map((date) => ({
    date,
    done: done.get(date) ?? 0,
    focusMinutes: focus.get(date) ?? 0,
  }));
  const total = rows.reduce((s, r) => s + r.done, 0);

  // The latest of equal days wins: the most recent proof of a good day.
  let best: StatsDay | null = null;
  for (const r of rows)
    if (r.done > 0 && (!best || r.done >= best.done)) best = r;

  const names = new Map(input.projects.map((p) => [p.id, p]));
  const byProject = [...perProject.entries()]
    .map(([projectId, n]): StatsByProject => {
      const p = projectId ? names.get(projectId) : undefined;
      return {
        projectId,
        name: p?.name ?? "No project",
        color: p?.color ?? null,
        done: n,
      };
    })
    .sort((a, b) => b.done - a.done || a.name.localeCompare(b.name));

  const byWeekday = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    done: rows
      .filter((r) => weekdayOf(r.date) === weekday)
      .reduce((s, r) => s + r.done, 0),
  }));
  const bestWd = byWeekday.reduce((a, b) => (b.done > a.done ? b : a));

  return {
    range: input.range,
    from: days[0] ?? "",
    to: days[days.length - 1] ?? "",
    timeZone,
    total,
    days: rows,
    bestDay: best?.date ?? null,
    byProject,
    byWeekday,
    bestWeekday: bestWd.done > 0 ? bestWd.weekday : null,
    focusMinutes: sessions
      ? rows.reduce((s, r) => s + r.focusMinutes, 0)
      : null,
    focusSessions: sessions,
  };
}
