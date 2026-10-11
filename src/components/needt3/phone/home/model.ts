/**
 * The phone Home's rules (mobile-v2-plates.jsx `V2pHome`), pure. The day's
 * split and the "Next up" pick are `@/lib/needt3/day` (`sections`, `nextUp`);
 * what is here is how the phone reads them: which rows stay under the
 * plate, what the plate says, what the pull-down finds. Nothing reads the
 * clock: `today` is always an argument.
 */
import {
  type DaySections,
  type NextUp,
  clock,
  isLate,
  nextUp,
  parts,
  sections,
} from "@/lib/needt3/day";
import { dueLabel, at as hourAt } from "@/lib/needt3/derive";
import type { V3Task } from "@/lib/needt3/map";

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
  /** The day is closed and nothing is on the plate: "All done for today". */
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
  } = {}
): HomeView {
  const busy = opts.busy ?? {};
  const live = tasks.filter((t) => !t.trashedAt);
  const sec = sections(live, today);
  const day = sec.day;
  // Only today's own closed tasks are "Done today": a task with no day that
  // was closed last month is not.
  const doneToday = day.filter((t) => t.done);
  const left = openOf(day);
  const next = nextUp(sec, { skipped: opts.skipped, busy });
  const nu = next.nu;
  // the nearest task is on the plate, so not again in the rows
  const notNu = (l: readonly V3Task[]) =>
    openOf(l).filter((t) => !nu || t.id !== nu.id);
  const lateRows = notNu(sec.late);
  const inboxRows = notNu(sec.inbox);
  const tomorrowRows = openOf(sec.next);
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
    parts: parts(notNu(day)),
    inboxRows,
    tomorrowRows,
    allDone: dayClosed && !nu,
    empty:
      !day.length &&
      !openOf(sec.late).length &&
      !openOf(sec.inbox).length &&
      !tomorrowRows.length &&
      !doneToday.length,
  };
}

/** The line under the plate's title. */
export function nextUpWhy(
  n: Pick<NextUp<V3Task>, "nu" | "after" | "lateOpen">
): string {
  const nu = n.nu;
  if (!nu) return "";
  if (n.lateOpen.includes(nu)) {
    const since = dueLabel(nu);
    const more = n.lateOpen.length - 1;
    return `Overdue${since ? ` since ${since}` : ""}${more > 0 ? ` · +${more} overdue` : ""}`;
  }
  const at = hourAt(nu);
  const after = n.after ? hourAt(n.after) : null;
  if (
    after != null &&
    at != null &&
    nu.estimatedMinutes &&
    at + nu.estimatedMinutes / 60 <= after
  )
    return `Fits before ${clock(after)}`;
  return "Due today";
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
      const h = hourAt(t);
      const late = isLate(t, today);
      return {
        id: t.id,
        title: t.title,
        done: t.done,
        task: t,
        meta: [
          t.done ? "Done" : late ? "Overdue" : (dueLabel(t) ?? "Inbox"),
          h != null ? clock(h) : null,
        ]
          .filter(Boolean)
          .join(" · "),
      };
    });
}
