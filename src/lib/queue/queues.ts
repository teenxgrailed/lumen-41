import { ConnectionOptions, Queue } from "bullmq";

// Node-only runtime boundary. Next externalizes BullMQ in next.config.js so
// its optional Valkey transport is never traversed by the client bundler.
import { getRedisConnection } from "@/lib/queue/connection";
import {
  AccountLifecycleJobData,
  BugReportSyncJobData,
  CalendarSyncJobData,
  FocusJobData,
  ImportJobData,
  LifetimeCheckoutReconciliationJobData,
  MailSyncJobData,
  NudgeJobData,
  OAuthCleanupJobData,
  QUEUE_NAMES,
  ReminderJobData,
  RescheduleJobData,
  TrialJobData,
  WebhookRenewJobData,
} from "@/lib/queue/types";

let calendarSyncQueue: Queue<CalendarSyncJobData> | null = null;
let rescheduleQueue: Queue<RescheduleJobData> | null = null;
let webhookRenewQueue: Queue<WebhookRenewJobData> | null = null;
let mailSyncQueue: Queue<MailSyncJobData> | null = null;
let bugReportSyncQueue: Queue<BugReportSyncJobData> | null = null;
let reminderQueue: Queue<ReminderJobData> | null = null;
let nudgeQueue: Queue<NudgeJobData> | null = null;
let lifetimeCheckoutReconciliationQueue: Queue<LifetimeCheckoutReconciliationJobData> | null =
  null;
let trialQueue: Queue<TrialJobData> | null = null;
let oauthCleanupQueue: Queue<OAuthCleanupJobData> | null = null;
let accountLifecycleQueue: Queue<AccountLifecycleJobData> | null = null;
let importQueue: Queue<ImportJobData> | null = null;
let focusQueue: Queue<FocusJobData> | null = null;

const defaultJobOptions = {
  attempts: 4,
  backoff: { type: "exponential" as const, delay: 1_000 },
  removeOnComplete: 100,
  removeOnFail: 500,
};

function getBullConnection(): ConnectionOptions {
  // BullMQ and the app can resolve distinct compatible ioredis patch versions,
  // making their nominal class types differ despite the same runtime contract.
  return getRedisConnection() as unknown as ConnectionOptions;
}

export function getCalendarSyncQueue(): Queue<CalendarSyncJobData> {
  calendarSyncQueue ??= new Queue(QUEUE_NAMES.calendarSync, {
    connection: getBullConnection(),
    defaultJobOptions,
  });
  return calendarSyncQueue;
}

export function getRescheduleQueue(): Queue<RescheduleJobData> {
  rescheduleQueue ??= new Queue(QUEUE_NAMES.reschedule, {
    connection: getBullConnection(),
    defaultJobOptions,
  });
  return rescheduleQueue;
}

export function getWebhookRenewQueue(): Queue<WebhookRenewJobData> {
  webhookRenewQueue ??= new Queue(QUEUE_NAMES.webhookRenew, {
    connection: getBullConnection(),
    defaultJobOptions,
  });
  return webhookRenewQueue;
}

export function getMailSyncQueue(): Queue<MailSyncJobData> {
  mailSyncQueue ??= new Queue(QUEUE_NAMES.mailSync, {
    connection: getBullConnection(),
    defaultJobOptions,
  });
  return mailSyncQueue;
}

export function getBugReportSyncQueue(): Queue<BugReportSyncJobData> {
  bugReportSyncQueue ??= new Queue(QUEUE_NAMES.bugReportSync, {
    connection: getBullConnection(),
    defaultJobOptions,
  });
  return bugReportSyncQueue;
}

export function getReminderQueue(): Queue<ReminderJobData> {
  reminderQueue ??= new Queue(QUEUE_NAMES.reminders, {
    connection: getBullConnection(),
    defaultJobOptions,
  });
  return reminderQueue;
}

export function getNudgeQueue(): Queue<NudgeJobData> {
  nudgeQueue ??= new Queue(QUEUE_NAMES.nudges, {
    connection: getBullConnection(),
    defaultJobOptions,
  });
  return nudgeQueue;
}

export function getLifetimeCheckoutReconciliationQueue(): Queue<LifetimeCheckoutReconciliationJobData> {
  lifetimeCheckoutReconciliationQueue ??= new Queue(
    QUEUE_NAMES.lifetimeCheckoutReconciliation,
    {
      connection: getBullConnection(),
      defaultJobOptions,
    }
  );
  return lifetimeCheckoutReconciliationQueue;
}

export function getTrialQueue(): Queue<TrialJobData> {
  trialQueue ??= new Queue(QUEUE_NAMES.trials, {
    connection: getBullConnection(),
    defaultJobOptions,
  });
  return trialQueue;
}

export function getOAuthCleanupQueue(): Queue<OAuthCleanupJobData> {
  oauthCleanupQueue ??= new Queue(QUEUE_NAMES.oauthCleanup, {
    connection: getBullConnection(),
    defaultJobOptions,
  });
  return oauthCleanupQueue;
}

export function getAccountLifecycleQueue(): Queue<AccountLifecycleJobData> {
  accountLifecycleQueue ??= new Queue(QUEUE_NAMES.accountLifecycle, {
    connection: getBullConnection(),
    defaultJobOptions,
  });
  return accountLifecycleQueue;
}

export function getImportQueue(): Queue<ImportJobData> {
  // One attempt: a run records its own failure, and its token is wiped when
  // it ends, so a blind retry would have nothing to authenticate with.
  importQueue ??= new Queue(QUEUE_NAMES.imports, {
    connection: getBullConnection(),
    defaultJobOptions: { ...defaultJobOptions, attempts: 1 },
  });
  return importQueue;
}

export function getFocusQueue(): Queue<FocusJobData> {
  // The job id is the session id, so a finished job must not linger and block
  // the next one for the same id (extend, resume).
  focusQueue ??= new Queue(QUEUE_NAMES.focus, {
    connection: getBullConnection(),
    defaultJobOptions: {
      ...defaultJobOptions,
      removeOnComplete: true,
      removeOnFail: 50,
    },
  });
  return focusQueue;
}

export async function closeQueues(): Promise<void> {
  const queues = [
    calendarSyncQueue,
    rescheduleQueue,
    webhookRenewQueue,
    mailSyncQueue,
    bugReportSyncQueue,
    reminderQueue,
    nudgeQueue,
    lifetimeCheckoutReconciliationQueue,
    trialQueue,
    oauthCleanupQueue,
    accountLifecycleQueue,
    importQueue,
    focusQueue,
  ].filter((queue): queue is Queue => queue !== null);
  await Promise.all(queues.map((queue) => queue.close()));
  calendarSyncQueue = null;
  rescheduleQueue = null;
  webhookRenewQueue = null;
  mailSyncQueue = null;
  bugReportSyncQueue = null;
  reminderQueue = null;
  nudgeQueue = null;
  lifetimeCheckoutReconciliationQueue = null;
  trialQueue = null;
  oauthCleanupQueue = null;
  accountLifecycleQueue = null;
  importQueue = null;
  focusQueue = null;
}
