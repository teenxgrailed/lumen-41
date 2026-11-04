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
  /** "Plan my day": the scheduler run with its summary and one Undo. */
  planMyDay: boolean;
  focusStats: boolean;
  advancedFocusModes: boolean;
  remindersPerTask: number | null;
  bookingPages: number | null;
  advancedNudges: boolean;
  /** Active (non-archived) habits; a trial counts as Pro. */
  habits: number | null;
  /** Goals with progress and the weekly check-in (owner decision 2026-10-27). */
  goals: boolean;
  /** QUIT habits (owner decision 2026-11-04): Pro only, behind `habits_quit`. */
  quitHabits: boolean;
  /** Agents in the hub that are not disabled (owner decision 2026-11-03). */
  hubAgents: number | null;
  /** Hub items that are not done, failed or cancelled. */
  hubOpenItems: number | null;
  /** Hub memory notes. */
  hubNotes: number | null;
  /** Days of hub activity and event history that stay visible. */
  hubHistoryDays: number;
  /** Attachments on hub items. */
  hubAttachments: boolean;
  /** Webhooks fired by hub events. */
  hubWebhooks: boolean;
  /** Recurring hub items. */
  hubRecurring: boolean;
}

export const PLAN_LIMITS = {
  FREE: {
    calendars: 1,
    autoScheduledTasks: 15,
    boards: 1,
    mailboxes: 0,
    aiAgent: false,
    planMyDay: false,
    focusStats: false,
    advancedFocusModes: false,
    remindersPerTask: 1,
    bookingPages: 1,
    advancedNudges: false,
    habits: 3,
    goals: false,
    quitHabits: false,
    hubAgents: 2,
    hubOpenItems: 30,
    hubNotes: 100,
    hubHistoryDays: 7,
    hubAttachments: false,
    hubWebhooks: false,
    hubRecurring: false,
  },
  PRO: {
    calendars: null,
    autoScheduledTasks: null,
    boards: null,
    mailboxes: 3,
    aiAgent: true,
    planMyDay: true,
    focusStats: true,
    advancedFocusModes: true,
    remindersPerTask: null,
    bookingPages: null,
    advancedNudges: true,
    habits: null,
    goals: true,
    quitHabits: true,
    hubAgents: null,
    hubOpenItems: null,
    hubNotes: null,
    hubHistoryDays: 90,
    hubAttachments: true,
    hubWebhooks: true,
    hubRecurring: true,
  },
  LIFETIME: {
    calendars: null,
    autoScheduledTasks: null,
    boards: null,
    mailboxes: 3,
    aiAgent: true,
    planMyDay: true,
    focusStats: true,
    advancedFocusModes: true,
    remindersPerTask: null,
    bookingPages: null,
    advancedNudges: true,
    habits: null,
    goals: true,
    quitHabits: true,
    hubAgents: null,
    hubOpenItems: null,
    hubNotes: null,
    hubHistoryDays: 90,
    hubAttachments: true,
    hubWebhooks: true,
    hubRecurring: true,
  },
} as const satisfies Record<SubscriptionPlan, PlanLimits>;
