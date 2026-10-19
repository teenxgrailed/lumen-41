/**
 * The Sunday weekly review, pure: when it is offered, what it says about the
 * week, and the note it leaves behind.
 */
import type { Stats } from "@/services/stats/home-stats";

import { addDays, dayLabel, weekday } from "@/lib/needt3/derive";
import { dailyNoteTitle } from "@/lib/needt3/hooks/daily-note";
import type { V3Priority, V3Project, V3Task } from "@/lib/needt3/map";
import type { WeekFocusItem } from "@/lib/needt3/week-focus";

import { dur } from "./derive";
import type { HaFocusOption } from "./ha";
import { weekdayLong, weekdayOf } from "./stats-model";

/** How many focuses the review asks for. */
export const REVIEW_FOCUSES = 3;

/** Sunday, the person's day. */
export const isReviewDay = (today: string) => weekday(today) === 0;

/** "Weekly review · 19 October 2026" for the Sunday it is done on. */
export const reviewTitle = (day: string) =>
  dailyNoteTitle(day).replace("Daily note", "Weekly review");

/** The week's wins, as short lines; empty when there is nothing to celebrate. */
export function winsLines(s: Stats | undefined): string[] {
  if (!s || s.total === 0) return [];
  const lines = [`${s.total} ${s.total === 1 ? "task" : "tasks"} done`];
  if (s.bestDay) lines.push(`Best day: ${weekdayLong(weekdayOf(s.bestDay))}`);
  const top = (s.byProject ?? []).find((p) => p.projectId);
  if (top) lines.push(`Most in ${top.name}: ${top.done}`);
  if (s.focusMinutes != null) lines.push(`${dur(s.focusMinutes)} of focus`);
  return lines;
}

export interface ReviewNote {
  wins: readonly string[];
  moved: readonly { title: string; to: string }[];
  focuses: readonly string[];
}

/** The review as Markdown, the body of the page it is saved to. */
export function reviewMarkdown(n: ReviewNote): string {
  const focuses = n.focuses.map((f) => f.trim()).filter(Boolean);
  const out: string[] = [];
  out.push("## Wins", "");
  out.push(
    ...(n.wins.length ? n.wins.map((w) => `- ${w}`) : ["- A quiet week."])
  );
  if (n.moved.length) {
    out.push("", "## Moved", "");
    out.push(...n.moved.map((m) => `- ${m.title} → ${m.to}`));
  }
  out.push("", "## Focus for next week", "");
  out.push(
    ...(focuses.length
      ? focuses.map((f, i) => `${i + 1}. ${f}`)
      : ["Nothing picked yet."])
  );
  return out.join("\n");
}

const RANK: Record<V3Priority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};
const NEUTRAL = "var(--text-tertiary)";

/** The most the focus picker offers: projects first, then the tasks that press. */
export const FOCUS_PROJECTS = 4;
export const FOCUS_TASKS = 6;

/**
 * What the review offers as a focus for next week: the projects with the most
 * open tasks, then the open tasks that are overdue or due within the coming
 * week (most important first). Each is a reference, so the highlight can use
 * its id.
 */
export function focusOptions(
  tasks: readonly V3Task[],
  projects: readonly V3Project[],
  today: string
): HaFocusOption[] {
  const open = tasks.filter((t) => !t.done && !t.trashedAt && !t.noSlot);
  const colorOf = (id: string | null) =>
    projects.find((p) => p.id === id)?.color ?? NEUTRAL;
  const counts = new Map<string, number>();
  for (const t of open)
    if (t.projectId)
      counts.set(t.projectId, (counts.get(t.projectId) ?? 0) + 1);
  const projectOptions = projects
    .filter((p) => !p.archived && counts.has(p.id))
    .sort(
      (a, b) =>
        (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) ||
        a.name.localeCompare(b.name)
    )
    .slice(0, FOCUS_PROJECTS)
    .map<HaFocusOption>((p) => ({
      key: `project:${p.id}`,
      kind: "project",
      id: p.id,
      title: p.name,
      color: p.color ?? NEUTRAL,
    }));
  const horizon = addDays(today, 7);
  const taskOptions = open
    .filter((t) => t.dueDate && t.dueDate <= horizon)
    .sort(
      (a, b) =>
        RANK[a.priority] - RANK[b.priority] ||
        (a.dueDate ?? "").localeCompare(b.dueDate ?? "") ||
        a.title.localeCompare(b.title)
    )
    .slice(0, FOCUS_TASKS)
    .map<HaFocusOption>((t) => ({
      key: `task:${t.id}`,
      kind: "task",
      id: t.id,
      title: t.title,
      color: colorOf(t.projectId),
    }));
  return [...projectOptions, ...taskOptions];
}

/** The picked options as what `/api/week-focus` stores: a reference and a name. */
export function focusItems(
  options: readonly HaFocusOption[],
  picked: readonly string[]
): WeekFocusItem[] {
  return picked.flatMap((key) => {
    const o = options.find((x) => x.key === key);
    return o
      ? [
          o.kind === "task"
            ? { title: o.title, taskId: o.id }
            : { title: o.title, projectId: o.id },
        ]
      : [];
  });
}

/** "12–18 October" for the week that starts on `first` (it may cross a month). */
export function weekRangeLabel(first: string): string {
  const last = addDays(first, 6);
  const a = dayLabel(first) ?? "";
  const b = dayLabel(last) ?? "";
  const [d1, m1] = a.split(" ");
  const [d2, m2] = b.split(" ");
  return m1 === m2 ? `${d1}–${d2} ${m2}` : `${a} – ${b}`;
}
