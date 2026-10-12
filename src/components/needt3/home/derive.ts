/**
 * Home derivations ($P/HomeToday.jsx), pure so they are tested apart from the
 * screen. Every function takes `today` ("YYYY-MM-DD", the person's day) and,
 * where it matters, `nowHour` (decimal hour in their zone); nothing here
 * reads the clock.
 */
import {
  addDays,
  dayLabel,
  eventBlock,
  eventsInRange,
  hhmm,
  hourOf,
  weekday,
} from "@/lib/needt3/derive";
import type { V3Event, V3Task } from "@/lib/needt3/map";

/** HomeToday.jsx HD_CAP: a section shows this many rows, then "Show all N". */
export const HOME_CAP = 25;
/** A small overflow (up to this many) is shown in full. */
export const HOME_CAP_SLACK = 5;
/** The schedule rail shows a window of this many rows around now. */
export const SCHEDULE_CAP = 24;

/**
 * Pro as Home reads it from the plan's kind: true = known paid (trial
 * included), false = known Free, null = not known yet (loading or failed).
 */
export const proFromPlan = (kind: string | null | undefined) =>
  kind == null ? null : kind !== "free";

export const PARTS = ["Morning", "Afternoon", "Evening"] as const;
export type DayPart = (typeof PARTS)[number];

/** The day of a task's `scheduledStart` ("YYYY-MM-DD"), or null. The stamp is
 *  already local to the saved time zone (map.ts `isoToStamp`). */
const scheduledDay = (t: Pick<V3Task, "scheduledStart">) =>
  t.scheduledStart ? t.scheduledStart.slice(0, 10) : null;

/**
 * The day a task is placed on: the day of its `scheduledStart` when it has
 * one, else its due day (a due-only task sits in that day's list without an
 * hour). A task due today but scheduled tomorrow belongs to tomorrow.
 */
export function dayOf(t: Pick<V3Task, "dueDate" | "scheduledStart">) {
  return scheduledDay(t) ?? t.dueDate ?? null;
}

/**
 * The hour a task sits at (decimal), or null when it has no place in a day.
 * With `day`, only a `scheduledStart` on that day gives an hour.
 */
export const hourAt = (t: Pick<V3Task, "scheduledStart">, day?: string) =>
  day != null && scheduledDay(t) !== day ? null : hourOf(t.scheduledStart);

export function partOf(at: number | null): DayPart | null {
  return at == null
    ? null
    : at < 12
      ? "Morning"
      : at < 17
        ? "Afternoon"
        : "Evening";
}

/** "25 min", "2 h 30"; empty when there is no estimate. */
export function dur(min: number | null | undefined) {
  if (!min) return "";
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60}` : ""}`;
}

/** "0 h", "45 min", "2 h 30". Used by the week numbers. */
export function hours(min: number) {
  if (!min) return "0 h";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return (
    (h ? `${h} h` : "") + (m ? `${h ? " " : ""}${m}${h ? "" : " min"}` : "")
  );
}

const byHour = (a: V3Task, b: V3Task) => (hourAt(a) ?? 99) - (hourAt(b) ?? 99);

export interface HomeSplit {
  /** Open tasks from before today, oldest first. */
  late: V3Task[];
  /** Everything that belongs to today (open and done), by hour. */
  day: V3Task[];
  /** Open tasks with no day and no fixed time. */
  inbox: V3Task[];
}

/** Sorts live tasks into the three groups Home draws. `noSlot` tasks stay out. */
export function splitHome(tasks: readonly V3Task[], today: string): HomeSplit {
  const live = tasks.filter((t) => !t.trashedAt && !t.noSlot);
  const late = live
    .filter((t) => {
      const d = dayOf(t);
      return !t.done && !!d && d < today;
    })
    .sort(
      (a, b) => (dayOf(a) ?? "").localeCompare(dayOf(b) ?? "") || byHour(a, b)
    );
  const day = live.filter((t) => dayOf(t) === today).sort(byHour);
  const inbox = live.filter((t) => !t.done && !dayOf(t) && !t.isFixed);
  return { late, day, inbox };
}

export interface DayStats {
  total: number;
  done: number;
  left: number;
  /** Minutes of estimated work still open today. */
  mins: number;
}

export function dayStats(day: readonly V3Task[]): DayStats {
  const open = day.filter((t) => !t.done);
  return {
    total: day.length,
    done: day.length - open.length,
    left: open.length,
    mins: open.reduce((s, t) => s + (t.estimatedMinutes || 0), 0),
  };
}

export type DayState = "open" | "empty" | "closed";

