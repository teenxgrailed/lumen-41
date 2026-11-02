import { CAP_DAYS } from "@/services/email-lifecycle/decide";
import type { Person } from "@/services/email-lifecycle/types";
import {
  STANDARD_WINDOW,
  isInWindow,
  nextWindowStart,
  safeTimeZone,
} from "@/services/email-lifecycle/zone";
import { z } from "zod";

import { newDate } from "@/lib/date-utils";
import { emailDomain } from "@/lib/students/university-domains";

/**
 * Pure rules of a broadcast (openspec add-email-program, email-broadcasts).
 * No database and no clock: the service and the sender feed these what they
 * loaded, and the tests exercise every rule here.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export const SEGMENTS = ["free", "pro", "trial", "students", "all"] as const;
export type Segment = (typeof SEGMENTS)[number];

export const BROADCAST_CATEGORIES = ["updates", "offers"] as const;
export type BroadcastCategory = (typeof BROADCAST_CATEGORIES)[number];

/** Cancel window: a schedule must leave at least this long to change one's mind. */
export const MIN_LEAD_MINUTES = 15;
export const MAX_LEAD_DAYS = 30;
/** One broadcast per person per this many days. */
export const BROADCAST_CAP_DAYS = 7;
/** A deferred send is dropped after this long (cap or quiet hours). */
export const DEFER_LIMIT_DAYS = 7;
export const BATCH_SIZE = 100;
export const REQUESTS_PER_SECOND = 5;

export const broadcastInputSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(1, "The subject is empty.")
    .max(100, "The subject is over 100 characters."),
  preheader: z
    .string()
    .trim()
    .max(150, "The preheader is over 150 characters.")
    .default(""),
  paragraphs: z
    .array(
      z.string().trim().min(1).max(1000, "A paragraph is over 1000 characters.")
    )
    .min(1, "Write at least one paragraph.")
    .max(12, "Use at most 12 paragraphs."),
  buttonLabel: z.string().trim().min(1).max(40).nullish(),
  buttonUrl: z.string().trim().max(500).nullish(),
  category: z.enum(BROADCAST_CATEGORIES).default("updates"),
  segment: z.enum(SEGMENTS),
});

export type BroadcastInput = z.infer<typeof broadcastInputSchema>;

/** Why a broadcast's content is not acceptable, or null. */
export function validateButton(input: {
  buttonLabel?: string | null;
  buttonUrl?: string | null;
}): string | null {
  const hasLabel = Boolean(input.buttonLabel?.trim());
  const hasUrl = Boolean(input.buttonUrl?.trim());
  if (!hasLabel && !hasUrl) return null;
  if (hasLabel !== hasUrl) return "A button needs both a label and a link.";
  try {
    const url = new URL(input.buttonUrl as string);
    if (url.protocol !== "https:") return "The button link must be https.";
  } catch {
    return "The button link is not a valid address.";
  }
  return null;
}

/** `.edu` and `.ac.*` (ac.uk, ac.jp, ...) addresses. Nobody is flagged in storage. */
export function isStudentEmail(email: string | null | undefined): boolean {
  const domain = emailDomain(email);
  if (!domain) return false;
  return /(^|\.)edu$/.test(domain) || /(^|\.)ac\.[a-z]{2,}$/.test(domain);
}

export function inSegment(
  segment: Segment,
  person: Person,
  now: Date
): boolean {
  const trialActive = Boolean(person.trial && person.trial.endsAt > now);
  switch (segment) {
    case "all":
      return true;
    case "students":
      return isStudentEmail(person.email);
    case "trial":
      return trialActive && !person.paid && !person.gift;
    case "pro":
      return person.paid || Boolean(person.gift);
    case "free":
      return !person.paid && !person.gift && !trialActive;
  }
}

/**
 * Why a person never receives this broadcast, or null. Used for the count
 * shown before sending and again for each recipient at send time.
 */
