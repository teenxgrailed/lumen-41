/* Tasks and events → what the calendar draws ($P/calendar2.jsx 654–671).
 *
 * Pure. A placed task becomes a timed block on the day of its
 * `scheduledStart`; a task due on a day without an hour (or marked "no slot")
 * and an all-day event become the Agenda's all-day rows. Trashed tasks live
 * on Trash only, overdue ones in Home's overdue list; Hide done takes closed
 * tasks out (events are never hidden).
 */
import {
  type ProjectLike,
  addDays,
  hourOf,
  minutesBetween,
  project,
} from "@/lib/needt3/derive";
import type { V3Event, V3Task } from "@/lib/needt3/map";

import type { TaskEntry } from "../task/view";
import type { CalBlock } from "./layout";

/** A block plus what `<Task>` needs to draw it. */
export type CalItem = CalBlock & { entry: TaskEntry };
export type CalTimed = CalItem & { at: number };

export const SOURCE_NAME: Record<V3Event["source"], string> = {
  needt: "Your events",
  google: "Google Calendar",
  apple: "Apple Calendar",
  outlook: "Outlook Calendar",
};

export interface CalendarInput {
  tasks: readonly V3Task[];
  events: readonly V3Event[];
  projects?: readonly ProjectLike[];
  /** calendarId → the calendar's name. */
  calendarNames?: ReadonlyMap<string, string>;
  /** Ids of the person's own calendars (GET /api/feeds). An event is the
   *  person's own only on one of these — workspace busy blocks
   *  (feedId "workspace-busy") are not. */
  ownCalendarIds?: ReadonlySet<string>;
  /** "YYYY-MM-DD", the person's day. */
  today: string;
  hideDone: boolean;
}

const isOverdue = (t: V3Task, today: string) =>
  !t.done && !!t.dueDate && t.dueDate < today;

function taskItem(
  t: V3Task,
  date: string,
  at: number | null,
  projects: readonly ProjectLike[]
): CalItem {
  return {
    id: t.id,
    date,
    at,
    len: t.estimatedMinutes || (at == null ? 0 : 30),
    title: t.title,
    done: t.done,
    project: project(t.projectId, projects)?.name ?? null,
    entry: t,
  };
}

/** Name for a Needt-sourced event that is not on one of the person's
 *  calendars: a teammate's busy block. */
const BUSY_NAME = "Workspace";

/**
 * Whether the calendar may retitle, move, resize or delete this block: only
 * the person's own local, non-recurring event, and any task.
 * //todo: synced provider events stay read-only until PATCH writes back to
 * Google / Outlook / CalDAV.
 * //todo: recurring events stay read-only until occurrences are expanded and
 * an edit can say "this one or the series".
 */
export const canEditEvent = (b: Pick<CalItem, "event" | "own" | "recurring">) =>
  !b.event || (!!b.own && !b.recurring);

function eventItem(
  e: V3Event,
  date: string,
  at: number | null,
  len: number,
  calendarName: string,
  own: boolean
): CalItem {
  return {
    id: e.id,
    date,
    at,
    len,
    title: e.title,
    event: true,
    own,
    recurring: !!e.isRecurring,
    entry: {
      kind: "event",
      id: e.id,
      title: e.title,
      startAt: e.startAt,
      endAt: e.endAt,
      isAllDay: e.isAllDay,
      calendarName,
    },
  };
}

export function calendarItems({
  tasks,
  events,
  projects = [],
  calendarNames,
  ownCalendarIds,
  today,
  hideDone,
}: CalendarInput) {
  const live = tasks.filter((t) => !t.trashedAt && !isOverdue(t, today));
  const shown = hideDone ? live.filter((t) => !t.done) : live;
  const timed: CalTimed[] = [];
  const loose: CalItem[] = [];

  shown.forEach((t) => {
    const at = hourOf(t.scheduledStart);
    if (t.scheduledStart && at != null && !t.noSlot) {
      timed.push(
        taskItem(t, t.scheduledStart.slice(0, 10), at, projects) as CalTimed
      );
    } else if (t.dueDate) {
      loose.push(taskItem(t, t.dueDate, null, projects));
    }
  });

  events.forEach((e) => {
    if (!e.startAt) return;
    const own = e.source === "needt" && !!ownCalendarIds?.has(e.calendarId);
    const name =
      calendarNames?.get(e.calendarId) ??
      (e.source === "needt" && !own ? BUSY_NAME : SOURCE_NAME[e.source]) ??
      "Calendar";
    const day = e.startAt.slice(0, 10);
    if (e.isAllDay) {
      // one all-day row on every day it covers (end exclusive)
      const last = e.endAt ? e.endAt.slice(0, 10) : addDays(day, 1);
      for (let d = day, i = 0; d < last && i < 62; d = addDays(d, 1), i++)
        loose.push(eventItem(e, d, null, 0, name, own));
      if (last <= day) loose.push(eventItem(e, day, null, 0, name, own));
      return;
    }
    const at = hourOf(e.startAt) ?? 0;
    const minutes = e.endAt ? minutesBetween(e.startAt, e.endAt) : 30;
    // a timed event past midnight is drawn on its first day, to the day's end
    const len = Math.max(15, Math.min(minutes, (24 - at) * 60));
    timed.push(eventItem(e, day, at, len, name, own) as CalTimed);
  });

  const doneHidden = hideDone
    ? live.filter((t) => t.done && (t.scheduledStart || t.dueDate)).length
    : 0;
  return { timed, loose, doneHidden };
}

/** Title for the Hide done toggle (prototype wording). */
export function hideDoneTitle(hideDone: boolean, doneN: number) {
  if (!hideDone) return "Hide completed tasks";
  if (!doneN) return "Done tasks are hidden — click to show";
  return `${doneN} ${doneN === 1 ? "done task hidden" : "done tasks hidden"} — click to show`;
}
