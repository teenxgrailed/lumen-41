/**
 * SPREAD on Home, pure: which tasks a spread takes, and what its answer says.
 * The placing itself is the server's (`task.spread`): each task goes to the
 * first day from today that still has room for it.
 */
import { addDays, dayLabel, weekday } from "@/lib/needt3/derive";
import type { V3Task } from "@/lib/needt3/map";
import { hourOn } from "@/lib/needt3/task-day";

export interface SpreadRow {
  taskId: string;
  title: string;
  date: string;
}

export interface SpreadResult {
  today: string;
  moved: SpreadRow[];
  stayed: SpreadRow[];
  unplaced: Array<{ taskId: string; title: string }>;
}

/** Today's open tasks with no time today and no fixed time: "Anytime today". */
export function anytimeOpen(day: readonly V3Task[], today: string) {
  return day.filter((t) => !t.done && !t.isFixed && hourOn(t, today) == null);
}

/** Open overdue tasks a spread may move (a fixed time stays where it is). */
export function lateMovable(late: readonly V3Task[]) {
  return late.filter((t) => !t.done && !t.isFixed);
}

/**
 * Which of the Overdue actions carries the weight: Spread when today is
 * already overbooked (piling more onto it would only make that worse), else
 * Move to today.
 */
export const spreadLeads = (overbooked: boolean, movable: number) =>
  overbooked && movable > 0;

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Today", "Tomorrow", else "Mon 26 Oct". */
export function spreadDay(date: string, today: string) {
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  return `${DOW[weekday(date)]} ${dayLabel(date)}`;
}

const tasks = (n: number) => `${n} ${n === 1 ? "task" : "tasks"}`;

/**
 * What a spread did, in one line and a detail: where the first few went.
 * Nothing moved says why: they fit today after all, or no day has room.
 */
export function spreadSummary(
  r: SpreadResult,
  shown = 3
): { headline: string; detail?: string } {
  const miss = r.unplaced.length;
  if (!r.moved.length) {
    if (miss) return { headline: "No day this week has room for these" };
    return r.stayed.length
      ? { headline: "Nothing to move: these fit today" }
      : { headline: "Nothing to spread" };
  }
  const allToday = r.moved.every((m) => m.date === r.today);
  let headline = allToday
    ? `${tasks(r.moved.length)} moved to today`
    : `${tasks(r.moved.length)} moved to days with room`;
  if (miss) headline += `. ${tasks(miss)} did not fit this week`;
  const lines = r.moved
    .slice(0, shown)
    .map((m) => `${m.title} → ${spreadDay(m.date, r.today)}`);
  const rest = r.moved.length - lines.length;
  return {
    headline,
    detail:
      rest > 0 ? `${lines.join(" · ")} · +${rest} more` : lines.join(" · "),
  };
}
