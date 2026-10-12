/**
 * The phone's day logic (prototype phone-kit.jsx `pkDay`), pure. One copy for
 * every phone screen: how a day splits into parts, what is late, what is
 * "Next up", and the patches that move work to tomorrow or to today.
 *
 * The prototype's `pkDay` also wrote to a local store; here every function
 * returns the data or the patch and the screen sends it through
 * `useUpdateTask` / `useCreateTask`, so Undo and the offline queue stay the
 * hooks' job. `today` is always an argument ("YYYY-MM-DD", the person's day);
 * nothing here reads the clock.
 */
import {
  addDays,
  dueLabel,
  at as hourAt,
  moveDay,
  placeAt,
  toDate,
} from "./derive";
import type { V3Priority, V3Task, V3TaskPatch } from "./map";

export type DayPart = "Morning" | "Afternoon" | "Evening" | "Anytime";
const PARTS: readonly DayPart[] = [
  "Morning",
  "Afternoon",
  "Evening",
  "Anytime",
];

/** "Morning" before noon, "Afternoon" before five, else "Evening"; no hour → "Anytime". */
export function part(hour: number | null | undefined): DayPart {
  return hour == null
    ? "Anytime"
    : hour < 12
      ? "Morning"
      : hour < 17
        ? "Afternoon"
        : "Evening";
}

type DayTask = Pick<
  V3Task,
  "id" | "done" | "noSlot" | "dueDate" | "scheduledStart" | "isFixed"
>;

/** Open, placed work whose day has passed. Done tasks leave the list. */
export function isLate(t: DayTask, today: string) {
  return !t.done && !t.noSlot && !!t.dueDate && t.dueDate < today;
}

const atKey = (t: DayTask) => hourAt(t) ?? 99;
const dayKey = (t: DayTask) => t.dueDate ?? "";

export interface DaySections<T extends DayTask> {
  late: T[];
  day: T[];
  inbox: T[];
  next: T[];
}

/**
 * Today split four ways: late (oldest first), today in time order, the
 * inbox (no day, not fixed), and tomorrow.
 */
export function sections<T extends DayTask>(
  tasks: readonly T[],
  today: string
): DaySections<T> {
  const tomorrow = addDays(today, 1);
  const open = tasks.filter((t) => !t.noSlot);
  return {
    late: open
      .filter((t) => isLate(t, today))
      .sort(
        (a, b) => dayKey(a).localeCompare(dayKey(b)) || atKey(a) - atKey(b)
      ),
    day: open
      .filter((t) => t.dueDate === today)
      .sort((a, b) => atKey(a) - atKey(b)),
    inbox: open.filter((t) => !t.dueDate && !t.isFixed),
    next: open.filter((t) => t.dueDate === tomorrow),
  };
}

/** Tasks grouped by part of the day, in day order, empty parts dropped. */
export function parts<T extends DayTask>(list: readonly T[]) {
  return PARTS.map(
    (p) => [p, list.filter((t) => part(hourAt(t)) === p)] as [DayPart, T[]]
  ).filter(([, l]) => l.length);
}

export interface NextUp<T extends DayTask> {
  nu: T | null;
  after: T | null;
  cands: T[];
  fresh: T[];
  lateOpen: T[];
  open: T[];
  /** The skipped list after pressing Skip on `nu`; cycles back when none is fresh. */
  skip: (skipped: readonly string[]) => string[];
}

/**
 * Next up: overdue first (oldest), then today's open work in time order. Skip
 * cycles through the candidates. `busy` = ids still leaving the list.
 */
export function nextUp<T extends DayTask>(
  sec: Pick<DaySections<T>, "late" | "day">,
  opts: {
    skipped?: readonly string[];
    busy?: Readonly<Record<string, unknown>>;
  } = {}
): NextUp<T> {
  const skipped = opts.skipped ?? [];
  const busy = opts.busy ?? {};
  const lateOpen = sec.late.filter((t) => !t.done && !busy[t.id]);
  const open = sec.day.filter((t) => !t.done && !busy[t.id]);
  const cands = [...lateOpen, ...open];
  const fresh = cands.filter((t) => !skipped.includes(t.id));
  const nu = (fresh.length ? fresh : cands)[0] ?? null;
  const nuAt = nu ? hourAt(nu) : null;
  const after =
    nu && !lateOpen.includes(nu) && nuAt != null
      ? (open.find((t) => {
          const h = hourAt(t);
          return h != null && h > nuAt;
        }) ?? null)
      : null;
  return {
    nu,
    after,
    cands,
    fresh,
    lateOpen,
    open,
    skip: (s) => (fresh.length <= 1 || !nu ? [] : [...s, nu.id]),
  };
}

/* ---------- moving work ---------- */

type Dated = Pick<
  V3Task,
  "dueDate" | "scheduledStart" | "scheduledEnd" | "estimatedMinutes"
>;

/** The date fields, for an undo. */
export function snapshot(t: Dated): V3TaskPatch {
  return {
    dueDate: t.dueDate,
    scheduledStart: t.scheduledStart,
    scheduledEnd: t.scheduledEnd,
  };
}

