import { newDate } from "@/lib/date-utils";
import { countsTowardsCap, isOptionalCategory } from "@/lib/email/categories";

import type {
  Decision,
  ExistingSend,
  Person,
  Rule,
  RuleContext,
} from "./types";
import {
  STANDARD_WINDOW,
  type SendWindow,
  isInWindow,
  nextWindowStart,
  safeTimeZone,
} from "./zone";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Normal and "Fewer emails" spacing between optional mails. */
export const CAP_DAYS = { normal: 3, fewer: 7 } as const;

/** A gift is good news the owner chose to send now: a civil hour is enough. */
const GIFT_WINDOW: SendWindow = {
  startMinute: 8 * 60,
  endMinute: 21 * 60,
  weekends: true,
};

/** Statuses after which a rule must not fire again for the same key. */
const TERMINAL = new Set(["sent", "skipped", "cancelled", "claimed"]);

export type DecideInput = {
  rule: Rule;
  person: Person;
  now: Date;
  ctx?: RuleContext;
  /** The operator footer (System Settings) is set. */
  footerResolved: boolean;
  /** The ledger row for this (person, rule, dedupe key), if any. */
  existing?: ExistingSend;
};

export function sendWindowFor(rule: Rule, person: Person): SendWindow {
  if (rule.window === "gift") return GIFT_WINDOW;
  return {
    ...STANDARD_WINDOW,
    weekends: rule.weekends,
    quiet: person.quiet,
  };
}

/**
 * The one decision function of the programme: given a person, a rule and the
 * time, send, skip (with the reason that goes in the ledger), defer to a time,
 * or wait. Pure: no database, no clock, no Resend. Check order is the order in
 * design.md, and the first match wins.
 */
export function decide(input: DecideInput): Decision {
  const { rule, person, now } = input;
  const ctx = input.ctx ?? {};

  const due = rule.dueAt(person, ctx, now);
  if (!due || due > now) return { kind: "wait" };

  if (input.existing && TERMINAL.has(input.existing.status)) {
    return { kind: "skip", reason: "already", record: false };
  }
  if (
    input.existing?.status === "deferred" &&
    input.existing.deferUntil &&
    input.existing.deferUntil > now
  ) {
    return { kind: "wait" };
  }

  const optional = isOptionalCategory(rule.category);

  // 1. the flag
  if (optional && !person.flagOn) {
    return { kind: "skip", reason: "flag-off", record: false };
  }

  // 2. a real recipient
  if (person.sandbox) return { kind: "skip", reason: "sandbox", record: true };
  if (!person.email) return { kind: "skip", reason: "no-email", record: true };
  if (!person.verifiedAt) {
    return { kind: "skip", reason: "unverified", record: true };
  }
  if (person.deleting)
    return { kind: "skip", reason: "deleting", record: true };
  if (person.suppressed) {
    return { kind: "skip", reason: "suppressed", record: true };
  }

  // 3. the operator identity (optional mail only)
  if (optional && !input.footerResolved) {
    return { kind: "skip", reason: "no-operator", record: false };
  }

  // 4. the person's choices
  if (isOptionalCategory(rule.category)) {
    if (person.preferences.paused) {
      return { kind: "skip", reason: "email-paused", record: true };
    }
    const allowed = rule.anyCategory
      ? Object.values(person.preferences.categories).some(Boolean)
      : person.preferences.categories[rule.category];
    if (!allowed) {
      return { kind: "skip", reason: "category-off", record: true };
    }
  }

  // 5. it no longer makes sense
  if (now > rule.expiresAt(person, due, ctx)) {
    return { kind: "skip", reason: "stale", record: true };
  }

  // 6. the rule's own skip condition
  const reason = rule.skip(person, now, ctx);
  if (reason) return { kind: "skip", reason, record: true };

  // 7. the global cap
  let earliest = now;
  let capped = false;
  if (
    !rule.exempt &&
    countsTowardsCap(rule.category) &&
    person.lastMarketingSentAt
  ) {
    const days = person.preferences.fewer ? CAP_DAYS.fewer : CAP_DAYS.normal;
    const until = newDate(person.lastMarketingSentAt.getTime() + days * DAY_MS);
    if (until > now) {
      earliest = until;
      capped = true;
    }
  }

  // 8. quiet window in the person's zone
  const { zone } = safeTimeZone(person.timeZone);
  const window = sendWindowFor(rule, person);
  if (capped || !isInWindow(earliest, zone, window)) {
    const next = nextWindowStart(earliest, zone, window);
    if (!next) return { kind: "skip", reason: "no-window", record: true };
    if (next > rule.expiresAt(person, due, ctx)) {
      return { kind: "skip", reason: "stale", record: true };
    }
    if (next > now) {
      return {
        kind: "defer",
        until: next,
        reason: capped ? "cap" : "window",
      };
    }
  }
  return { kind: "send" };
}

/** Higher priority first (lower number), then the earlier-due rule. */
export function byPriority(a: Rule, b: Rule): number {
  return a.priority - b.priority;
}
