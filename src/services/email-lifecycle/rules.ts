import { newDate } from "@/lib/date-utils";

import {
  firstWeekdayOfMonth,
  localMonthKey,
  localParts,
  safeTimeZone,
  zonedTimeToUtc,
} from "./zone";
import type { Person, Rule, RuleContext, RuleKey } from "./types";

/**
 * The v1 rules of the email programme (openspec add-email-program, design
 * decision 5). Each rule says when it is due, when it stops making sense, and
 * when it is skipped for good. Whether and when to actually send is decided by
 * `decide` (decide.ts); what the mail says lives in the templates.
 *
 * Priority (lower wins): trial ending 1, win-back and the check 2, onboarding
 * 3, recap 4.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const plus = (date: Date, ms: number) => newDate(date.getTime() + ms);

export const DAYS = {
  onboardingGrace: 7,
  winback14Until: 29,
  winback30Until: 60,
  stillWantEvery: 90,
  stillWantGrace: 14,
} as const;

/** Whole days between two instants, rounded down. */
export function daysBetween(later: Date, earlier: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / DAY_MS);
}

/** The reference for inactivity: the last time the person used the app. */
function inactiveSince(person: Person): Date | null {
  return person.lastActiveAt;
}

function onboardingDue(days: number) {
  return (person: Person): Date | null =>
    person.verifiedAt ? plus(person.verifiedAt, days * DAY_MS) : null;
}

const onboardingExpiry = (_person: Person, due: Date) =>
  plus(due, DAYS.onboardingGrace * DAY_MS);

/**
 * The morning a trial ends: 09:00 local on the day it ends, when that is more
 * than an hour before the end; otherwise 20 hours before the end, so the mail
 * still arrives before the downgrade.
 */
export function trialEndingTodayDue(person: Person): Date | null {
  if (!person.trial) return null;
  const { zone } = safeTimeZone(person.timeZone);
  const end = person.trial.endsAt;
  const parts = localParts(end, zone);
  const nineLocal = zonedTimeToUtc(
    {
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour: 9,
      minute: 0,
    },
    zone
  );
  return nineLocal.getTime() < end.getTime() - HOUR_MS
    ? nineLocal
    : plus(end, -20 * HOUR_MS);
}

const lapseKey = (person: Person) =>
  `lapse:${(person.lastActiveAt ?? newDate(0)).toISOString().slice(0, 10)}`;

/** A trial or a gift about to end already has a mail of its own. */
function endingSoon(person: Person, now: Date): boolean {
  const soon = plus(now, 3 * DAY_MS);
  return Boolean(
    (person.trial && person.trial.endsAt > now && person.trial.endsAt < soon) ||
      (person.gift && person.gift.endsAt > now && person.gift.endsAt < soon)
  );
}

function trialSkip(person: Person, now: Date): string | null {
  if (person.paid) return "paid-already";
  if (person.gift) return "gift-active";
  if (!person.trial) return "no-trial";
  if (person.trial.endsAt <= now) return "trial-over";
  return null;
}

