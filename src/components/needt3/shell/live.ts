/**
 * What the place tiles carry (prototype Sidebar.jsx sbLiveRead and the
 * Sidebar body): today's progress on Home, overdue on Tasks, unread on Mail,
 * the next event on Calendar. Pure; `now` is the person's local stamp
 * "YYYY-MM-DDTHH:mm" so nothing here reads a clock.
 */
import { minutesBetween } from "@/lib/needt3/derive";
import {
  overdueCount as countOverdue,
  todayTasks,
} from "@/lib/needt3/task-day";

interface TaskLike {
  done: boolean;
  noSlot: boolean;
  dueDate: string | null;
  scheduledStart?: string | null;
  trashedAt?: string | null;
}

/** Done / total of today's tasks (due or scheduled today); null when none. */
export function dayProgress(tasks: readonly TaskLike[], today: string) {
  const due = todayTasks(tasks, today);
  return due.length
    ? { done: due.filter((t) => t.done).length, total: due.length }
    : null;
}

/** Open tasks due before today (`task-day`, the one rule). */
export function overdueCount(tasks: readonly TaskLike[], today: string) {
  return countOverdue(tasks, today);
}

export function unreadCount(mail: readonly { isRead: boolean }[]) {
  return mail.filter((m) => !m.isRead).length;
}

interface EventLike {
  title: string;
  startAt: string;
  isAllDay: boolean;
}

/**
 * The calendar tile badge: the next timed event still to start today —
 * "Nm" under an hour, else its clock time — and, ten minutes out, the
 * urgent reason the tile breathes for.
 */
export function nextEventBadge(events: readonly EventLike[], now: string) {
  const today = now.slice(0, 10);
  let next: EventLike | null = null;
  for (const e of events) {
    if (e.isAllDay || e.startAt.slice(0, 10) !== today || e.startAt < now)
      continue;
    if (!next || e.startAt < next.startAt) next = e;
  }
  if (!next) return null;
  const mins = minutesBetween(now, next.startAt);
  return {
    text: mins < 60 ? `${mins}m` : next.startAt.slice(11, 16),
    mins,
    urgent:
      mins <= 10
        ? `“${next.title || "Event"}” starts in ${mins} min`
        : (null as string | null),
  };
}

/** An event this close (minutes) outranks every other tile badge. */
export const SOON_EVENT_MIN = 15;

export type BadgeTile = "calendar" | "tasks" | "today" | "mail";

/**
 * The one tile that wears a badge: three at once (0/13 on Home, 5m on
 * Calendar, 3 on Tasks) is noise, so only the most urgent shows. An event
 * within 15 minutes wins, then overdue tasks, then Home's progress on what is
 * due today, then unread mail, then a later event. Null: nothing to say.
 * `tiles` are the places on show as tiles.
 */
export function leadBadge(args: {
  tiles: readonly string[];
  eventMins: number | null;
  overdue: number;
  progress: { done: number; total: number } | null;
  unread: number;
}): BadgeTile | null {
  const on = (id: BadgeTile) => args.tiles.includes(id);
  const soon = args.eventMins != null && args.eventMins <= SOON_EVENT_MIN;
  if (soon && on("calendar")) return "calendar";
  if (args.overdue > 0 && on("tasks")) return "tasks";
  if (args.progress && args.progress.total > 0 && on("today")) return "today";
  if (args.unread > 0 && on("mail")) return "mail";
  if (args.eventMins != null && on("calendar")) return "calendar";
  return null;
}

/** The urgent wash restarts only for a new reason, not a ticking countdown. */
export function urgentIssue(urgent: string | null) {
  return urgent ? urgent.replace(/starts in \d+ min/, "starts soon") : "";
}
