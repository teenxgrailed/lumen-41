import { CATEGORY_DEFAULTS } from "@/lib/email/categories";

import type { Person } from "../types";

/** Tuesday 3 November 2026, 10:00 UTC: a weekday morning in UTC. */
export const TUESDAY_10_UTC = new Date("2026-11-03T10:00:00.000Z");

const DAY_MS = 24 * 60 * 60 * 1000;
export const daysBefore = (date: Date, days: number) =>
  new Date(date.getTime() - days * DAY_MS);
export const daysAfter = (date: Date, days: number) =>
  new Date(date.getTime() + days * DAY_MS);

/** A verified, reachable, Free person with nothing done yet. */
export function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    userId: "user-1",
    email: "alex@example.com",
    name: "Alex Example",
    verifiedAt: daysBefore(TUESDAY_10_UTC, 3),
    createdAt: daysBefore(TUESDAY_10_UTC, 3),
    lastActiveAt: null,
    sandbox: false,
    deleting: false,
    timeZone: "UTC",
    quiet: null,
    preferences: {
      categories: { ...CATEGORY_DEFAULTS },
      fewer: false,
      paused: false,
    },
    suppressed: false,
    flagOn: true,
    paid: false,
    trial: null,
    gift: null,
    facts: {
      connectedCalendar: false,
      taskCount: 0,
      scheduledTaskCount: 0,
      lastMonthActivity: 0,
    },
    lastMarketingSentAt: null,
    ...overrides,
  };
}
