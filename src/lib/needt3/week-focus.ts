/**
 * The week's focuses (Sunday review), pure: which day a week starts on, and
 * which open tasks a focus points at.
 */
import { addDays, weekday } from "@/lib/needt3/derive";
import type { V3Task } from "@/lib/needt3/map";

/** A focus: a task or a project (by id), with its name when it was picked. */
export interface WeekFocusItem {
  title: string;
  taskId?: string | null;
  projectId?: string | null;
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

/** Open tasks a project focus offers as highlight candidates. */
const PER_PROJECT = 2;

/**
 * The open tasks the week's focuses point at, in the focuses' order: a task
 * focus is that task (when still open), a project focus is the project's most
 * pressing open tasks (earliest due first). By id only: a focus with no
 * reference (an old title-only entry) points at nothing.
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
    if (f.taskId) add(open.find((t) => t.id === f.taskId));
    else if (f.projectId) {
      open
        .filter((t) => t.projectId === f.projectId)
        .sort((a, b) =>
          (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999")
        )
        .slice(0, PER_PROJECT)
        .forEach(add);
    }
  }
  return out;
}
