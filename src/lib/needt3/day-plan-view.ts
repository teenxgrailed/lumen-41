/**
 * The words and numbers on the phone Today, pure: the header, the greeting
 * sentence (a template filled from data, no AI call), and the one stats line.
 * Nothing here reads the clock or the network.
 */
import type { PlanView } from "@/services/day-plan/plan";

import { formatInTimeZone } from "@/lib/date-utils";

export interface DayHeader {
  /** "Fri" */
  weekday: string;
  /** "20 Nov" */
  date: string;
  /** "2026" */
  year: string;
}

/** The header's short weekday and date for `now` in `tz`, as the UI spells them. */
export function dayHeader(now: Date, tz: string): DayHeader {
  return {
    weekday: formatInTimeZone(now, tz, "EEE"),
    date: formatInTimeZone(now, tz, "d MMM"),
    year: formatInTimeZone(now, tz, "yyyy"),
  };
}

/** "Good morning" until noon, "Good afternoon" until 18:00, then "Good evening". */
export function greetingWord(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export type FactKind = "meetings" | "tasks" | "habits";

/** One piece of the greeting: a quiet connective word or a fact with its icon. */
export type GreetingPart =
  | { kind: "text"; text: string }
  | { kind: "fact"; fact: FactKind; text: string };

export interface GreetingInput {
  /** The person's hour now, 0 to 24. */
  hour: number;
  meetings: number;
  tasks: number;
  habits: number;
  /** "16:00", when the rest of the day has no meetings; null when there is none. */
  freeAfter: string | null;
}

const noun = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * The greeting sentence as parts, so the screen can set the connective words
 * in grey and the facts in full ink, each fact after its small icon:
 * "Good morning. You have 3 meetings, 2 tasks and 1 habit today. You're
 * mostly free after 16:00." Zero counts are left out, one is singular.
 */
export function greetingParts(input: GreetingInput): GreetingPart[] {
  const facts: GreetingPart[] = [];
  if (input.meetings > 0)
    facts.push({
      kind: "fact",
      fact: "meetings",
      text: noun(input.meetings, "meeting", "meetings"),
    });
  if (input.tasks > 0)
    facts.push({
      kind: "fact",
      fact: "tasks",
      text: noun(input.tasks, "task", "tasks"),
    });
  if (input.habits > 0)
    facts.push({
      kind: "fact",
      fact: "habits",
      text: noun(input.habits, "habit", "habits"),
    });

  const parts: GreetingPart[] = [
    { kind: "text", text: `${greetingWord(input.hour)}.` },
  ];
  if (!facts.length) {
    parts.push({ kind: "text", text: " Nothing is planned for today." });
    return parts;
  }
  parts.push({ kind: "text", text: " You have " });
  facts.forEach((f, i) => {
    if (i > 0)
      parts.push({
        kind: "text",
        text: i === facts.length - 1 ? " and " : ", ",
      });
    parts.push(f);
  });
  parts.push({ kind: "text", text: " today." });
  if (input.freeAfter)
    parts.push({
      kind: "text",
      text: ` You're mostly free after ${input.freeAfter}.`,
    });
  return parts;
}

/** The greeting as plain text (for the accessible name and for tests). */
export const greetingText = (parts: readonly GreetingPart[]) =>
  parts.map((p) => p.text).join("");

/**
 * When the day clears: the hour the last of today's meetings ends, if that is
 * still ahead, after now, and early enough to leave working time. Null when
 * there are no meetings left or the last one runs to the end of work.
 */
export function freeAfterHour(
  meetings: readonly { at: number; len: number }[],
  nowHour: number,
  workEndHour: number
): number | null {
  const ahead = meetings.filter((m) => m.at + m.len / 60 > nowHour);
  if (!ahead.length) return null;
  const end = Math.max(...ahead.map((m) => m.at + m.len / 60));
  // round up to the next quarter hour so "after 15:40" reads as 15:45
  const rounded = Math.ceil(end * 4) / 4;
  return rounded < workEndHour - 0.5 ? rounded : null;
}

const duration = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
};

export type DayPart = "anytime" | "morning" | "day" | "evening";

/** Where a task sits in the day: no time is Anytime, then by its start hour. */
export function dayPart(hour: number | null | undefined): DayPart {
  if (hour == null) return "anytime";
  if (hour < 12) return "morning";
  if (hour < 17) return "day";
  return "evening";
}

export const DAY_PART_LABEL: Record<DayPart, string> = {
  anytime: "Anytime",
  morning: "Morning",
  day: "Day",
  evening: "Evening",
};

/** Items grouped by part of the day, in the order of the day, empty parts left out. */
export function groupByDayPart<T>(
  items: readonly T[],
  hourOf: (item: T) => number | null | undefined
): { part: DayPart; items: T[] }[] {
  const order: DayPart[] = ["anytime", "morning", "day", "evening"];
  return order
    .map((part) => ({
      part,
      items: items
        .filter((i) => dayPart(hourOf(i)) === part)
        // by start time inside a part; a stable sort keeps plan order otherwise
        .sort((a, b) => (hourOf(a) ?? 0) - (hourOf(b) ?? 0)),
    }))
    .filter((g) => g.items.length > 0);
}

export interface PlanStats {
  /** "3 of 5" */
  used: string;
  /** "2 h focus" */
  focus: string;
}

/** The stats line: the limit used, and the focus time the plan adds up to. */
export function planStats(plan: PlanView): PlanStats {
  return {
    used: `${plan.taskCount} of ${plan.limit}`,
    focus: `${duration(plan.focusMinutes)} focus`,
  };
}
