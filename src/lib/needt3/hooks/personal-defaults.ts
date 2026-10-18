"use client";

import { formatInTimeZone, newDate } from "@/lib/date-utils";
import {
  PERSONAL_PRESETS,
  type PersonalPreset,
  daysOfRule,
} from "@/lib/personal-time";

import {
  type PersonalDefault,
  usePersonalDefaults,
  useSetPersonalDefault,
} from "./personal";
import { useTimeZone } from "./settings";

export interface DefaultRow {
  preset: PersonalPreset;
  on: boolean;
  /** "HH:mm" in the person's zone. */
  at: string;
  minutes: number;
  /** Weekdays it repeats on, 0 = Sunday. */
  days: number[];
  /** Saves a change; switching on or editing keeps the other values. */
  save: (
    patch: Partial<Pick<PersonalDefault, "enabled" | "at" | "minutes" | "days">>
  ) => void;
}

/**
 * Settings → Your day: one row of state per preset (on or off, when, how long,
 * which days), read from the repeating defaults and written back through
 * `personal.set_default`.
 */
export function usePersonalDefaultRows(onSaved?: () => void): DefaultRow[] {
  const tz = useTimeZone();
  const defaults = usePersonalDefaults();
  const set = useSetPersonalDefault();
  return PERSONAL_PRESETS.map((preset) => {
    const block = defaults.get(preset.kind);
    const days = block
      ? (daysOfRule(block.rrule) ?? [...preset.days])
      : [...preset.days];
    const at = block
      ? formatInTimeZone(newDate(block.start), tz, "HH:mm")
      : preset.at;
    const minutes = block
      ? Math.round(
          (newDate(block.end).getTime() - newDate(block.start).getTime()) /
            60_000
        )
      : preset.minutes;
    return {
      preset,
      on: Boolean(block),
      at,
      minutes,
      days,
      save: (patch) =>
        void set({
          kind: preset.kind,
          enabled: patch.enabled ?? true,
          at: patch.at ?? at,
          minutes: patch.minutes ?? minutes,
          days: patch.days ?? days,
        }).then((saved) => saved && onSaved?.()),
    };
  });
}

/** Start times in half hours, with the current one added when it is off the grid. */
export function startChoices(current: string) {
  const list: string[] = [];
  for (let m = 0; m < 24 * 60; m += 30) {
    list.push(
      `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
    );
  }
  return list.includes(current) ? list : [...list, current].sort();
}

export const LENGTH_CHOICES = [15, 30, 45, 60, 90, 120, 180] as const;

/** Lengths, with the current one added when it is not a usual one. */
export function lengthChoices(current: number) {
  const list: number[] = [...LENGTH_CHOICES];
  return list.includes(current)
    ? list
    : [...list, current].sort((a, b) => a - b);
}

/** "15 min", "1 h", "1 h 30 min". */
export function lengthText(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
/** Monday first, as the week editor lists them. */
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export const dayName = (day: number) => NAMES[day];

/** "Every day", "Weekdays", "Mon, Wed, Fri". */
export function daysText(days: readonly number[]) {
  const sorted = [...days].sort();
  if (sorted.length === 7) return "Every day";
  if (sorted.join() === "1,2,3,4,5") return "Weekdays";
  if (sorted.join() === "0,6") return "Weekends";
  return DAY_ORDER.filter((d) => sorted.includes(d))
    .map((d) => NAMES[d])
    .join(", ");
}