export const RULES: Record<Exclude<RuleKey, "gift">, Rule> = {
  "onboard-day2": {
    key: "onboard-day2",
    category: "tips",
    priority: 3,
    exempt: false,
    window: "standard",
    weekends: false,
    dueAt: onboardingDue(2),
    expiresAt: onboardingExpiry,
    skip: (person) =>
      person.facts.connectedCalendar || person.facts.taskCount > 0
        ? "step-done"
        : null,
    dedupeKey: () => "",
  },
  "onboard-day5": {
    key: "onboard-day5",
    category: "tips",
    priority: 3,
    exempt: false,
    window: "standard",
    weekends: false,
    dueAt: onboardingDue(5),
    expiresAt: onboardingExpiry,
    skip: (person) => (person.facts.scheduledTaskCount > 0 ? "step-done" : null),
    dedupeKey: () => "",
  },
  "onboard-day9": {
    key: "onboard-day9",
    category: "tips",
    priority: 3,
    exempt: false,
    window: "standard",
    weekends: false,
    dueAt: onboardingDue(9),
    expiresAt: onboardingExpiry,
    skip: (person, now) => {
      if (person.paid) return "paid-already";
      const activeRecently =
        person.lastActiveAt !== null &&
        now.getTime() - person.lastActiveAt.getTime() < 2 * DAY_MS;
      return activeRecently && person.facts.taskCount >= 5 ? "step-done" : null;
    },
    dedupeKey: () => "",
  },
  "trial-ending-3d": {
    key: "trial-ending-3d",
    category: "offers",
    priority: 1,
    exempt: false,
    window: "standard",
    weekends: true,
    dueAt: (person) =>
      person.trial ? plus(person.trial.endsAt, -3 * DAY_MS) : null,
    expiresAt: (person, due) => person.trial?.endsAt ?? plus(due, 3 * DAY_MS),
    skip: (person, now) =>
      trialSkip(person, now) ??
      (person.trial?.legacyThreeDaySentAt ? "legacy-sent" : null),
    dedupeKey: () => "",
  },
  "trial-ending-0d": {
    key: "trial-ending-0d",
    category: "offers",
    priority: 1,
    exempt: false,
    window: "standard",
    weekends: true,
    dueAt: (person) => trialEndingTodayDue(person),
    expiresAt: (person, due) => person.trial?.endsAt ?? plus(due, DAY_MS),
    skip: (person, now) => trialSkip(person, now),
    dedupeKey: () => "",
  },
  "winback-14d": {
    key: "winback-14d",
    category: "offers",
    priority: 2,
    exempt: false,
    window: "standard",
    weekends: false,
    dueAt: (person) => {
      const since = inactiveSince(person);
      return since ? plus(since, 14 * DAY_MS) : null;
    },
    expiresAt: (person, due) =>
      plus(inactiveSince(person) ?? due, DAYS.winback14Until * DAY_MS),
    skip: (person, now) => {
      if (person.paid) return "paid-already";
      if (endingSoon(person, now)) return "ending-soon";
      return null;
    },
    dedupeKey: (person) => lapseKey(person),
  },
  "winback-30d": {
    key: "winback-30d",
    category: "offers",
    priority: 2,
    exempt: false,
    window: "standard",
    weekends: false,
    dueAt: (person) => {
      const since = inactiveSince(person);
      return since ? plus(since, 30 * DAY_MS) : null;
    },
    expiresAt: (person, due) =>
      plus(inactiveSince(person) ?? due, DAYS.winback30Until * DAY_MS),
    skip: (person, now) => {
      if (person.paid) return "paid-already";
      if (endingSoon(person, now)) return "ending-soon";
      return null;
    },
    dedupeKey: (person) => lapseKey(person),
  },
  "still-want": {
    key: "still-want",
    category: "offers",
    priority: 2,
    exempt: false,
    window: "standard",
    weekends: false,
    dueAt: (person, _ctx, now) => {
      const since = inactiveSince(person);
      if (!since) return null;
      const quarters = Math.floor(
        daysBetween(now, since) / DAYS.stillWantEvery
      );
      return quarters >= 1
        ? plus(since, quarters * DAYS.stillWantEvery * DAY_MS)
        : null;
    },
    expiresAt: (_person, due) => plus(due, DAYS.stillWantGrace * DAY_MS),
    skip: (person) => (person.paid ? "paid-already" : null),
    dedupeKey: (person, _ctx, now) => {
      const since = inactiveSince(person);
      const quarters = since
        ? Math.floor(daysBetween(now, since) / DAYS.stillWantEvery)
        : 0;
      return `${lapseKey(person)}:q${quarters}`;
    },
  },
  "recap-monthly": {
    key: "recap-monthly",
    category: "recap",
    priority: 4,
    exempt: false,
    window: "standard",
    weekends: false,
    dueAt: (person, _ctx, now) => {
      const { zone } = safeTimeZone(person.timeZone);
      return firstWeekdayOfMonth(now, zone, 10);
    },
    expiresAt: (_person, due) => plus(due, 7 * DAY_MS),
    skip: (person) => (person.facts.lastMonthActivity < 3 ? "thin-data" : null),
    dedupeKey: (person, _ctx, now) =>
      localMonthKey(now, safeTimeZone(person.timeZone).zone),
  },
};

/**
 * The gift notice. Transactional: it reports a change to the account, so it
 * ignores the cap, the flag and every optional category; it only waits for a
 * civil hour (08:00 to 21:00 local).
 */
export const GIFT_RULE: Rule = {
  key: "gift",
  category: "transactional",
  priority: 0,
  exempt: true,
  window: "gift",
  weekends: true,
  dueAt: (_person, ctx) => ctx.gift?.startsAt ?? null,
  expiresAt: (_person, due) => plus(due, 3 * DAY_MS),
  skip: (_person, _now, ctx) => (ctx.gift?.revoked ? "revoked" : null),
  dedupeKey: (_person, ctx: RuleContext) => ctx.gift?.id ?? "",
};

export function ruleFor(key: RuleKey): Rule {
  return key === "gift" ? GIFT_RULE : RULES[key];
}

export const OPTIONAL_RULE_KEYS = Object.keys(RULES) as Array<
  Exclude<RuleKey, "gift">
>;
