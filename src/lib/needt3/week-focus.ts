/**
 * The week's focuses (Sunday review), pure: which day a week starts on, and
 * which open tasks a focus points at.
 */
import { addDays, weekday } from "@/lib/needt3/derive";
import type { V3Task } from "@/lib/needt3/map";

export interface WeekFocusItem {
  title: string;
  taskId: string | null;
}

export interface WeekFocus {
  weekStart: string;
  focuses: WeekFocusItem[];
}

/** The first day of the week that holds `day`, for a Monday or Sunday start. */
export function weekStartOf(day: string, startDay: string = "monday"): string {
  const back = startDay === "sunday" ? weekday(day) : (weekday(day) + 6) % 7;
  return addDays(day, -back);
}

/**
 * The week the Sunday review plans for: the one that starts on the first
 * week-start after the review's own day (Monday, or Sunday itself for a
 * Sunday start).
 */
export function nextWeekStart(
  today: string,
  startDay: string = "monday"
): string {
  return weekStartOf(addDays(today, 1), startDay);
}

const norm = (s: string) => s.trim().toLocaleLowerCase();
/** A title shorter than this only matches exactly, so "go" matches nothing by accident. */
const MIN_PARTIAL = 4;

/**
 * The open tasks the week's focuses point at, in the focuses' order: by task
 * id when the focus has one, else a task whose title is the focus (or holds it,
 * or is held by it, from four letters up). Each task once.
 */
export function focusTasks(
  focuses: readonly WeekFocusItem[],
  tasks: readonly V3Task[]
): V3Task[] {
  const open = tasks.filter((t) => !t.done && !t.trashedAt && !t.noSlot);
  const out: V3Task[] = [];
  const add = (t: V3Task | undefined) => {
    if (t && !out.includes(t)) out.push(t);
  };
  for (const f of focuses) {
    if (f.taskId) {
      const byId = open.find((t) => t.id === f.taskId);
      if (byId) {
        add(byId);
        continue;
      }
    }
    const want = norm(f.title);
    if (!want) continue;
    add(open.find((t) => norm(t.title) === want));
    if (want.length >= MIN_PARTIAL) {
      for (const t of open) {
        const have = norm(t.title);
        if (
          have.length >= MIN_PARTIAL &&
          (have.includes(want) || want.includes(have))
        )
          add(t);
      }
    }
  }
  return out;
}
