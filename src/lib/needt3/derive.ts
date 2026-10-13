/* DERIVE — the prototype's pure helpers (docs/port/prototype/Data.js), typed.
 *
 * Data.js read "today" from one global; here every helper that needs it takes
 * `today` ("YYYY-MM-DD") as an argument, so a screen passes the person's own
 * day and a test pins the prototype's fixed week (Tue 1 Sep 2026, the week of
 * 31 Aug – 6 Sep). Days are "YYYY-MM-DD", stamps local "YYYY-MM-DDTHH:mm";
 * day arithmetic runs in UTC on those strings, so no zone or DST can move a
 * day. Nothing here reads the clock or touches the network.
 */
import { newDate } from "@/lib/date-utils";

export const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;
const DOW_LONG = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;
const DAY_MS = 86_400_000;

const pad2 = (n: number) => String(n).padStart(2, "0");

/* ---------- days ---------- */

function dayParts(s: string | null | undefined) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? "");
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
}
function utcMs(day: string) {
  const p = dayParts(day);
  return p ? Date.UTC(p.y, p.m - 1, p.d) : NaN;
}
function dayFromMs(ms: number) {
  const d = newDate(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** "YYYY-MM-DD" + n days. */
export function addDays(day: string, n: number) {
  return dayFromMs(utcMs(day) + n * DAY_MS);
}
/** 0 = Sunday … 6 = Saturday. */
export function weekday(day: string) {
  return newDate(utcMs(day)).getUTCDay();
}
/** Whole days from `a` to `b` (b − a). */
export function daysBetween(a: string, b: string) {
  return Math.round((utcMs(b) - utcMs(a)) / DAY_MS);
}

/**
 * Anything a person or an old record calls a day → "YYYY-MM-DD", or null:
 * an ISO string, "Today", "Tomorrow", "Fri", "This weekend", "Next week",
 * "in 3 days", "4 Sep".
 */
export function toDate(v: unknown, today: string): string | null {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const w = s.toLowerCase().replace(/^by\s+/, "");
  const dow = weekday(today);
  if (w === "today" || w === "tonight") return today;
  if (w === "tomorrow" || w === "tom") return addDays(today, 1);
  if (w === "this weekend") return addDays(today, (6 - dow + 7) % 7);
  if (w === "next week") return addDays(today, (1 - dow + 7) % 7 || 7);
  const inN = /^in (\d+) days?$/.exec(w);
  if (inN) return addDays(today, +inN[1]);
  const dm = /^(\d{1,2})\s+([a-z]{3})/.exec(w);
  if (dm) {
    const mi = MONTHS.findIndex((m) => m.toLowerCase() === dm[2]);
    if (mi > -1) return `${today.slice(0, 4)}-${pad2(mi + 1)}-${pad2(+dm[1])}`;
  }
  const di = DOW_LONG.findIndex((d) => w.length >= 3 && d.startsWith(w));
  if (di > -1) return addDays(today, (di - dow + 7) % 7);
  return null;
}

/** "2026-09-04" → "4 Sep". */
export function dayLabel(day: string | null | undefined) {
  const p = dayParts(day);
  return p ? `${p.d} ${MONTHS[p.m - 1]}` : null;
}
export function dueLabel(t: { dueDate?: string | null } | null | undefined) {
  return t?.dueDate ? dayLabel(t.dueDate) : null;
}
/** Day of the month the task is due on, or null. */
export function dueDay(t: { dueDate?: string | null } | null | undefined) {
  const p = dayParts(t?.dueDate);
  return p ? p.d : null;
}

/* ---------- hours and stamps ---------- */

/** Decimal hour → "HH:mm". */
export function hhmm(h: number | null | undefined) {
  if (h == null) return null;
  const m = Math.round(h * 60);
  return `${pad2(Math.floor(m / 60) % 24)}:${pad2(m % 60)}`;
}
export function stamp(day: string | null | undefined, hour: number | null) {
  return day && hour != null ? `${day}T${hhmm(hour)}` : null;
}
/** Decimal hour of a stamp, or null. */
export function hourOf(s: string | null | undefined) {
  const m = /T(\d{2}):(\d{2})/.exec(s ?? "");
  return m ? +m[1] + +m[2] / 60 : null;
}
/** A stamp moved by `min` minutes, carrying across days. */
export function addMinutes(s: string | null | undefined, min: number) {
  const h = hourOf(s);
  if (!s || h == null || !dayParts(s)) return null;
  const total = Math.round(h * 60) + (min || 0);
  const carry = Math.floor(total / 1440);
  const rest = total - carry * 1440;
  return `${addDays(s.slice(0, 10), carry)}T${pad2(Math.floor(rest / 60))}:${pad2(rest % 60)}`;
}
/** Minutes from stamp `a` to stamp `b`. */
export function minutesBetween(a: string, b: string) {
  if (!dayParts(a) || !dayParts(b)) return 0;
  return Math.round(
    daysBetween(a.slice(0, 10), b.slice(0, 10)) * 1440 +
      ((hourOf(b) ?? 0) - (hourOf(a) ?? 0)) * 60
  );
}

/* ---------- tasks: time ---------- */

interface Timed {
  dueDate?: string | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  estimatedMinutes?: number | null;
}

/** The hour a task sits at (decimal), or null when it has no place in a day. */
export function at(t: Timed | null | undefined) {
  return t ? hourOf(t.scheduledStart) : null;
}
export function timeLabel(t: Timed | null | undefined) {
  return t?.scheduledStart ? t.scheduledStart.slice(11, 16) : null;
}
/** scheduledEnd is always start + estimatedMinutes; recomputed, never typed. */
export function endOf(t: Timed) {
  return t.scheduledStart
    ? addMinutes(t.scheduledStart, t.estimatedMinutes || 30)
    : null;
}
export function sync<T extends Timed>(t: T): T {
  const end = endOf(t);
  return (t.scheduledEnd ?? null) === end ? t : { ...t, scheduledEnd: end };
}
/** A patch that puts the task on another day, keeping its hour. */
export function moveDay(t: Timed | null, day: unknown, today: string) {
  const d = toDate(day, today);
  const p: {
    dueDate: string | null;
    scheduledStart?: string;
    scheduledEnd?: string | null;
  } = { dueDate: d };
  if (t?.scheduledStart && d) {
    p.scheduledStart = d + t.scheduledStart.slice(10);
    p.scheduledEnd = addMinutes(p.scheduledStart, t.estimatedMinutes || 30);
  }
  return p;
}
/** A patch that places the task at an hour on a day (the person's choice). */
export function placeAt(
  t: Timed | null,
  day: unknown,
  hour: number,
  today: string
) {
  const d = toDate(day, today) || t?.dueDate || today;
  const start = stamp(d, hour);
  return {
    dueDate: d,
    scheduledStart: start,
    scheduledEnd: addMinutes(start, t?.estimatedMinutes || 30),
    isFixed: true as const,
  };
}
/** Monday of the week `n` weeks from today's. */
export function shiftWeek(today: string, n: number) {
  return addDays(today, -((weekday(today) + 6) % 7) + n * 7);
}

/* ---------- tasks: notes ---------- */

/**
 * A task's notes as plain text (newlines kept), from either the desktop's
 * sanitised HTML or plain text. Empty → null. Data.js `notesText`.
 */
export function notesText(v: unknown): string | null {
  if (v == null || v === "") return null;
  let s = String(v);
  if (/<[a-z][\s\S]*>/i.test(s)) {
    s = s
      .replace(/\r?\n/g, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<\/(p|div|li|h[1-6]|blockquote|pre)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&");
    s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  }
  s = s.replace(/^\s+|\s+$/g, "");
  return s || null;
}

/* ---------- tasks: state ---------- */

export interface PartLike {
  id?: string;
  title: string;
  done: boolean;
}
interface Closable {
  id: string | number;
  done: boolean;
  TaskPart?: PartLike[] | null;
  trashedAt?: string | null;
}

export function closeParts<P extends PartLike>(parts: P[] | null | undefined) {
  return (parts ?? []).map((p) => (p.done ? p : { ...p, done: true }));
}
/** The patch that sets a task done (default) or not done. */
export function completeTask(t: Closable | null, done = true) {
  if (!done) return { done: false };
  const parts = t?.TaskPart;
  return parts && parts.some((p) => !p.done)
    ? { done: true, TaskPart: closeParts(parts) }
    : { done: true };
}
/**
 * One task with a patch applied and the cascade run: closing a task closes
 * its open parts; the last open part closing closes the task (only on that
 * transition). Reopening reopens the task only.
 */
export function patchTask<T extends Closable>(t: T, patch: Partial<T>): T {
  const next = { ...t, ...patch };
  if (patch.done === true && !t.done && next.TaskPart?.some((p) => !p.done)) {
    next.TaskPart = closeParts(next.TaskPart);
  }
  if ("TaskPart" in patch && !("done" in patch) && !next.done) {
    const before = (t.TaskPart ?? []).some((p) => !p.done);
    const after =
      (next.TaskPart ?? []).length > 0 &&
      (next.TaskPart ?? []).every((p) => p.done);
    if (before && after) next.done = true;
  }
  return next;
}
export function applyTaskPatch<T extends Closable>(
  list: readonly T[],
  id: string | number,
  patch: Partial<T>
) {
  return list.map((t) =>
    String(t.id) === String(id) ? patchTask(t, patch) : t
  );
}
export function toggleTask<T extends Closable>(
  list: readonly T[],
  id: string | number
) {
  return list.map((t) =>
    String(t.id) === String(id)
      ? patchTask(t, completeTask(t, !t.done) as Partial<T>)
      : t
  );
}

export const isTrashed = (t: { trashedAt?: string | null } | null) =>
  !!t?.trashedAt;
export function liveTasks<T extends { trashedAt?: string | null }>(
  list: readonly T[]
) {
  return list.filter((t) => !t.trashedAt);
}
export function trashedTasks<T extends { trashedAt?: string | null }>(
  list: readonly T[]
) {
  return list.filter((t) => !!t.trashedAt);
}

/* ---------- tasks: the chain ---------- */

interface Chained {
  id: string | number;
  done: boolean;
  blockedBy?: string | number | null;
  TaskWait?: { personId: string; reason: string } | null;
}

/** What a task is waiting on: an open task, or a person with a reason. */
export function blockerOf<T extends Chained>(t: T, list: readonly T[]) {
  if (t.blockedBy != null) {
    const by = list.find((x) => String(x.id) === String(t.blockedBy));
    if (by && !by.done) return { kind: "task" as const, task: by };
  }
  if (t.TaskWait)
    return {
      kind: "person" as const,
      on: t.TaskWait.personId,
      for: t.TaskWait.reason,
    };
  return null;
}
/** How many open tasks `t` holds up, counted through the chain. */
export function unblocks<T extends Chained>(t: T, list: readonly T[]) {
  const open = list.filter((x) => !x.done);
  const seen = new Set<string>();
  let front = [String(t.id)];
  let n = 0;
  while (front.length) {
    const next: string[] = [];
    for (const x of open) {
      const id = String(x.id);
      if (seen.has(id) || x.blockedBy == null) continue;
      if (!front.includes(String(x.blockedBy))) continue;
      seen.add(id);
      next.push(id);
      n += 1;
    }
    front = next;
  }
  return n;
}
/** Who is blocking how many open tasks. */
export function blocking<T extends Chained>(list: readonly T[]) {
  const out: Record<string, number> = {};
  for (const t of list) {
    if (!t.done && t.TaskWait)
      out[t.TaskWait.personId] = (out[t.TaskWait.personId] ?? 0) + 1;
  }
  return out;
}

/** Closed days in a row up to yesterday; today is still open. */
export function streak(closedDays: readonly (0 | 1)[]) {
  let n = 0;
  for (let i = closedDays.length - 2; i >= 0 && closedDays[i]; i--) n++;
  return n;
}

/* ---------- projects ---------- */

export interface ProjectLike {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
}

/** id, name or alias → the project, or null. Never a fallback project. */
export function project<P extends ProjectLike>(
  ref: string | null | undefined,
  projects: readonly P[],
  aliases: Readonly<Record<string, string>> = {}
) {
  if (!ref) return null;
  return (
    projects.find((p) => p.id === ref) ??
    projects.find((p) => p.name === ref) ??
    projects.find((p) => p.id === aliases[ref]) ??
    null
  );
}

export const NEUTRAL_MARK = {
  color: "var(--text-tertiary)",
  icon: "list-checks",
} as const;

/** The mark a block wears: its project's colour and icon, else the neutral. */
export function cvProject(
  ref: string | null | undefined,
  projects: readonly ProjectLike[],
  aliases: Readonly<Record<string, string>> = {}
) {
  const p = project(ref, projects, aliases);
  return p
    ? {
        color: p.color ?? NEUTRAL_MARK.color,
        icon: p.icon ?? NEUTRAL_MARK.icon,
      }
    : { ...NEUTRAL_MARK };
}
/** 95 → "1 h 35 min", 60 → "1 h", 0 → "0 min". */
export function cvDur(min: number) {
  if (!min) return "0 min";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}

/* ---------- habits ---------- */

export interface Checkin {
  habitId: string;
  date: string;
  done: boolean;
}

/** The last n days ending `end` (default 14), oldest first, as 1 / 0. */
export function habitDays(
  habitId: string,
  checkins: readonly Checkin[],
  end: string,
  n = 14
): (0 | 1)[] {
  const on = new Set(
    checkins.filter((c) => c.habitId === habitId && c.done).map((c) => c.date)
  );
  const out: (0 | 1)[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(on.has(addDays(end, -i)) ? 1 : 0);
  return out;
}
export function habitDoneOn(
  habitId: string,
  date: string,
  checkins: readonly Checkin[]
) {
  return checkins.some(
    (c) => c.habitId === habitId && c.date === date && c.done
  );
}
export function habitKept(
  habitId: string,
  checkins: readonly Checkin[],
  today: string,
  n = 14
) {
  return habitDays(habitId, checkins, today, n).reduce<number>(
    (s, d) => s + d,
    0
  );
}
/**
 * Days kept in a row, ending today when today is kept, else yesterday —
 * today is still open, so a not-yet-kept today does not break it.
 */
export function habitStreak(
  habitId: string,
  checkins: readonly Checkin[],
  today: string
) {
  const days = habitDays(habitId, checkins, today, 400);
  let i = days.length - 1;
  let n = 0;
  if (!days[i]) i--;
  for (; i >= 0 && days[i]; i--) n++;
  return n;
}
/** Kept in the last seven days — what a perWeek habit is measured by. */
export function habitWeek(
  habitId: string,
  checkins: readonly Checkin[],
  today: string
) {
  return habitKept(habitId, checkins, today, 7);
}
/** The habit's own colour, else its project's, else null. */
export function habitColor(
  h: { color?: string | null; projectId?: string | null } | null,
  projects: readonly ProjectLike[]
) {
  if (!h) return null;
  if (h.color) return h.color;
  return project(h.projectId, projects)?.color ?? null;
}
export function liveHabits<H extends { archivedAt?: string | null }>(
  list: readonly H[]
) {
  return list.filter((h) => !h.archivedAt);
}
/** The checkin list with (habitId, date) set to `done`. */
export function setCheckin(
  checkins: readonly Checkin[],
  habitId: string,
  date: string,
  done: boolean
) {
  let hit = false;
  const out = checkins.map((c) => {
    if (c.habitId === habitId && c.date === date) {
      hit = true;
      return { ...c, done };
    }
    return c;
  });
  if (!hit) out.push({ habitId, date, done });
  return out;
}
/** A fourteen-day strip (oldest first, last = `end`) → checkin rows. */
export function checkinsFromStrip(
  habitId: string,
  strip: readonly (0 | 1)[],
  end: string
): Checkin[] {
  return strip.flatMap((d, i) =>
    d
      ? [{ habitId, date: addDays(end, i - (strip.length - 1)), done: true }]
      : []
  );
}

/* ---------- events ---------- */

export interface EventLike {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  isAllDay: boolean;
}

export function eventMinutes(e: Pick<EventLike, "startAt" | "endAt"> | null) {
  return e?.startAt && e.endAt ? minutesBetween(e.startAt, e.endAt) : 0;
}
/** The calendar's drawing shape: day of month, decimal hour, length. */
export function eventBlock<E extends EventLike>(e: E) {
  const p = dayParts(e.startAt);
  return {
    ...e,
    day: p ? p.d : null,
    date: e.startAt ? e.startAt.slice(0, 10) : null,
    at: e.isAllDay ? null : hourOf(e.startAt),
    len: e.isAllDay ? 0 : eventMinutes(e),
  };
}
/** Events that touch [from, to): ISO days or stamps; a day bound covers the day. */
export function eventsInRange<E extends Pick<EventLike, "startAt" | "endAt">>(
  list: readonly E[],
  from: string | null,
  to: string | null
) {
  const lo = from ? (from.length > 10 ? from : `${from}T00:00`) : "0000";
  const hi = to ? (to.length > 10 ? to : `${to}T00:00`) : "9999";
  return list.filter(
    (e) => e.startAt && e.startAt < hi && (e.endAt || e.startAt) > lo
  );
}
/** The patch that moves an event to a new start, keeping its length. */
export function moveEvent(
  e: Pick<EventLike, "startAt" | "endAt" | "isAllDay">,
  startAt: string
) {
  const len = eventMinutes(e) || 60;
  if (e.isAllDay) {
    const d = startAt.slice(0, 10);
    return {
      startAt: `${d}T00:00`,
      endAt: `${addDays(d, Math.max(1, Math.round(len / 1440)))}T00:00`,
    };
  }
  return { startAt, endAt: addMinutes(startAt, len) ?? startAt };
}

/**
 * Pairs whose intervals intersect, kept only when at least one side is a
 * calendar event (owner, 2026-10-09): two tasks overlapping is the planner's
 * business, not a mark. Items need `kind`, `id`, `startAt`, `endAt`.
 */
export function overlaps<
  I extends {
    id: string;
    kind: "event" | "task";
    startAt: string;
    endAt: string;
  },
>(items: readonly I[]) {
  const out: [I, I][] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (a.kind !== "event" && b.kind !== "event") continue;
      if (a.startAt < b.endAt && b.startAt < a.endAt) out.push([a, b]);
    }
  }
  return out;
}

/* ---------- mail ---------- */

/** Today, Yesterday, a weekday within the last week, else "24 Aug". */
export function mailDayLabel(
  receivedAt: string | null | undefined,
  today: string
) {
  if (!dayParts(receivedAt)) return "";
  const day = (receivedAt as string).slice(0, 10);
  const n = daysBetween(day, today);
  if (n === 0) return "Today";
  if (n === 1) return "Yesterday";
  if (n > 1 && n < 7) {
    const w = DOW_LONG[weekday(day)];
    return w.charAt(0).toUpperCase() + w.slice(1);
  }
  return dayLabel(day) ?? "";
}
export function mailTime(receivedAt: string | null | undefined) {
  return receivedAt && receivedAt.length > 10 ? receivedAt.slice(11, 16) : "";
}
/** The inbox: not archived, not in Trash. */
export function liveMail<
  M extends { isArchived: boolean; trashedAt?: string | null },
>(list: readonly M[]) {
  return list.filter((m) => !m.isArchived && !m.trashedAt);
}
