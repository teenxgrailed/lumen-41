"use client";

import { createContext, useContext, useEffect, useState } from "react";

import { QueryClientContext } from "@tanstack/react-query";

import {
  addCalendarDays,
  formatInTimeZone,
  newDate,
  startOfDayInTimeZone,
} from "@/lib/date-utils";
import { browserTimeZone } from "@/lib/needt3/hooks/core";
import type { V3Settings } from "@/lib/needt3/hooks/settings";
import { qk } from "@/lib/needt3/query-keys";

/** Stands in where react-query is absent or mocked without its context. */
const NO_CLIENT = createContext<
  { getQueryData: <T>(key: readonly unknown[]) => T | undefined } | undefined
>(undefined);

/** Today's day of the month in `timeZone` (1–31). */
export function dayOfMonthIn(now: Date, timeZone: string): number {
  return Number(formatInTimeZone(now, timeZone, "d"));
}

/** Milliseconds from `now` to the next midnight in `timeZone` (at least 1). */
export function msToNextMidnight(now: Date, timeZone: string): number {
  const next = startOfDayInTimeZone(
    addCalendarDays(now, 1, timeZone),
    timeZone
  );
  return Math.max(1, next.getTime() - now.getTime());
}

/**
 * Today's day number in the person's zone, for the calendar place mark. It
 * changes at local midnight through one timer set to that moment (re-armed
 * each day and when the zone changes), not by polling.
 */
export function useTodayNumber(): number {
  // The saved zone when the settings are cached, else the browser's. Read
  // without requiring a query client: the mark is drawn in places that have
  // none (onboarding previews, tests).
  const client = useContext(QueryClientContext ?? NO_CLIENT);
  const timeZone =
    client?.getQueryData<V3Settings>(qk.settings())?.timeZone ||
    browserTimeZone();
  const [day, setDay] = useState(() => dayOfMonthIn(newDate(), timeZone));
  useEffect(() => {
    let timer = 0;
    const arm = () => {
      const now = newDate();
      setDay(dayOfMonthIn(now, timeZone));
      // +50 ms so the timer never lands a hair before midnight.
      timer = window.setTimeout(arm, msToNextMidnight(now, timeZone) + 50);
    };
    arm();
    return () => window.clearTimeout(timer);
  }, [timeZone]);
  return day;
}
