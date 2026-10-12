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

export interface NudgeJobData {
  kind: "sweep";
}

export interface LifetimeCheckoutReconciliationJobData {
  kind: "sweep";
}

export interface TrialJobData {
  kind: "sweep";
}

export type AccountLifecycleJobData =
  | { kind: "export"; requestId: string }
  | { kind: "delete"; requestId: string }
  | { kind: "sweep" };

/** Only the run id: the source token is read from the run row, never queued. */
export interface ImportJobData {
  importRunId: string;
}
