import type { SubscriptionPlan } from "@prisma/client";

/**
 * What each plan may use. Kept free of server imports so client code (the
 * habits screen, pricing) reads the same numbers the API enforces in
 * `@/lib/entitlements`; never copy a limit into a component constant.
 */
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
} as const satisfies Record<
  SubscriptionPlan,
  {
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
>;
