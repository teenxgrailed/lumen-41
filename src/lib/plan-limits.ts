import type { SubscriptionPlan } from "@prisma/client";

/**
 * What each plan allows. Client-safe (no Prisma client, no server code) so the
 * paywall can print the same numbers the server enforces; `@/lib/entitlements`
 * re-exports it and does the enforcing. `null` means unlimited.
 */
export interface PlanLimits {
  calendars: number | null;
  autoScheduledTasks: number | null;
  boards: number | null;
  mailboxes: number | null;
  aiAgent: boolean;
  focusStats: boolean;
  advancedFocusModes: boolean;
  remindersPerTask: number | null;
  bookingPages: number | null;
  advancedNudges: boolean;
  /** Active (non-archived) habits; a trial counts as Pro. */
  habits: number | null;
}

export const PLAN_LIMITS = {
  FREE: {
    calendars: 1,
    autoScheduledTasks: 15,
    boards: 1,
    mailboxes: 0,
    aiAgent: false,
    focusStats: false,
    advancedFocusModes: false,
    remindersPerTask: 1,
    bookingPages: 1,
    advancedNudges: false,
    habits: 3,
  },
  PRO: {
    calendars: null,
    autoScheduledTasks: null,
    boards: null,
    mailboxes: 3,
    aiAgent: true,
    focusStats: true,
    advancedFocusModes: true,
    remindersPerTask: null,
    bookingPages: null,
    advancedNudges: true,
    habits: null,
  },
  LIFETIME: {
    calendars: null,
    autoScheduledTasks: null,
    boards: null,
    mailboxes: 3,
    aiAgent: true,
    focusStats: true,
    advancedFocusModes: true,
    remindersPerTask: null,
    bookingPages: null,
    advancedNudges: true,
    habits: null,
  },
} as const satisfies Record<SubscriptionPlan, PlanLimits>;