export function exclusionReason(
  person: Person,
  category: BroadcastCategory
): string | null {
  if (!person.flagOn) return "flag-off";
  if (person.sandbox) return "sandbox";
  if (!person.email) return "no-email";
  if (!person.verifiedAt) return "unverified";
  if (person.deleting) return "deleting";
  if (person.suppressed) return "suppressed";
  if (person.preferences.paused) return "email-paused";
  if (!person.preferences.categories[category]) return "category-off";
  return null;
}

export type ScheduleCheck = { ok: true } | { ok: false; reason: string };

/** The rules for putting a broadcast on the calendar. */
export function checkSchedule(input: {
  at: Date;
  now: Date;
  testedAt: Date | null;
  contentUpdatedAt: Date;
  footerResolved: boolean;
  segment: Segment;
  recipientCount: number;
  confirmCount?: number | null;
}): ScheduleCheck {
  const { at, now } = input;
  if (!input.footerResolved) {
    return {
      ok: false,
      reason:
        "Set the footer name and address in System Settings before scheduling.",
    };
  }
  if (!input.testedAt || input.testedAt < input.contentUpdatedAt) {
    return {
      ok: false,
      reason: "Send a test to yourself after the last edit before scheduling.",
    };
  }
  if (at.getTime() < now.getTime() + MIN_LEAD_MINUTES * MINUTE_MS) {
    return {
      ok: false,
      reason: `Schedule at least ${MIN_LEAD_MINUTES} minutes ahead so it can still be cancelled.`,
    };
  }
  if (at.getTime() > now.getTime() + MAX_LEAD_DAYS * DAY_MS) {
    return {
      ok: false,
      reason: `Schedule within ${MAX_LEAD_DAYS} days.`,
    };
  }
  if (input.recipientCount < 1) {
    return { ok: false, reason: "Nobody would receive this broadcast." };
  }
  if (input.segment === "all" && input.confirmCount !== input.recipientCount) {
    return {
      ok: false,
      reason: `Type the recipient count (${input.recipientCount}) to send to everyone.`,
    };
  }
  return { ok: true };
}

export type BroadcastSendDecision =
  | { kind: "send" }
  | { kind: "skip"; reason: string }
  | { kind: "defer"; until: Date; reason: "cap" | "window" };

/**
 * Whether one person gets the broadcast now. `lastBroadcastAt` is their most
 * recent broadcast; `startedAt` is when this one began, which bounds how long
 * a send may be deferred.
 */
export function decideBroadcastSend(input: {
  person: Person;
  category: BroadcastCategory;
  segment: Segment;
  now: Date;
  startedAt: Date;
  lastBroadcastAt: Date | null;
}): BroadcastSendDecision {
  const { person, now } = input;
  if (!inSegment(input.segment, person, now)) {
    return { kind: "skip", reason: "left-segment" };
  }
  const excluded = exclusionReason(person, input.category);
  if (excluded) return { kind: "skip", reason: excluded };
  if (
    input.lastBroadcastAt &&
    now.getTime() - input.lastBroadcastAt.getTime() <
      BROADCAST_CAP_DAYS * DAY_MS
  ) {
    return { kind: "skip", reason: "broadcast-cap" };
  }

  const giveUpAt = newDate(
    input.startedAt.getTime() + DEFER_LIMIT_DAYS * DAY_MS
  );
  let earliest = now;
  let capped = false;
  if (person.lastMarketingSentAt) {
    const days = person.preferences.fewer ? CAP_DAYS.fewer : CAP_DAYS.normal;
    const until = newDate(person.lastMarketingSentAt.getTime() + days * DAY_MS);
    if (until > now) {
      earliest = until;
      capped = true;
    }
  }
  const { zone } = safeTimeZone(person.timeZone);
  const window = { ...STANDARD_WINDOW, quiet: person.quiet };
  if (capped || !isInWindow(earliest, zone, window)) {
    const next = nextWindowStart(earliest, zone, window);
    if (!next || next > giveUpAt) {
      return { kind: "skip", reason: capped ? "cap-expired" : "no-window" };
    }
    if (next > now) {
      return { kind: "defer", until: next, reason: capped ? "cap" : "window" };
    }
  }
  return { kind: "send" };
}