/** Swipe left: to tomorrow, keeping the hour. */
export function laterPatch(t: Dated, today: string): V3TaskPatch {
  return moveDay(t, addDays(today, 1), today);
}

export interface Move {
  id: string;
  patch: V3TaskPatch;
  /** What puts it back. */
  before: V3TaskPatch;
}

/** Every open late task moved to today, with the words for the toast. */
export function moveOverdue<T extends DayTask & Dated>(
  tasks: readonly T[],
  today: string
): { label: string; moves: Move[] } | null {
  const list = tasks.filter((t) => isLate(t, today));
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

/* ---------- creating ---------- */

const PRIO_ALIAS: Record<string, V3Priority> = {
  important: "high",
  asap: "urgent",
  normal: "medium",
  whenever: "low",
  sometime: "low",
};
const PRIORITIES: readonly V3Priority[] = ["urgent", "high", "medium", "low"];

/** The words a line uses for priority ("asap", "important") → a priority, or null. */
export function prio(word: string | null | undefined): V3Priority | null {
  const k = word ? word.trim().toLowerCase() : "";
  if (!k) return null;
  const v = PRIO_ALIAS[k] ?? k;
  return PRIORITIES.includes(v as V3Priority) ? (v as V3Priority) : null;
}

/** "3pm", "15:30", "noon", "midnight" → a decimal hour, or null. */
export function hourOfWord(
  v: string | number | null | undefined
): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const w = String(v ?? "")
    .trim()
    .toLowerCase();
  if (w === "noon") return 12;
  if (w === "midnight") return 0;
  const m = /^(\d{1,2})(?::(\d{2}))?\s?(am|pm)?$/.exec(w);
  if (!m) return null;
  // "13pm" and "0am" are not hours: am/pm takes 1–12
  if (m[3] && (+m[1] < 1 || +m[1] > 12)) return null;
  const h = m[3] ? (+m[1] % 12) + (m[3] === "pm" ? 12 : 0) : +m[1];
  if (h > 23 || (m[2] && +m[2] > 59)) return null;
  return h + (m[2] ? +m[2] / 60 : 0);
}

/** "45m", "2h", "90" → minutes, or null. */
export function minutesOfWord(
  v: string | number | null | undefined
): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : null;
  const m = /^(\d+(?:\.\d+)?)\s*(h|hr|hrs|m|min|mins)?$/i.exec(
    String(v ?? "").trim()
  );
  if (!m) return null;
  const n = parseFloat(m[1]) * (/^h/i.test(m[2] ?? "") ? 60 : 1);
  return n > 0 ? Math.round(n) : null;
}

export interface CreateFields {
  title: string;
  /** A day as a person says it ("tomorrow", "Fri") or "YYYY-MM-DD". */
  date?: string | null;
  /** "3pm", "15:30" or a decimal hour. */
  time?: string | number | null;
  duration?: string | number | null;
  projectId?: string | null;
  priority?: string | null;
  notes?: string | null;
}

/**
 * The draft a new task is created from. It lands on today unless the fields
 * say otherwise; a time places it (and fixes it) on that day.
 */
export function createDraft(
  f: CreateFields,
  today: string
): V3TaskPatch & { title: string } {
  const title = f.title.trim();
  const day = toDate(f.date, today);
  const hour = hourOfWord(f.time);
  const base: V3TaskPatch & { title: string } = {
    title,
    estimatedMinutes: minutesOfWord(f.duration) ?? 30,
    dueDate: day ?? today,
  };
  if (hour != null)
    Object.assign(base, placeAt(base, day ?? today, hour, today));
  if (f.projectId !== undefined) base.projectId = f.projectId;
  const p = prio(f.priority);
  if (p) base.priority = p;
  if (f.notes) base.notes = f.notes;
  return base;
}

/** What to say after create: "Added to today", or where it went. */
export function addedLabel(t: Pick<V3Task, "dueDate">, today: string): string {
  if (!t.dueDate) return "Added to Inbox";
  if (t.dueDate === today) return "Added to today";
  return `Added — ${dueLabel(t) ?? "scheduled"}`;
}

/* ---------- small formatters ---------- */

/** 90 → "1 h 30", 45 → "45 min", 0/null → "" (Mobile.jsx `mbDur`). */
export function durLabel(min: number | null | undefined) {
  if (!min) return "";
  return min < 60
    ? `${min} min`
    : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60}` : ""}`;
}

/** 14.5 → "14:30", 9 → "09:00". */
export function clock(hour: number | null | undefined) {
  if (hour == null) return "";
  const m = Math.round(hour * 60);
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** 2048 → "2 KB". */
export function fileSize(n: number | null | undefined) {
  if (n == null) return "";
  return n < 1024
    ? `${n} B`
    : n < 1_048_576
      ? `${Math.round(n / 1024)} KB`
      : `${(n / 1_048_576).toFixed(1)} MB`;
}
