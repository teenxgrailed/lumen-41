import { newDate } from "@/lib/date-utils";
import { hhmm } from "@/lib/needt3/derive";
import { type FocusRow, runOf } from "@/lib/needt3/focus";
import type { V3Task } from "@/lib/needt3/map";
import { hourOn } from "@/lib/needt3/task-day";

import { splitHome } from "../home/derive";
import { badgeCount } from "./appBadge";

/** What the desktop app's menu-bar menu shows (apps/desktop reads this). */
export interface DesktopTrayState {
  /** Today's open tasks plus the overdue ones: the Dock badge. */
  open: number;
  /** The next few of them, in the order the day will reach them. */
  next: { id: string; title: string; time: string | null }[];
  /** A running focus session, in words; null when none runs. */
  focus: string | null;
  /** Overdue open tasks: the native Mac app's Dock badge. */
  overdue: number;
  /** When a running, unpaused focus ends (epoch ms), for the menu-bar countdown. */
  focusEndsAt: number | null;
  /** What the running focus is for, if the person said. */
  focusTitle: string | null;
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

/** Epoch ms a running, unpaused focus session ends; null otherwise. */
export function focusEndsAt(
  row: FocusRow | null | undefined,
  nowMs: number
): number | null {
  if (!row) return null;
  const run = runOf(row, nowMs);
  if (run.paused || run.leftSec == null || run.due) return null;
  return nowMs + run.leftSec * 1000;
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
  const { late } = splitHome(input.tasks, input.today);
  return {
    open: badgeCount(input.tasks, input.today),
    next: nextTasks(input.tasks, input.today, input.nowHour),
    focus: focusLine(input.focus, nowMs),
    overdue: late.filter((t) => !t.done).length,
    focusEndsAt: focusEndsAt(input.focus, nowMs),
    focusTitle: input.focus?.intention?.trim() || null,
  };
}
