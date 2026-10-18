/**
 * The Sunday weekly review, pure: when it is offered, what it says about the
 * week, and the note it leaves behind.
 */
import type { Stats } from "@/services/stats/home-stats";

import { weekday } from "@/lib/needt3/derive";
import { dailyNoteTitle } from "@/lib/needt3/hooks/daily-note";

import { dur } from "./derive";
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
