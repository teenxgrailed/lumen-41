import { type Job, UnrecoverableError } from "bullmq";

import { logger } from "@/lib/logger";
import {
  getMailAccountSyncError,
  pauseMailAccountSync,
  recordMailSyncError,
} from "@/lib/mail-db";
import { ensureImapIdleWatcher } from "@/lib/mail/imap-idle";
import { syncMailAccount } from "@/lib/mail/sync";
import {
  MAIL_SYNC_ERROR_AUTH,
  MAIL_SYNC_ERROR_TOKEN,
  classifyMailSyncError,
  summarizeError,
} from "@/lib/mail/sync-failure";
import { removeMailSyncSchedule } from "@/lib/queue/enqueue";
import type { MailSyncJobData } from "@/lib/queue/types";

const LOG_SOURCE = "MailSyncWorker";

async function pauseAccount(accountId: string, code: string) {
  await pauseMailAccountSync(accountId, code);
  await removeMailSyncSchedule(accountId);
  await logger.warn(
    "Mail sync paused until the account is reconnected",
    { accountId, reason: code },
    LOG_SOURCE
  );
}

/**
 * Sync one mail account. A sign-in that is gone is permanent: the account is
 * flagged (it shows "reconnect"), its repeat job is removed and BullMQ is told
 * not to retry. A missing token is only probably permanent, so it needs two
 * failed runs in a row. Anything else is thrown as before and retried.
 */
export async function processMailSyncJob(job: Job<MailSyncJobData>) {
  const { accountId } = job.data;
  try {
    await syncMailAccount(accountId);
    await ensureImapIdleWatcher(accountId);
  } catch (error) {
    const kind = classifyMailSyncError(error);
    const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    if (kind === "auth") {
      await pauseAccount(accountId, MAIL_SYNC_ERROR_AUTH);
      throw new UnrecoverableError(summarizeError(error).reason);
    }
    if (kind === "token-unavailable" && lastAttempt) {
      if (
        (await getMailAccountSyncError(accountId)) === MAIL_SYNC_ERROR_TOKEN
      ) {
        await pauseAccount(accountId, MAIL_SYNC_ERROR_TOKEN);
        throw new UnrecoverableError(summarizeError(error).reason);
      }
      await recordMailSyncError(accountId, MAIL_SYNC_ERROR_TOKEN);
    }
    throw error;
  }
}

/**
 * What the failed-job handler logs. The logger drops any key named "error" or
 * containing "message", which is why the cause never reached the Log table;
 * these keys survive. The text is scrubbed and cut to 300 characters.
 */
export function describeFailedJob(
  queue: string,
  job: Job | undefined,
  error: unknown
) {
  const summary = summarizeError(error);
  return {
    queue,
    jobId: job?.id ?? "unknown",
    jobName: job?.name ?? "unknown",
    attemptsMade: job?.attemptsMade ?? 0,
    errorName: summary.name,
    reason: summary.reason,
  };
}
