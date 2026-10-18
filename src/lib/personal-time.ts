import { RRule } from "rrule";

import { formatInTimeZone, fromZonedTime, newDate } from "@/lib/date-utils";

/**
 * PERSONAL TIME. Protected blocks the person keeps for themselves (Lunch,
 * Walk, Gym...). The scheduler never places a task inside one. They live only
 * inside Needt and are never written to Google, Outlook or iCloud.
 *
 * This module is pure (no database, no React) so the client band, the API,
 * the ops and the scheduler all read a block the same way.
 */

export const PERSONAL_KINDS = [
  "lunch",
  "break",
  "walk",
  "dinner",
  "gym",
  "party",
  "rest",
  "custom",
] as const;
export type PersonalKind = (typeof PERSONAL_KINDS)[number];

/** A palette tint, never a raw colour. The accent is never one of them. */
export const PERSONAL_TONES = ["info", "success", "neutral"] as const;
export type PersonalTone = (typeof PERSONAL_TONES)[number];

export interface PersonalPreset {
  kind: Exclude<PersonalKind, "custom">;
  title: string;
  emoji: string;
  /** Default length in minutes. */
  minutes: number;
  tone: PersonalTone;
  /** The repeating default offered in Settings, "HH:mm". */
  at: string;
  /** The days that default repeats on (0 = Sunday). */
  days: readonly number[];
}

const WEEKDAYS = [1, 2, 3, 4, 5] as const;
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6] as const;

export const PERSONAL_PRESETS: readonly PersonalPreset[] = [
  {
    kind: "lunch",
    title: "Lunch",
    emoji: "🍽️",
    minutes: 60,
    tone: "info",
    at: "13:00",
    days: WEEKDAYS,
  },
  {
    kind: "break",
    title: "Break",
    emoji: "☕",
    minutes: 15,
    tone: "info",
    at: "15:30",
    days: WEEKDAYS,
  },
  {
    kind: "walk",
    title: "Walk",
    emoji: "🚶",
    minutes: 30,
    tone: "success",
    at: "17:30",
    days: WEEKDAYS,
  },
  {
    kind: "dinner",
    title: "Dinner",
    emoji: "🍝",
    minutes: 60,
    tone: "info",
    at: "19:00",
    days: EVERY_DAY,
  },
  {
    kind: "gym",
    title: "Gym",
    emoji: "🏋️",
    minutes: 60,
    tone: "success",
    at: "18:00",
    days: [1, 3, 5],
  },
  {
    kind: "party",
    title: "Party",
    emoji: "🎉",
    minutes: 180,
    tone: "neutral",
    at: "20:00",
    days: [5],
  },
  {
    kind: "rest",
    title: "Rest",
    emoji: "🌙",
    minutes: 60,
    tone: "neutral",
    at: "21:00",
    days: EVERY_DAY,
  },
];

export function presetFor(kind: string | null | undefined) {
  return PERSONAL_PRESETS.find((preset) => preset.kind === kind) ?? null;
}

export function isPersonalKind(value: unknown): value is PersonalKind {
  return (
    typeof value === "string" &&
    (PERSONAL_KINDS as readonly string[]).includes(value)
  );
}

/** The tint of a block: its own token, else its kind's, else neutral. */
export function toneOf(block: {
  kind?: string | null;
  color?: string | null;
}): PersonalTone {
  if (
    block.color &&
    (PERSONAL_TONES as readonly string[]).includes(block.color)
  ) {
    return block.color as PersonalTone;
  }
  return presetFor(block.kind)?.tone ?? "neutral";
}

export const CUSTOM_EMOJI = "🫶";

export function emojiOf(block: {
  kind?: string | null;
  emoji?: string | null;
}) {
  return block.emoji || presetFor(block.kind)?.emoji || CUSTOM_EMOJI;
}

const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

/** `FREQ=WEEKLY;BYDAY=MO,TU` for the given weekdays (0 = Sunday). */
export function weeklyRule(days: readonly number[]) {
  const unique = [...new Set(days)].filter((d) => d >= 0 && d <= 6).sort();
  if (!unique.length) return null;
  if (unique.length === 7) return "FREQ=DAILY";
  return `FREQ=WEEKLY;BYDAY=${unique.map((d) => BYDAY[d]).join(",")}`;
}

