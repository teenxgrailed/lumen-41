import { formatInTimeZone, fromZonedTime, newDate } from "@/lib/date-utils";
import { daysOfRule, weeklyRule } from "@/lib/personal-time";
import { nextDay } from "@/lib/personal-time-days";

/**
 * Editing a personal block: what the form shows (the block's own clock in the
 * person's zone) and the smallest PATCH that carries a change. Pure: no
 * database, no React, so jest pins it.
 */

export interface EditableBlock {
  title: string;
  start: string;
  end: string;
  rrule: string | null;
  sourceEventId?: string | null;
}

export interface EditDraft {
  title: string;
  /** "HH:mm" in the person's zone. */
  startAt: string;
  endAt: string;
  /** Weekdays it repeats on, 0 = Sunday. Empty: just this once. */
  days: number[];
}

export interface PersonalPatch {
  title?: string;
  start?: string;
  end?: string;
  rrule?: string | null;
}

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The values the form opens with. */
export function draftOf(block: EditableBlock, timeZone: string): EditDraft {
  return {
    title: block.title,
    startAt: formatInTimeZone(newDate(block.start), timeZone, "HH:mm"),
    endAt: formatInTimeZone(newDate(block.end), timeZone, "HH:mm"),
    days: daysOfRule(block.rrule) ?? [],
  };
}

/** A repeat the form cannot show as weekday chips (monthly, every 2 weeks...). */
export function hasCustomRepeat(block: Pick<EditableBlock, "rrule">) {
  return Boolean(block.rrule) && daysOfRule(block.rrule) === null;
}

/**
 * The block's start and end on its own days, moved to the new clock times. An
 * end at or before the start rolls to the next day, so 22:00 to 01:00 works.
 */
export function editedTimes(
  block: Pick<EditableBlock, "start" | "end">,
  timeZone: string,
  startAt: string,
  endAt: string
) {
  const day = (iso: string) =>
    formatInTimeZone(newDate(iso), timeZone, "yyyy-MM-dd");
  const startDay = day(block.start);
  const lastDay = day(block.end);
  // days the block already spans (a party that ends the next morning)
  let endDay = startDay;
  while (endDay < lastDay) endDay = nextDay(endDay);
  const start = fromZonedTime(`${startDay}T${startAt}:00`, timeZone);
  let end = fromZonedTime(`${endDay}T${endAt}:00`, timeZone);
  for (let guard = 0; end <= start && guard < 3; guard += 1) {
    endDay = nextDay(endDay);
    end = fromZonedTime(`${endDay}T${endAt}:00`, timeZone);
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Why the draft cannot be saved yet, or null. */
export function draftProblem(draft: EditDraft): string | null {
  if (!draft.title.trim()) return "Give it a name";
  if (!CLOCK.test(draft.startAt) || !CLOCK.test(draft.endAt)) {
    return "Pick a start and an end";
  }
  if (draft.startAt === draft.endAt) return "It must end after it starts";
  return null;
}

/**
 * What changed, and only that. A block linked to a calendar event follows the
 * event, so only its name can change. A repeat the chips cannot show is left
 * as it is.
 */
export function patchFor(
  block: EditableBlock,
  draft: EditDraft,
  timeZone: string
): PersonalPatch {
  const before = draftOf(block, timeZone);
  const patch: PersonalPatch = {};
  const title = draft.title.trim();
  if (title !== block.title) patch.title = title;
  if (block.sourceEventId) return patch;
  if (draft.startAt !== before.startAt || draft.endAt !== before.endAt) {
    Object.assign(
      patch,
      editedTimes(block, timeZone, draft.startAt, draft.endAt)
    );
  }
  if (!hasCustomRepeat(block)) {
    const was = [...before.days].sort().join();
    const now = [...new Set(draft.days)].sort().join();
    if (was !== now) patch.rrule = weeklyRule(draft.days);
  }
  return patch;
}
