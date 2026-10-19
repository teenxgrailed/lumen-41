import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import {
  getAccountLifecycleQueue,
  getBugReportSyncQueue,
  getCalendarSyncQueue,
  getFocusQueue,
  getImportQueue,
  getMailSyncQueue,
  getReminderQueue,
  getRescheduleQueue,
  getWebhookRenewQueue,
} from "@/lib/queue/queues";
import { CalendarWebhookProvider } from "@/lib/queue/types";

const LOG_SOURCE = "QueueEnqueue";
let reportedMissingRedis = false;

export function isQueueConfigured(): boolean {
  return Boolean(process.env.REDIS_URL?.trim());
}

async function skipWhenUnconfigured(operation: string) {
  if (isQueueConfigured()) return false;
  if (!reportedMissingRedis) {
    reportedMissingRedis = true;
    await logger.info(
      "Queue operation skipped because Redis is not configured",
      { operation },
      LOG_SOURCE
    );
  }
  return true;
}

export async function enqueueCalendarSync(feedId: string) {
  if (await skipWhenUnconfigured("calendar-sync")) return null;
  return getCalendarSyncQueue().add(
    "sync-feed",
    { feedId },
    { jobId: `calendar-sync-${feedId}` }
  );
}

export async function enqueueReschedule(userId: string, runId?: string) {
  if (await skipWhenUnconfigured("reschedule")) return null;
  return getRescheduleQueue().add(
    "reschedule-user",
    { userId, runId },
    { jobId: runId ? `reschedule-run-${runId}` : `reschedule-${userId}` }
  );
}

export async function enqueueWebhookRenew(options?: {
  provider?: CalendarWebhookProvider;
  feedId?: string;
}) {
  if (await skipWhenUnconfigured("webhook-renew")) return null;
  const provider = options?.provider ?? "ALL";
  const feedId = options?.feedId ?? "all";
  return getWebhookRenewQueue().add("renew-webhooks", options ?? {}, {
    jobId: `webhook-renew-${provider}-${feedId}`,
  });
}

export async function enqueueMailSync(accountId: string) {
  if (await skipWhenUnconfigured("mail-sync")) return null;
  return getMailSyncQueue().add(
    "sync-account",
    { accountId },
    {
      jobId: `mail-sync-${accountId}`,
      removeOnComplete: true,
      removeOnFail: 50,
    }
  );
}

export async function ensureMailSyncSchedule(accountId: string) {
  if (await skipWhenUnconfigured("mail-sync-schedule")) return null;
  return getMailSyncQueue().upsertJobScheduler(
    `mail-sync-account-${accountId}`,
    { every: 5 * 60 * 1_000 },
    { name: "sync-account", data: { accountId } }
  );
}

export async function removeMailSyncSchedule(accountId: string) {
  if (await skipWhenUnconfigured("mail-sync-schedule-remove")) return false;
  return getMailSyncQueue().removeJobScheduler(
    `mail-sync-account-${accountId}`
  );
}

export async function enqueueBugReportSync(reportId: string) {
  if (await skipWhenUnconfigured("bug-report-sync")) return null;
  return getBugReportSyncQueue().add(
    "sync-report",
    { reportId },
    {
      jobId: `bug-report-sync-${reportId}`,
      attempts: 6,
      backoff: { type: "exponential", delay: 30_000 },
    }
  );
}

export async function enqueueReminderDelivery(reminderId: string) {
  if (await skipWhenUnconfigured("reminder-delivery")) return null;
  return getReminderQueue().add(
    "deliver-reminder",
    { kind: "deliver", reminderId },
    {
      jobId: `reminder-${reminderId}`,
      attempts: 6,
      backoff: { type: "exponential", delay: 30_000 },
    }
  );
}

export async function enqueueAccountExport(requestId: string) {
  if (await skipWhenUnconfigured("account-export")) return null;
  return getAccountLifecycleQueue().add(
    "generate-account-export",
    { kind: "export", requestId },
    { jobId: `account-export-${requestId}` }
  );
}

export async function enqueueAccountDeletion(
  requestId: string,
  scheduledFor: Date
) {
  if (await skipWhenUnconfigured("account-deletion")) return null;
  const delay = Math.max(0, scheduledFor.getTime() - newDate().getTime());
  return getAccountLifecycleQueue().add(
    "delete-account",
    { kind: "delete", requestId },
    {
      jobId: `account-deletion-${requestId}-${scheduledFor.getTime()}`,
      delay,
    }
  );
}

export async function enqueueImportRun(importRunId: string) {
  if (await skipWhenUnconfigured("imports")) return null;
  return getImportQueue().add(
    "run-import",
    { importRunId },
    { jobId: `import-${importRunId}` }
  );
}

/** One job per session; the id is what makes scheduling it twice a no-op. */
export function focusEndJobId(sessionId: string) {
  return `focus-end-${sessionId}`;
}

/**
 * Schedule (or move) the "Focus ended" job to `endsAt`. A delayed job cannot
 * be edited, so an existing one is removed first; the worker also re-checks
 * the session when it fires, so a job that could not be removed is harmless.
 */
export async function scheduleFocusEnd(sessionId: string, endsAt: Date) {
  if (await skipWhenUnconfigured("focus-end")) return null;
  const queue = getFocusQueue();
  const jobId = focusEndJobId(sessionId);
  await (await queue.getJob(jobId))?.remove().catch(() => undefined);
  return queue.add(
    "focus-ended",
    { kind: "ended", sessionId },
    {
      jobId,
      delay: Math.max(0, endsAt.getTime() - newDate().getTime()),
      attempts: 4,
      backoff: { type: "exponential", delay: 30_000 },
    }
  );
}

export async function cancelFocusEnd(sessionId: string) {
  if (await skipWhenUnconfigured("focus-end-cancel")) return false;
  const job = await getFocusQueue().getJob(focusEndJobId(sessionId));
  if (!job) return false;
  await job.remove().catch(() => undefined);
  return true;
}
