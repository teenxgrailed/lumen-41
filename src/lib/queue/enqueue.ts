import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import {
  getAccountLifecycleQueue,
  getBugReportSyncQueue,
  getCalendarSyncQueue,
  getFocusQueue,
  getHubWebhookQueue,
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

/**
 * BullMQ ignores `add` while a job with the same id is still stored, finished
 * jobs included. A fixed id per feed or user therefore stopped every later
 * enqueue once one job had completed or failed. Drop a finished job first; a
 * waiting or running one still dedupes.
 */
async function clearFinishedJob(
  queue: {
    getJob: (id: string) => Promise<
      | {
          isCompleted: () => Promise<boolean>;
          isFailed: () => Promise<boolean>;
          isActive?: () => Promise<boolean>;
          remove: () => Promise<void>;
        }
      | null
      | undefined
    >;
  },
  jobId: string
) {
  const existing = await queue.getJob(jobId);
  if (!existing) return false;
  if ((await existing.isCompleted()) || (await existing.isFailed())) {
    await existing.remove().catch(() => undefined);
    return false;
  }
  return existing.isActive ? await existing.isActive() : false;
}

/** How long a trailing re-run waits, so it starts after the active job ends. */
const TRAILING_RERUN_DELAY_MS = 10_000;

/**
 * A waiting job will read fresh data when it starts, so it can absorb a new
 * request. A job that is already running has read its data and would drop the
 * request on the floor, so the change goes in a single trailing job under a
 * second id, which also dedupes a burst of requests.
 */
async function addOrTrail<T>(
  queue: Parameters<typeof clearFinishedJob>[0] & {
    add: (
      name: string,
      data: T,
      opts: { jobId: string; delay?: number }
    ) => Promise<unknown>;
  },
  name: string,
  data: T,
  jobId: string
) {
  if (await clearFinishedJob(queue, jobId)) {
    const trailingId = `${jobId}-next`;
    await clearFinishedJob(queue, trailingId);
    return queue.add(name, data, {
      jobId: trailingId,
      delay: TRAILING_RERUN_DELAY_MS,
    });
  }
  return queue.add(name, data, { jobId });
}

export async function enqueueCalendarSync(feedId: string) {
  if (await skipWhenUnconfigured("calendar-sync")) return null;
  const queue = getCalendarSyncQueue();
  const jobId = `calendar-sync-${feedId}`;
  return addOrTrail(queue, "sync-feed", { feedId }, jobId);
}

export async function enqueueTaskListSync(mappingId: string) {
  if (await skipWhenUnconfigured("task-list-sync")) return null;
  const queue = getCalendarSyncQueue();
  const jobId = `task-list-sync-${mappingId}`;
  await clearFinishedJob(queue, jobId);
  return queue.add("sync-task-list", { taskMappingId: mappingId }, { jobId });
}

export async function enqueueReschedule(userId: string, runId?: string) {
  if (await skipWhenUnconfigured("reschedule")) return null;
  const queue = getRescheduleQueue();
  const jobId = runId ? `reschedule-run-${runId}` : `reschedule-${userId}`;
  return addOrTrail(queue, "reschedule-user", { userId, runId }, jobId);
}

export async function enqueueWebhookRenew(options?: {
  provider?: CalendarWebhookProvider;
  feedId?: string;
}) {
  if (await skipWhenUnconfigured("webhook-renew")) return null;
  const provider = options?.provider ?? "ALL";
  const feedId = options?.feedId ?? "all";
  const queue = getWebhookRenewQueue();
  const jobId = `webhook-renew-${provider}-${feedId}`;
  await clearFinishedJob(queue, jobId);
  return queue.add("renew-webhooks", options ?? {}, { jobId });
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
  const queue = getReminderQueue();
  // A snoozed or re-armed reminder fires again under the same id.
  await clearFinishedJob(queue, `reminder-${reminderId}`);
  return queue.add(
    "deliver-reminder",
    { kind: "deliver", reminderId },
    {
      jobId: `reminder-${reminderId}`,
      attempts: 6,
      backoff: { type: "exponential", delay: 30_000 },
    }
  );
}

/**
 * A delayed job at the reminder's fire time. The id carries the time, so a
 * moved reminder gets a new job and the old one, when it runs, finds the
 * reminder not due and does nothing (deliverTaskReminder re-checks).
 */
export async function scheduleReminderDelivery(reminderId: string, at: Date) {
  if (await skipWhenUnconfigured("reminder-schedule")) return null;
  const delay = Math.max(0, at.getTime() - newDate().getTime());
  const queue = getReminderQueue();
  const jobId = `reminder-${reminderId}-${at.getTime()}`;
  await clearFinishedJob(queue, jobId);
  return queue.add(
    "deliver-reminder",
    { kind: "deliver", reminderId },
    {
      jobId,
      delay,
      attempts: 6,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: { age: 24 * 3_600 },
      removeOnFail: { age: 7 * 24 * 3_600 },
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

/** Queue one webhook delivery attempt, now or `delayMs` from now. */
export async function enqueueHubWebhookDelivery(
  deliveryId: string,
  attempt: number,
  delayMs = 0
) {
  if (await skipWhenUnconfigured("hub-webhook-delivery")) return null;
  return getHubWebhookQueue().add(
    "deliver",
    { kind: "deliver", deliveryId },
    {
      // One job per attempt: a repeated enqueue of the same attempt is a no-op.
      jobId: `hub-webhook-${deliveryId}-${attempt}`,
      delay: delayMs,
      // A failed job must not keep its id, or the sweep cannot re-queue that attempt.
      removeOnComplete: true,
      removeOnFail: true,
    }
  );
}