/**
 * Empty: nothing due today and nothing overdue still open. Closed: today held
 * tasks and none is open (a row still playing its exit keeps the day open).
 */
export function dayState(
  day: readonly V3Task[],
  lateOpen: number,
  leaving: ReadonlySet<string> = new Set()
): DayState {
  const left = day.filter((t) => !t.done).length;
  const playing = day.some((t) => leaving.has(t.id));
  if (day.length > 0 && left === 0 && !playing) return "closed";
  if (day.length === 0 && lateOpen === 0) return "empty";
  return "open";
}

/** Day sections: Morning / Afternoon / Evening / Anytime today, empty ones dropped. */
export function sectionsOf(
  day: readonly V3Task[],
  visible: (t: V3Task) => boolean
): [string, V3Task[]][] {
  const out: [string, V3Task[]][] = PARTS.map((p) => [
    p,
    day.filter((t) => partOf(hourAt(t)) === p && visible(t)),
  ]);
  out.push([
    "Anytime today",
    day.filter((t) => hourAt(t) == null && visible(t)),
  ]);
  return out.filter(([, list]) => list.length > 0);
}

export interface NextUp {
  task: V3Task;
  /** The next timed open task after it, for the "fits before" line. */
  after: V3Task | null;
  /** Other overdue tasks behind it. */
  moreLate: number;
  canSkip: boolean;
}

/**
 * Next up: one task, so the next action never needs deciding. The earliest
 * thing still open — overdue first (oldest day, then hour), then today by
 * hour, untimed last. Skip only moves the pick.
 */
export function pickNextUp(
  lateOpen: readonly V3Task[],
  dayOpen: readonly V3Task[],
  skipped: readonly string[] = []
): NextUp | null {
  const cands = [...lateOpen, ...dayOpen];
  if (!cands.length) return null;
  const fresh = cands.filter((t) => !skipped.includes(t.id));
  const task = (fresh.length ? fresh : cands)[0];
  const isLate = lateOpen.some((t) => t.id === task.id);
  const at = hourAt(task);
  const after = isLate
    ? null
    : (dayOpen.find((t) => {
        const h = hourAt(t);
        return h != null && at != null && h > at;
      }) ?? null);
  return {
    task,
    after,
    moreLate: isLate ? lateOpen.length - 1 : 0,
    canSkip: cands.length > 1,
  };
}

/** Skip: remember the pick; once only one is left, start over. */
export function skipNext(
  skipped: readonly string[],
  pick: NextUp,
  freshCount: number
) {
  return freshCount <= 1 ? [] : [...skipped, pick.task.id];
}

/** The line under the Next up title: why this one, in the prototype's words. */
export function nextUpNote(pick: NextUp, nowHour: number, today: string) {
  const t = pick.task;
  const at = hourAt(t, today);
  const d = dur(t.estimatedMinutes);
  const day = dayOf(t);
  if (day && day < today) {
    const since = t.dueDate && t.dueDate < today ? t.dueDate : day;
    return `Overdue since ${dayLabel(since)} · the oldest thing still open, ${d || "no estimate"}${pick.moreLate ? ` · +${pick.moreLate} overdue` : ""}`;
  }
  if (at != null && at < nowHour) {
    return `Was planned for ${hhmm(at)} · still open, ${d || "no estimate"}`;
  }
  const start = Math.max(nowHour, at ?? nowHour);
  const end = start + (t.estimatedMinutes || 0) / 60;
  const afterAt = pick.after ? hourAt(pick.after, today) : null;
  // "Due today" only when it is; a task placed today and due later is "Today"
  const lead = t.dueDate === today ? "Due today" : "Today";
  if (afterAt != null && t.estimatedMinutes && end <= afterAt) {
    return `${lead} · ${d} fits before ${hhmm(afterAt)}`;
  }
  return `${lead}${t.estimatedMinutes ? ` · ${d} of work` : ""}`;
}

/* ---------- today's schedule ---------- */

export interface ScheduleItem {
  key: string;
  id: string | null;
  at: number;
  len: number;
  title: string;
  event: boolean;
  done: boolean;
  projectId: string | null;
}

/** Today's timed events and the tasks whose `scheduledStart` is today, by
 *  hour (events first at a tie). */