/** The weekdays a rule repeats on, or null when it is not a plain daily/weekly rule. */
export function daysOfRule(rule: string | null | undefined) {
  if (!rule) return null;
  const text = rule.replace(/^RRULE:/i, "").toUpperCase();
  if (text === "FREQ=DAILY") return [0, 1, 2, 3, 4, 5, 6];
  const match = /^FREQ=WEEKLY;BYDAY=([A-Z,]+)$/.exec(text);
  if (!match) return null;
  const days = match[1].split(",").map((d) => BYDAY.indexOf(d as never));
  return days.some((d) => d < 0) ? null : days.sort();
}

export function isValidRule(rule: string) {
  try {
    RRule.parseString(rule.replace(/^RRULE:/i, ""));
    return true;
  } catch {
    return false;
  }
}

export interface PersonalBlockLike {
  id: string;
  kind: string;
  title: string;
  emoji: string | null;
  color: string | null;
  start: Date;
  end: Date;
  rrule: string | null;
  sourceEventId: string | null;
}

export interface PersonalOccurrence {
  blockId: string;
  kind: string;
  title: string;
  emoji: string;
  tone: PersonalTone;
  start: Date;
  end: Date;
  /** The person's day the block starts on, "YYYY-MM-DD". */
  date: string;
  repeating: boolean;
  /** Linked to a synced calendar event. */
  linked: boolean;
}

/** Wall-clock `yyyy-MM-ddTHH:mm:ss` of an instant, as a UTC "floating" date. */
function floating(instant: Date, timeZone: string) {
  const wall = formatInTimeZone(instant, timeZone, "yyyy-MM-dd'T'HH:mm:ss");
  return newDate(`${wall}.000Z`);
}

function fromFloating(value: Date, timeZone: string) {
  return fromZonedTime(value.toISOString().slice(0, 19), timeZone);
}

const MAX_OCCURRENCES = 2000;

export interface ExpandOptions {
  from: Date;
  to: Date;
  timeZone: string;
  /** Live times of linked synced events, by event id. A block follows its event. */
  events?: ReadonlyMap<string, { start: Date; end: Date }>;
}

/** Every occurrence of the blocks that touches [from, to), ordered by start. */
export function expandPersonalBlocks(
  blocks: readonly PersonalBlockLike[],
  { from, to, timeZone, events }: ExpandOptions
): PersonalOccurrence[] {
  const out: PersonalOccurrence[] = [];
  for (const block of blocks) {
    const live = block.sourceEventId
      ? events?.get(block.sourceEventId)
      : undefined;
    const base = {
      blockId: block.id,
      kind: block.kind,
      title: block.title,
      emoji: emojiOf(block),
      tone: toneOf(block),
      linked: Boolean(block.sourceEventId),
    };
    const push = (start: Date, end: Date, repeating: boolean) => {
      if (end <= start || end <= from || start >= to) return;
      out.push({
        ...base,
        start,
        end,
        date: formatInTimeZone(start, timeZone, "yyyy-MM-dd"),
        repeating,
      });
    };

    const start = live?.start ?? block.start;
    const end = live?.end ?? block.end;
    if (!block.rrule || live) {
      push(start, end, false);
      continue;
    }

    let rule: RRule;
    try {
      const wallStart = floating(block.start, timeZone);
      rule = new RRule({
        ...RRule.parseString(block.rrule.replace(/^RRULE:/i, "")),
        dtstart: wallStart,
      });
    } catch {
      push(start, end, false);
      continue;
    }
    const wallLength =
      floating(block.end, timeZone).getTime() -
      floating(block.start, timeZone).getTime();
    const lo = newDate(floating(from, timeZone).getTime() - wallLength);
    const hi = floating(to, timeZone);
    for (const wall of rule.between(lo, hi, true).slice(0, MAX_OCCURRENCES)) {
      push(
        fromFloating(wall, timeZone),
        fromFloating(newDate(wall.getTime() + wallLength), timeZone),
        true
      );
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Whether [start, end) touches any occurrence. */
export function overlapsPersonal(
  occurrences: readonly Pick<PersonalOccurrence, "start" | "end">[],
  start: Date,
  end: Date
) {
  return occurrences.some((o) => o.start < end && o.end > start);
}

/** The first occurrence that touches [start, end), if any. */
export function personalHit<
  T extends Pick<PersonalOccurrence, "start" | "end">,
>(occurrences: readonly T[], start: Date, end: Date) {
  return occurrences.find((o) => o.start < end && o.end > start) ?? null;
}
