/**
 * The Focus window's arithmetic, in one place and free of React (prototype
 * focus.jsx: fcPlanned, fcClock, fcFinish, the length and task rules).
 *
 * The server owns the clock: a session is `startedAt` plus the pauses, and
 * every number here is derived from that row and a `now` the caller supplies,
 * so a reload, a second tab or a face swap all show the same seconds.
 */
import { formatInTimeZone, newDate } from "@/lib/date-utils";
import { effectiveElapsedSeconds, formatClock } from "@/lib/focus-timer";

/** The slice of the server's FocusSession row the window reads. */
export interface FocusRow {
  id: string;
  taskId: string | null;
  intention: string | null;
  plannedMinutes: number | null;
  startedAt: string;
  pausedAt: string | null;
  pausedTotalSeconds: number;
  phase?: "FOCUS" | "SHORT_BREAK" | "LONG_BREAK";
}

/** A session as the window draws it, at one instant. */
export interface FocusRun {
  id: string;
  taskId: string | null;
  intention: string | null;
  isBreak: boolean;
  paused: boolean;
  plannedMinutes: number | null;
  elapsedSec: number;
  /** Seconds left; null for a session with no planned length (it counts up). */
  leftSec: number | null;
  /** 0..1 of the planned length; 0 when there is none. */
  pct: number;
  /** The planned length has run out and the session is not paused. */
  due: boolean;
}

export function runOf(row: FocusRow, nowMs: number): FocusRun {
  const elapsedSec = effectiveElapsedSeconds(row, nowMs);
  const total = row.plannedMinutes != null ? row.plannedMinutes * 60 : null;
  const paused = row.pausedAt != null;
  return {
    id: row.id,
    taskId: row.taskId,
    intention: row.intention,
    isBreak: row.phase === "SHORT_BREAK" || row.phase === "LONG_BREAK",
    paused,
    plannedMinutes: row.plannedMinutes,
    elapsedSec,
    leftSec: total == null ? null : Math.max(total - elapsedSec, 0),
    pct: total ? Math.min(elapsedSec / total, 1) : 0,
    due: total != null && !paused && elapsedSec >= total,
  };
}

/** What the clock shows: time left, or time spent when nothing is planned. */
export const clockOf = (run: FocusRun) =>
  formatClock(run.leftSec ?? run.elapsedSec);

/** The wall-clock time the session ends, "16:17"; null when it has no end. */
export function endsAt(run: FocusRun, nowMs: number, timeZone: string) {
  if (run.leftSec == null) return null;
  return formatInTimeZone(
    newDate(nowMs + run.leftSec * 1000),
    timeZone,
    "HH:mm"
  );
}

/* ---------- setup ---------- */

export const LENGTHS = ["25", "50", "90", "custom"] as const;
export type LengthChoice = (typeof LENGTHS)[number];
export const SOUNDS = ["off", "rain", "cafe", "noise"] as const;
export type Sound = (typeof SOUNDS)[number];

export const MIN_LENGTH = 1;
export const MAX_LENGTH = 240;
export const BREAK_MINUTES = 5;
/** The server accepts 1..60 minutes per extension. */
export const MORE_MINUTES = 5;
/** A quick start (Home's Start focus, a task's sheet) runs this long. */
export const QUICK_MINUTES = 25;

export const isSound = (v: unknown): v is Sound =>
  typeof v === "string" && (SOUNDS as readonly string[]).includes(v);

/** The saved default length ("50") as a choice and a custom box. */
export function lengthFromPref(pref: unknown): {
  len: LengthChoice;
  custom: string;
} {
  const s = String(pref ?? "50");
  if (s === "25" || s === "50" || s === "90") return { len: s, custom: "40" };
  return { len: "custom", custom: s };
}

/** The minutes a choice means, and whether the custom box is out of range. */
export function lengthMinutes(len: LengthChoice, custom: string) {
  const n = parseInt(custom, 10);
  const bad = len === "custom" && !(n >= MIN_LENGTH && n <= MAX_LENGTH);
  const minutes =
    len === "custom"
      ? Math.max(MIN_LENGTH, Math.min(MAX_LENGTH, n || 0))
      : parseInt(len, 10);
  return { minutes, bad };
}

interface TaskLike {
  id: string;
  title: string;
  done: boolean;
  noSlot: boolean;
  trashedAt: string | null;
}

/** Tasks a session can be about: open, placed or not, not in Trash. */
export const openTasks = <T extends TaskLike>(
  tasks: readonly T[] | undefined
) => (tasks ?? []).filter((t) => !t.done && !t.noSlot && !t.trashedAt);

/** The chosen task first, then the next open ones; six cards at most. */
export function taskChoices<T extends TaskLike>(
  open: readonly T[],
  chosenId: string
): T[] {
  const chosen = open.find((t) => t.id === chosenId);
  return (chosen ? [chosen] : [])
    .concat(open.filter((t) => t !== chosen))
    .slice(0, 6);
}

export function taskOf<T extends { id: string; title: string }>(
  tasks: readonly T[] | undefined,
  run: Pick<FocusRun, "taskId" | "intention">
): T | null {
  const list = tasks ?? [];
  return (
    (run.taskId ? list.find((t) => t.id === run.taskId) : undefined) ??
    list.find((t) => t.title === run.intention) ??
    null
  );
}

/** The session's own words: what it is for, else the task, else "Focus". */
export function intentionOf(purpose: string, task: { title: string } | null) {
  return purpose.trim() || task?.title || "Focus";
}

/** Next task after this one: the first open task that is not the one just done. */
export function nextTask<T extends TaskLike>(
  tasks: readonly T[] | undefined,
  exceptId: string | null
): T | null {
  return openTasks(tasks).find((t) => t.id !== exceptId) ?? null;
}

/* ---------- the notice and the tab ---------- */

export const startedLine = (minutes: number, title: string) =>
  `Focus started · ${minutes} min on “${title}”`;

const TAB_PREFIX = /^\d{2,}:\d{2} · /;

/** The tab's title with the running clock in front; a null clock takes it off. */
export function tabTitle(current: string, clock: string | null) {
  const base = current.replace(TAB_PREFIX, "");
  return clock ? `${clock} · ${base}` : base;
}

/* ---------- ending ---------- */

/** What the End view says: minutes, the task, how it ended. */
export interface FocusSummary {
  minutes: number;
  title: string;
  taskId: string | null;
  how: "complete" | "stopped";
  /** Opened from a Focus-ended push: only the ask, no numbers to show. */
  bare?: boolean;
}

export function summaryOf(
  run: FocusRun,
  title: string,
  how: FocusSummary["how"]
): FocusSummary {
  return {
    minutes: Math.round(run.elapsedSec / 60),
    title,
    taskId: run.taskId,
    how,
  };
}

/** Today's numbers from `GET /api/focus` (see useFocusStats). */
export interface FocusStats {
  minutesToday: number;
  sessionsWeek: number;
  streak: number;
}

export function statsFromApi(body: {
  stats?: { currentStreak?: number } | null;
  weeklyReport?: {
    sessionsCompleted?: number;
    sessionsFocused?: number;
    dailyMinutes?: { minutes: number }[];
  } | null;
}): FocusStats {
  const days = body.weeklyReport?.dailyMinutes ?? [];
  return {
    minutesToday: days.length ? (days[days.length - 1]?.minutes ?? 0) : 0,
    sessionsWeek:
      body.weeklyReport?.sessionsFocused ??
      body.weeklyReport?.sessionsCompleted ??
      0,
    streak: body.stats?.currentStreak ?? 0,
  };
}