export function scheduleItems(
  tasks: readonly V3Task[],
  events: readonly V3Event[],
  today: string
): ScheduleItem[] {
  const evs = eventsInRange(events, today, addDays(today, 1))
    .map(eventBlock)
    .filter((b) => b.date === today && b.at != null)
    .map<ScheduleItem>((e) => ({
      key: `e${e.id}`,
      id: null,
      at: e.at as number,
      len: e.len || 30,
      title: e.title,
      event: true,
      done: false,
      projectId: null,
    }));
  const tks = tasks
    .filter((t) => hourAt(t, today) != null)
    .map<ScheduleItem>((t) => ({
      key: `t${t.id}`,
      id: t.id,
      at: hourAt(t, today) as number,
      len: t.estimatedMinutes || 30,
      title: t.title,
      event: false,
      done: t.done,
      projectId: t.projectId,
    }));
  return [...evs, ...tks].sort(
    (a, b) => a.at - b.at || (a.event === b.event ? 0 : a.event ? -1 : 1)
  );
}

/** Index of the first item after now, or -1 when the now line goes last. */
export const nowIndex = (items: readonly ScheduleItem[], nowHour: number) =>
  items.findIndex((x) => x.at > nowHour);

/** A packed day shows a window of rows around the now line, not all of them. */
export function scheduleWindow<T>(
  rows: readonly T[],
  nowAt: number,
  all: boolean
) {
  if (all || rows.length <= SCHEDULE_CAP + 4) return rows.slice();
  const from = Math.max(0, Math.min(nowAt - 6, rows.length - SCHEDULE_CAP));
  return rows.slice(from, from + SCHEDULE_CAP);
}

/** A capped section: how many rows to draw (HdCapped). */
export function cappedCount(total: number, expanded: boolean, cap = HOME_CAP) {
  const over = total > cap + HOME_CAP_SLACK;
  return { over, shown: over && !expanded ? cap : total };
}

/* ---------- week ahead ---------- */

export interface Capacity {
  /** Working minutes in a working day. */
  min: number;
  weekends: boolean;
  start: string;
  end: string;
}

const hm = (s: string) => {
  const [h, m] = String(s || "").split(":");
  return (+h || 0) + (+m || 0) / 60;
};

/**
 * Working time per day from Settings (`start`, `end`, `weekends`; default
 * 09:00–18:00, no weekends). //todo: the work schedule has no home in
 * `UserSettings` yet (01-data-map §14), so prefs are read when present.
 */
export function capacityFrom(
  prefs: Record<string, unknown> | undefined
): Capacity {
  const str = (v: unknown, d: string) =>
    typeof v === "string" && /^\d{1,2}:\d{2}$/.test(v) ? v : d;
  const start = str(prefs?.start, "09:00");
  const end = str(prefs?.end, "18:00");
  return {
    min: Math.round(Math.max(0, hm(end) - hm(start)) * 60),
    weekends: prefs?.weekends === true,
    start,
    end,
  };
}

export interface WeekDay {
  /** "YYYY-MM-DD" */
  date: string;
  /** Day of month. */
  d: number;
  short: string;
  title: string;
  sub: string;
  tasks: V3Task[];
  events: ReturnType<typeof eventBlock<V3Event>>[];
  planned: number;
  cap: number;
}

const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** The seven days after today, with what each holds against its capacity. */
export function weekAhead(
  tasks: readonly V3Task[],
  events: readonly V3Event[],
  today: string,
  cap: Capacity
): WeekDay[] {
  const live = tasks.filter((t) => !t.trashedAt && !t.noSlot);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i + 1);
    const dow = weekday(date);
    const list = live.filter((t) => dayOf(t) === date).sort(byHour);
    const evs = eventsInRange(events, date, addDays(date, 1))
      .map(eventBlock)
      .filter((b) => b.date === date && b.at != null)
      .sort((a, b) => (a.at as number) - (b.at as number));
    const planned =
      list
        .filter((t) => !t.done)
        .reduce((s, t) => s + (t.estimatedMinutes || 0), 0) +
      evs.reduce((s, e) => s + (e.len || 0), 0);
    const weekend = dow === 0 || dow === 6;
    const label = dayLabel(date) ?? date;
    return {
      date,
      d: +date.slice(8, 10),
      short: SHORT[dow],
      title: `${i === 0 ? "Tomorrow" : LONG[dow]}, ${label}`,
      sub: LONG[dow],
      tasks: list,
      events: evs,
      planned,
      cap: weekend && !cap.weekends ? 0 : cap.min,
    };
  });
}

export interface WeekTotals {
  tasks: number;
  done: number;
  planned: number;
  cap: number;
}

export function weekTotals(days: readonly WeekDay[]): WeekTotals {
  const tasks = days.reduce((s, d) => s + d.tasks.length, 0);
  const done = days.reduce(
    (s, d) => s + d.tasks.filter((t) => t.done).length,
    0
  );
  return {
    tasks,
    done,
    planned: days.reduce((s, d) => s + d.planned, 0),
    cap: days.reduce((s, d) => s + d.cap, 0),
  };
}
