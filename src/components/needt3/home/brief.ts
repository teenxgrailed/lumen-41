/**
 * The morning brief on Home, pure: when it may show, what the person's day
 * looks like to the model, and when it is worth asking at all.
 */
import { hhmm } from "@/lib/needt3/derive";
import type { V3Task } from "@/lib/needt3/map";

import type { ScheduleItem } from "./derive";

/** The brief is for the morning: it shows (and is written) before this hour. */
export const BRIEF_UNTIL_HOUR = 12;

export const isMorning = (nowHour: number) => nowHour < BRIEF_UNTIL_HOUR;

export interface BriefFactsInput {
  /** Open overdue tasks, oldest first. */
  late: readonly V3Task[];
  /** Today's tasks, open and closed, in the day's order. */
  day: readonly V3Task[];
  /** Minutes of working time left today (`freeMinutesLeft`). */
  freeMinutes: number | null;
  /** Today's schedule items (events and timed tasks), by hour. */
  schedule: readonly ScheduleItem[];
  nowHour: number;
}

export interface BriefFacts {
  today: string[];
  openToday: number;
  doneToday: number;
  overdue: string[];
  overdueCount: number;
  freeMinutes: number | null;
  nextEvent: { title: string; at: string } | null;
}

const clip = (s: string) => s.trim().slice(0, 120);

export function briefFactsOf(i: BriefFactsInput): BriefFacts {
  const open = i.day.filter((t) => !t.done);
  const next = i.schedule.find((x) => x.event && x.at >= i.nowHour);
  return {
    today: open.slice(0, 6).map((t) => clip(t.title)),
    openToday: open.length,
    doneToday: i.day.length - open.length,
    overdue: i.late.slice(0, 3).map((t) => clip(t.title)),
    overdueCount: i.late.length,
    freeMinutes: i.freeMinutes,
    nextEvent: next
      ? { title: clip(next.title), at: hhmm(next.at) ?? "00:00" }
      : null,
  };
}

/** Nothing open and nothing overdue leaves the brief nothing to say. */
export const hasBriefToSay = (f: BriefFacts) =>
  f.openToday > 0 || f.overdueCount > 0;

/**
 * Whether Home asks for a brief at all: only a known-paid person, only in
 * the morning, only when AI can answer and the day has something in it. A
 * Free or unknown plan asks nothing, so nothing is ever upsold here.
 */
export function shouldAskBrief(o: {
  pro: boolean | null;
  morning: boolean;
  aiAvailable: boolean | undefined;
  facts: BriefFacts;
}) {
  return (
    o.pro === true &&
    o.morning &&
    o.aiAvailable === true &&
    hasBriefToSay(o.facts)
  );
}
