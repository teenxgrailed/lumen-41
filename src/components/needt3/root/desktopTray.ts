import { newDate } from "@/lib/date-utils";
import { hhmm } from "@/lib/needt3/derive";
import { type FocusRow, runOf } from "@/lib/needt3/focus";
import type { V3Task } from "@/lib/needt3/map";
import { hourOn } from "@/lib/needt3/task-day";

import { splitHome } from "../home/derive";
import { badgeCount, overdueCount } from "./appBadge";

/** What the desktop app's menu-bar menu shows (apps/desktop reads this). */
export interface DesktopTrayState {
  /** Today's open tasks plus the overdue ones: the menu's "Today · N open". */
  open: number;
  /** The overdue ones alone: the Dock badge (hidden at 0). */
  overdue: number;
  /** The next few of them, in the order the day will reach them. */
  next: { id: string; title: string; time: string | null }[];
  /** A running focus session, in words; null when none runs. */
  focus: string | null;
  /** The same session as numbers, for the menu and the menu-bar countdown. */
  focusRun: DesktopFocusRun | null;
}

/**
 * A running session for the menu bar. The shell ticks the countdown itself,
 * once a second, from `endsAt` (an absolute time, so a page that reports once
 * a minute stays exact); `leftSec` is what a paused session has left. A
 * session with no planned length has neither and shows no countdown.
 */
export interface DesktopFocusRun {
  kind: "Focus" | "Break";
  /** What it is on: the intention, else the task's title. */
  title: string;
  /** Epoch ms the planned time runs out; null when paused or open-ended. */
  endsAt: number | null;
  /** Seconds left while paused; null otherwise. */
  leftSec: number | null;
  /** The planned length in seconds; null when open-ended. */
  totalSec: number | null;
  paused: boolean;
}

export const TRAY_TASK_LIMIT = 3;
const TITLE_LIMIT = 48;

function clip(title: string): string {
  const text = title.trim().replace(/\s+/g, " ") || "Untitled";
  return text.length > TITLE_LIMIT
    ? `${text.slice(0, TITLE_LIMIT - 1)}…`
    : text;
}

/**
 * The next tasks of the day: today's open ones that still lie ahead (timed at
 * or after `nowHour`) first, then those with no time, then timed ones already
 * past, then the overdue. A task's time is only shown when it sits on today.
 */
export function nextTasks(
  tasks: readonly V3Task[],
  today: string,
  nowHour: number,
  limit = TRAY_TASK_LIMIT
): DesktopTrayState["next"] {
  const { day, late } = splitHome(tasks, today);
  const open = day.filter((t) => !t.done);
  const hourOf = (t: V3Task) => hourOn(t, today);
  const ahead = open.filter((t) => (hourOf(t) ?? -1) >= nowHour);
  const untimed = open.filter((t) => hourOf(t) === null);
  const past = open.filter((t) => (hourOf(t) ?? nowHour) < nowHour);
  return [...ahead, ...untimed, ...past, ...late.filter((t) => !t.done)]
    .filter((t, i, all) => all.findIndex((o) => o.id === t.id) === i)
    .slice(0, limit)
    .map((t) => ({
      id: t.id,
      title: clip(t.title),
      time: hhmm(hourOf(t)),
    }));
}

/** "Focus 12 min left", "Focus paused", "Break 3 min left"; null when none. */
export function focusLine(
  row: FocusRow | null | undefined,
  nowMs: number
): string | null {
  if (!row) return null;
  const run = runOf(row, nowMs);
  const what = run.isBreak ? "Break" : "Focus";
  if (run.paused) return `${what} paused`;
  if (run.leftSec == null) {
    return `${what} ${Math.max(1, Math.floor(run.elapsedSec / 60))} min`;
  }
  if (run.due) return `${what} time is up`;
  return `${what} ${Math.max(1, Math.ceil(run.leftSec / 60))} min left`;
}

export function focusRunOf(
  row: FocusRow | null | undefined,
  nowMs: number,
  tasks: readonly V3Task[] = []
): DesktopFocusRun | null {
  if (!row) return null;
  const run = runOf(row, nowMs);
  const task = row.taskId ? tasks.find((t) => t.id === row.taskId) : undefined;
  const title = (row.intention?.trim() || task?.title.trim() || "").replace(
    /\s+/g,
    " "
  );
  return {
    kind: run.isBreak ? "Break" : "Focus",
    title: title.length > 120 ? `${title.slice(0, 119)}…` : title,
    // Whole seconds, so the page's once-a-minute reports do not jitter.
    endsAt:
      !run.paused && run.leftSec != null
        ? Math.round((nowMs + run.leftSec * 1000) / 1000) * 1000
        : null,
    leftSec: run.paused ? run.leftSec : null,
    totalSec:
      row.plannedMinutes != null ? Math.round(row.plannedMinutes * 60) : null,
    paused: run.paused,
  };
}

export function trayState(input: {
  tasks: readonly V3Task[] | undefined;
  today: string;
  nowHour: number;
  focus: FocusRow | null | undefined;
  nowMs?: number;
}): DesktopTrayState | null {
  if (!input.tasks) return null;
  const nowMs = input.nowMs ?? newDate().getTime();
  return {
    open: badgeCount(input.tasks, input.today),
    overdue: overdueCount(input.tasks, input.today),
    next: nextTasks(input.tasks, input.today, input.nowHour),
    focus: focusLine(input.focus, nowMs),
    focusRun: focusRunOf(input.focus, nowMs, input.tasks),
  };
}
