/**
 * The phone Home's rules (mobile-v2-plates.jsx `V2pHome`), pure. The day's
 * split is the desktop Home's (`splitHome`, on the one day rule of
 * `@/lib/needt3/task-day`: overdue = due before today) and the "Next up" pick is `nextUp` of
 * `@/lib/needt3/day`; what is here is how the phone reads them: which rows stay under the
 * plate, what the plate says, what the pull-down finds. Nothing reads the
 * clock: `today` is always an argument.
 */
import {
  type DaySections,
  type Move,
  type NextUp,
  clock,
  nextUp,
  parts,
  snapshot,
} from "@/lib/needt3/day";
import { addDays, dayLabel, moveDay } from "@/lib/needt3/derive";
import type { EnergyHours } from "@/lib/needt3/energy";
import type { V3Task } from "@/lib/needt3/map";
import { isOverdue } from "@/lib/needt3/task-day";
import {
  DEFAULT_TASK_VIEW,
  type TaskViewSettings,
  showsTask,
} from "@/lib/needt3/task-view";

import { dayOf, hourAt, splitHome } from "../../home/derive";
import { energyDay } from "../../home/energy-day";

export interface HomeView {
  sec: DaySections<V3Task>;
  /** The open tasks of a list. */
  open: (list: readonly V3Task[]) => V3Task[];
  /** Today's tasks that are closed. */
  doneToday: V3Task[];
  /** Today's tasks, closed ones included. */
  total: number;
  /** Today's tasks that are closed. */
  done: number;
  /** Open overdue tasks. */
  lateN: number;
  /** Every task of today is closed. */
  dayClosed: boolean;
  next: NextUp<V3Task>;
  /** Overdue rows (the plate's own task left out). */
  lateRows: V3Task[];
  /** Today's open rows by part of the day (the plate's own task left out). */
  parts: ReturnType<typeof parts<V3Task>>;
  inboxRows: V3Task[];
  tomorrowRows: V3Task[];
  /**
   * The day is closed, nothing is on the plate and no overdue or Inbox row is
   * listed: "All done for today".
   */
  allDone: boolean;
  /** Nothing at all to show: a clear day. */
  empty: boolean;
}

const openOf = (l: readonly V3Task[]) => l.filter((t) => !t.done);

/**
 * Today as the phone draws it. `skipped` = ids passed over with Skip; `busy` =
 * ids whose row is still leaving, which neither the plate nor the rows keep.
 */
export function homeView(
  tasks: readonly V3Task[],
  today: string,
  opts: {
    skipped?: readonly string[];
    busy?: Readonly<Record<string, unknown>>;
    /** The person's task view: sort, and which closed tasks are kept. */
    view?: TaskViewSettings;
    /** The day's highlight, drawn on its own card: out of the plate and rows. */
    lift?: string | null;
    /** Order the day's untimed tasks by weight for the hour (default order only). */
    energy?: { nowHour: number; hours: EnergyHours };
  } = {}
): HomeView {
  const lift = opts.lift ?? null;
  const busy = lift
    ? { ...(opts.busy ?? {}), [lift]: true }
    : (opts.busy ?? {});
  const live = tasks.filter((t) => !t.trashedAt);
  const view = opts.view ?? DEFAULT_TASK_VIEW;
  const split = splitHome(live, today, view);
  const tomorrow = addDays(today, 1);
  const sec: DaySections<V3Task> = {
    ...split,
    next: live.filter((t) => !t.noSlot && dayOf(t, today) === tomorrow),
  };
  const day =
    opts.energy && view.sort === "time"
      ? energyDay(sec.day, today, opts.energy.nowHour, opts.energy.hours)
      : sec.day;
  sec.day = day;
  // Only today's own closed tasks are "Done today": a task with no day that
  // was closed last month is not.
  const doneToday = day.filter((t) => t.done && showsTask(t, view, today));
  const left = openOf(day);
  const next = nextUp(sec, { skipped: opts.skipped, busy });
  const nu = next.nu;
  // the nearest task is on the plate, so not again in the rows
  const notNu = (l: readonly V3Task[]) =>
    openOf(l).filter((t) => (!nu || t.id !== nu.id) && t.id !== lift);
  const lateRows = notNu(sec.late);
  const inboxRows = notNu(sec.inbox);
  const tomorrowRows = openOf(sec.next);
  // "All done" is true only when no row is listed under today: no overdue, no
  // open Inbox task either (the Inbox section is drawn on Home).
  const openRest = openOf(sec.late).length + openOf(sec.inbox).length;
  const dayClosed = day.length > 0 && !left.length;
  return {
    sec,
    open: openOf,
    doneToday,
    total: day.length,
    done: doneToday.length,
    lateN: openOf(sec.late).length,
    dayClosed,
    next,
    lateRows,
    parts: parts(notNu(day), today),
    inboxRows,
    tomorrowRows,
    allDone: dayClosed && !nu && !openRest,
    empty:
      !day.length &&
      !openOf(sec.late).length &&
      !openOf(sec.inbox).length &&
      !tomorrowRows.length &&
      !doneToday.length,
  };
}

/** The line under the plate's title. `today` = the person's day. */
export function nextUpWhy(
  n: Pick<NextUp<V3Task>, "nu" | "after" | "lateOpen">,
  today: string
): string {
  const nu = n.nu;
  if (!nu) return "";
  if (n.lateOpen.includes(nu)) {
    // the due day when that is what passed, else the day it was placed on
    const since = nu.dueDate;
    const more = n.lateOpen.length - 1;
    return `Overdue${since ? ` since ${dayLabel(since)}` : ""}${more > 0 ? ` · +${more} overdue` : ""}`;
  }
  const at = hourAt(nu, today);
  const after = n.after ? hourAt(n.after, today) : null;
  if (
    after != null &&
    at != null &&
    nu.estimatedMinutes &&
    at + nu.estimatedMinutes / 60 <= after
  )
    return `Fits before ${clock(after)}`;
  // "Due today" only when it is; a task placed today and due later is "Today"
  return nu.dueDate === today ? "Due today" : "Today";
}

/**
 * Every open overdue task moved onto today (the desktop's "Move to today"),
 * with the words for the toast and what puts each back.
 */
export function moveLate(
  late: readonly V3Task[],
  today: string
): { label: string; moves: Move[] } | null {
  const list = late.filter((t) => !t.done);
  if (!list.length) return null;
  return {
    label: `${list.length} ${list.length === 1 ? "task" : "tasks"} moved to today`,
    moves: list.map((t) => ({
      id: t.id,
      patch: moveDay(t, today, today),
      before: snapshot(t),
    })),
  };
}

export interface TaskHit {
  id: string;
  title: string;
  done: boolean;
  meta: string;
  task: V3Task;
}

/**
 * The pull-down's search over tasks (`pkTaskPull`): titles that hold the
 * words, five at most, each with where it sits.
 */
export function taskHits(
  tasks: readonly V3Task[],
  query: string,
  today: string
): TaskHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return tasks
    .filter((t) => !t.trashedAt && t.title.toLowerCase().includes(q))
    .slice(0, 5)
    .map((t) => {
      const day = dayOf(t, today);
      const h = day ? hourAt(t, day) : null;
      const late = isOverdue(t, today);
      return {
        id: t.id,
        title: t.title,
        done: t.done,
        task: t,
        meta: [
          t.done ? "Done" : late ? "Overdue" : (dayLabel(day) ?? "Inbox"),
          h != null ? clock(h) : null,
        ]
          .filter(Boolean)
          .join(" · "),
      };
    });
}
