/* What a drop means for a task — pure, so the jest suite pins it.
 *
 * App.jsx's drop handler, in the prototype's words ($P/App.jsx 350–440,
 * SCREENS.md "Calendar"): a timeline slot places the task at that day and the
 * snapped time and fixes it there; a day keeps the task's time and moves its
 * day; a sidebar project moves it into the project. Each returns the patch to
 * write and the line the toast says, or null when the drop changes nothing.
 */
import { dayLabel, hhmm, hourOf, moveDay, placeAt } from "@/lib/needt3/derive";
import type { V3Task, V3TaskPatch } from "@/lib/needt3/map";

export type DropKind = "timeline" | "day" | "project" | "row" | "focus";

export interface TaskDrop {
  kind: DropKind;
  /** "YYYY-MM-DD" for timeline and day targets. */
  date?: string | null;
  /** Decimal hour (timeline). */
  time?: number | null;
  /** Project / row id. */
  id?: string | null;
  label?: string | null;
}

export interface DropResult {
  patch: V3TaskPatch;
  message: string;
}

type DropTask = Pick<
  V3Task,
  | "dueDate"
  | "scheduledStart"
  | "scheduledEnd"
  | "estimatedMinutes"
  | "projectId"
  | "isFixed"
  | "noSlot"
>;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function dropPatch(
  t: DropTask,
  over: TaskDrop,
  today: string
): DropResult | null {
  if (over.kind === "timeline") {
    if (!over.date || !ISO_DAY.test(over.date) || over.time == null)
      return null;
    const hour = Math.max(0, Math.min(23.75, over.time));
    const sameDay = t.scheduledStart?.slice(0, 10) === over.date;
    if (sameDay && hourOf(t.scheduledStart) === hour && !t.noSlot) return null;
    const p = placeAt(t, over.date, hour, today);
    return {
      patch: {
        dueDate: p.dueDate,
        scheduledStart: p.scheduledStart,
        scheduledEnd: p.scheduledEnd,
        isFixed: true,
        noSlot: false,
      },
      message: `Placed at ${hhmm(hour)} · ${dayLabel(over.date)}`,
    };
  }
  if (over.kind === "day") {
    if (!over.date || !ISO_DAY.test(over.date)) return null;
    const current = t.scheduledStart?.slice(0, 10) ?? t.dueDate;
    if (current === over.date) return null;
    const p = moveDay(t, over.date, today);
    const patch: V3TaskPatch = { dueDate: p.dueDate };
    if (p.scheduledStart) {
      patch.scheduledStart = p.scheduledStart;
      patch.scheduledEnd = p.scheduledEnd ?? null;
      // the person chose this day for a timed task: the scheduler keeps it
      patch.isFixed = true;
    }
    const at = hourOf(t.scheduledStart);
    return {
      patch,
      message: `Moved to ${dayLabel(over.date)}${at != null ? ` · ${hhmm(at)}` : ""}`,
    };
  }
  if (over.kind === "project") {
    if (!over.id || over.id === t.projectId) return null;
    return {
      patch: { projectId: over.id },
      message: `Moved to ${over.label || "the project"}`,
    };
  }
  //todo: "row" (reorder inside a list) and "focus" (start a session) belong to
  // the shell-level drag host (S2) — the calendar's host ignores them.
  return null;
}
