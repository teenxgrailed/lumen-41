/**
 * The card screens' derivations (flag `habits_cards_v1`), pure so they are
 * tested without a screen: which habits are still in today's stack, how the
 * month grid is coloured, and a goal's next step and risk hint.
 */
import type { GoalView } from "@/lib/goals";
import { type Checkin, daysBetween } from "@/lib/needt3/derive";
import type { V3Habit } from "@/lib/needt3/map";

import { habitCard, monthRows } from "../derive";

/* ---------- today's stack ---------- */

/**
 * The habits still to do today, in list order: they run today (`daysOfWeek`,
 * 0 = Sunday, empty = every day), are not kept, are not a first-run example,
 * and are not resting (a `perWeek` habit whose week is already met). It is the
 * same count the 20:00 push uses (`openHabitCount`), so the screen and the push
 * agree. Kept habits leave the stack; they stay in the "All habits" list.
 */
export function habitStack<
  H extends Pick<V3Habit, "id" | "title" | "schedule"> &
    Partial<Pick<V3Habit, "daysOfWeek" | "isSample">>,
>(list: readonly H[], checkins: readonly Checkin[], today: string): H[] {
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  return list.filter((h) => {
    if (h.isSample) return false;
    if (h.daysOfWeek?.length && !h.daysOfWeek.includes(weekday)) return false;
    const card = habitCard(h, checkins, today);
    return !card.on && !card.rest;
  });
}

/**
 * The colour a habit gets when it has none of its own (and no project colour):
 * a fixed pastel by its place in the list, so a habit keeps its colour while
 * the list around it stays put. Pink, yellow, cyan, green, violet, orange.
 */
export const PASTELS = [
  "#ec6aa5",
  "#e8b923",
  "#3ab8d8",
  "#4cba6b",
  "#8b6fe0",
  "#f08a3c",
] as const;

export function pastelAt(index: number): string {
  return PASTELS[((index % PASTELS.length) + PASTELS.length) % PASTELS.length];
}

/**
 * The round chip's text glyph: the habit's own short icon (an emoji). Null when
 * it has none: the chip then draws a real icon from the title (`HabitChip`),
 * never the first letter (a letter tile is not an icon).
 */
export function chipGlyph(h: {
  title: string;
  icon?: string | null;
}): string | null {
  const icon = h.icon?.trim();
  if (icon && [...icon].length <= 2) return icon;
  return null;
}

/* ---------- the month grid ---------- */

/** 0 none · 1 some · 2 most · 3 every habit kept that day. */
export type DayLevel = 0 | 1 | 2 | 3;

export function dayLevel(kept: number, total: number): DayLevel {
  if (total <= 0 || kept <= 0) return 0;
  const ratio = kept / total;
  if (ratio >= 1) return 3;
  return ratio >= 0.5 ? 2 : 1;
}

export interface GridCell {
  date: string;
  day: number;
  /** null: a day that has not come yet. */
  level: DayLevel | null;
  kept: number;
  today: boolean;
}

export interface MonthGrid {
  /** "2026-11". */
  key: string;
  /** 0..11 */
  month: number;
  /** Empty cells before the 1st, so the 1st sits under its weekday. */
  lead: number;
  cells: GridCell[];
}

/**
 * This month as a calendar grid, Monday first. A day's level is the share of
 * `habitIds` kept that day; days after today have no level.
 */
export function monthGrid(
  today: string,
  habitIds: readonly string[],
  checkins: readonly Checkin[]
): MonthGrid {
  const row = monthRows(today, habitIds, checkins, 1)[0];
  const first = new Date(`${row.key}-01T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const total = new Set(habitIds).size;
  return {
    key: row.key,
    month: row.month,
    lead: (first + 6) % 7,
    cells: row.dots.map((d) => ({
      date: d.date,
      day: d.day,
      level: d.kind === "ahead" ? null : dayLevel(d.kept, total),
      kept: d.kept,
      today: d.today,
    })),
  };
}

/** "3 of 4 habits" for a cell's accessible name. */
export function cellLabel(cell: GridCell, total: number): string {
  if (cell.level === null) return `${cell.day}: not yet`;
  return `${cell.day}: ${cell.kept} of ${total} ${total === 1 ? "habit" : "habits"}`;
}

/* ---------- goals ---------- */

/** The first open task linked to a goal: its next step. */
export function nextStep<
  T extends { id: string; title: string; status: string },
>(tasks: readonly T[] | undefined): { id: string; title: string } | null {
  const open = (tasks ?? []).find((t) => t.status !== "completed");
  return open ? { id: open.id, title: open.title } : null;
}

export type GoalRiskLevel = "late" | "behind" | "soon";

export interface GoalRisk {
  level: GoalRiskLevel;
  text: string;
}

const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

/**
 * A risk hint for an active goal with a deadline, or null when there is
 * nothing to say: overdue; behind (the share of time gone is well past the
 * share done); due within a week.
 */
export function goalRisk(
  goal: Pick<GoalView, "status" | "deadline" | "createdAt" | "progress">,
  today: string
): GoalRisk | null {
  if (goal.status !== "active" || !goal.deadline) return null;
  const due = goal.deadline.slice(0, 10);
  const left = daysBetween(today, due);
  const percent = goal.progress.percent;
  if (percent !== null && percent >= 100) return null;
  if (left < 0) return { level: "late", text: `Overdue by ${days(-left)}` };
  const created = goal.createdAt.slice(0, 10);
  const span = Math.max(1, daysBetween(created, due));
  const gone = Math.min(1, Math.max(0, daysBetween(created, today) / span));
  if (percent !== null && gone >= 0.3 && gone - percent / 100 > 0.25) {
    return {
      level: "behind",
      text: `Behind: ${percent}% done, ${Math.round(gone * 100)}% of the time gone`,
    };
  }
  if (left <= 7) {
    return {
      level: "soon",
      text: left === 0 ? "Due today" : `Due in ${days(left)}`,
    };
  }
  return null;
}
