import {
  type ProjectLike,
  cvDur,
  dueLabel,
  eventMinutes,
  hhmm,
  hourOf,
  project,
} from "@/lib/needt3/derive";
import type { V3Task } from "@/lib/needt3/map";

/**
 * A calendar event drawn by the same block / agenda look as a task
 * (task.jsx: "Calendar events go through the same block/agenda look").
 * Events wear grey, carry no project, and open nothing.
 */
export interface TaskEvent {
  kind: "event";
  id: string;
  title: string;
  /** "YYYY-MM-DDTHH:mm", local. */
  startAt: string;
  endAt: string;
  isAllDay?: boolean;
  /** The calendar's name, shown on the agenda chip. */
  calendarName?: string;
}

/**
 * The parts a task carries. `V3Task.parts` arrives with the parts/waits API
 * (card T06b); until then the field is absent and no ring is drawn.
 */
type WithParts = {
  parts?: readonly { done: boolean }[] | null;
};

/** What `<Task>` draws: a v3 task, or a calendar event. */
export type TaskEntry = (V3Task & WithParts) | TaskEvent;

export const isTaskEvent = (t: TaskEntry): t is TaskEvent =>
  (t as TaskEvent).kind === "event";

/**
 * THE MAPPING ($P/task.jsx `taskView`). Pure: an entry in, plain labels out.
 * `today` ("YYYY-MM-DD", the person's day) decides overdue: an open task
 * whose due day is before today.
 */
export function taskView(
  task: TaskEntry,
  projects: readonly ProjectLike[] = [],
  today: string | null = null
) {
  const event = isTaskEvent(task);
  const start = event ? task.startAt : task.scheduledStart;
  const at = event && task.isAllDay ? null : hourOf(start);
  const minutes = event
    ? task.isAllDay
      ? null
      : eventMinutes(task) || null
    : task.estimatedMinutes;
  const len = minutes || 30;
  const p = event ? null : project(task.projectId, projects);
  const parts = event ? null : task.parts;
  const partsDone = parts?.filter((part) => part.done).length ?? 0;
  const done = event ? false : task.done;
  const due = event ? null : dueLabel(task);
  const overdue =
    !event && !done && !!today && !!task.dueDate && task.dueDate < today;
  return {
    id: task.id,
    title: task.title || "",
    done,
    event,
    calendarName: event ? (task.calendarName ?? "Calendar") : null,
    at,
    time: hhmm(at),
    len,
    minutes,
    range: at == null ? null : `${hhmm(at)}–${hhmm(at + len / 60)}`,
    dur: minutes
      ? minutes < 60
        ? `${minutes} min`
        : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60}` : ""}`
      : "",
    durLong: cvDur(len),
    due,
    overdue,
    lateTitle: due ? `Overdue — was due ${due}` : undefined,
    projectName: p?.name ?? null,
    /** The project's colour, or null — each layout picks its own neutral. */
    hue: p?.color ?? null,
    parts: parts?.length
      ? { done: partsDone, total: parts.length, open: parts.length - partsDone }
      : null,
    value: event ? null : task.value || null,
    entry: event ? null : task.entry || null,
    source: event ? null : task.source,
  };
}

export type TaskView = ReturnType<typeof taskView>;
