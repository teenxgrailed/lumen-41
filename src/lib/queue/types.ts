export const QUEUE_NAMES = {
  calendarSync: "calendar-sync",
  reschedule: "reschedule",
  webhookRenew: "webhook-renew",
  mailSync: "mail-sync",
  bugReportSync: "bug-report-sync",
  reminders: "reminders",
  nudges: "nudges",
  lifetimeCheckoutReconciliation: "lifetime-checkout-reconciliation",
  trials: "trials",
  accountLifecycle: "account-lifecycle",
  imports: "imports",
  oauthCleanup: "oauth-cleanup",
  focus: "focus",
} as const;

export type CalendarWebhookProvider = "GOOGLE" | "OUTLOOK";

export interface CalendarSyncJobData {
  feedId: string;
}

export interface RescheduleJobData {
  userId: string;
  runId?: string;
}

export interface WebhookRenewJobData {
  provider?: CalendarWebhookProvider;
  feedId?: string;
}

export interface MailSyncJobData {
  accountId: string;
}

export interface BugReportSyncJobData {
  reportId?: string;
}

export type ReminderJobData =
  | { kind: "sweep" }
  | { kind: "deliver"; reminderId: string };

/** A delayed job per running Focus session, due at its planned end. */
export interface FocusJobData {
  kind: "ended";
  sessionId: string;
}

export interface NudgeJobData {
  kind: "sweep";
}

export interface LifetimeCheckoutReconciliationJobData {
  kind: "sweep";
}

export interface TrialJobData {
  kind: "sweep";
}

export interface OAuthCleanupJobData {
  kind: "sweep";
}

export type AccountLifecycleJobData =
  | { kind: "export"; requestId: string }
  | { kind: "delete"; requestId: string }
  | { kind: "sweep" };

/**
 * A run carries only its id: the source token is read from the run row,
 * never queued. The sweep fails runs a lost worker left behind.
 */
export type ImportJobData = { importRunId: string } | { kind: "sweep" };
