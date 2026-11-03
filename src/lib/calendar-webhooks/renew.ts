import { calendarProviderNeedsReconnect } from "@/lib/calendar-connection-status";
import {
  listCalendarWebhooks,
  listPushEnabledCalendarFeeds,
  recordCalendarFeedSyncFailure,
} from "@/lib/calendar-db";
import {
  GoogleWatchIneligibleError,
  GoogleWatchUnsupportedError,
  disableGoogleWatch,
  registerGoogleWatch,
} from "@/lib/calendar-webhooks/google";
import {
  registerOutlookSubscription,
  renewOutlookSubscription,
} from "@/lib/calendar-webhooks/outlook";
import { addMinutes, isBefore, newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { CalendarWebhookProvider } from "@/lib/queue/types";

const LOG_SOURCE = "CalendarWebhookRenewal";
const RENEWAL_WINDOW_MINUTES = 12 * 60;

/**
 * Thrown once at the end of a run when feeds failed for a reason a retry could
 * fix. The name is fixed and the message carries only a count (no feed ids or
 * user data) so error tracking groups every run into one issue.
 */
export class CalendarWebhookRenewalError extends Error {
  constructor(count: number) {
    super(`Calendar webhook renewal failed for ${count} feed(s)`);
    this.name = "CalendarWebhookRenewalError";
  }
}

/**
 * Permanent, already-recorded outcomes: Google cannot push for the calendar
 * (marked on the feed and logged once where it happened) or the feed is not
 * eligible (disabled). Neither is a job failure.
 */
function isExpectedWatchOutcome(error: unknown): boolean {
  return (
    error instanceof GoogleWatchUnsupportedError ||
    error instanceof GoogleWatchIneligibleError
  );
}

function inBackoff(nextAttemptAt: Date | null | undefined, now: Date) {
  return Boolean(nextAttemptAt && nextAttemptAt.getTime() > now.getTime());
}

export async function renewCalendarWebhooks(options?: {
  provider?: CalendarWebhookProvider;
  feedId?: string;
}) {
  const webhooks = await listCalendarWebhooks(options);
  const now = newDate();
  const renewalDeadline = addMinutes(now, RENEWAL_WINDOW_MINUTES);
  const results: Array<{ feedId: string; provider: string; renewed: boolean }> =
    [];
  // One broken feed must not stop the rest from renewing: collect and throw
  // once at the end so the job still fails (and retries) visibly.
  const failures: Array<{ feedId: string; provider: string; error: unknown }> =
    [];

  for (const webhook of webhooks) {
    const forced = Boolean(options?.feedId);
    // Disabled or push-unsupported feeds hold no live watch worth renewing.
    // Clean up the row (and its Google channel) once instead of skipping it
    // on every run.
    if (
      !forced &&
      webhook.feed &&
      (!webhook.feed.enabled || webhook.feed.pushUnsupportedAt)
    ) {
      if (webhook.provider === "GOOGLE") {
        try {
          await disableGoogleWatch(webhook.feedId);
        } catch (error) {
          await logger.warn(
            "Could not clean up webhook of a disabled or push-unsupported feed",
            {
              feedId: webhook.feedId,
              error: error instanceof Error ? error.message : String(error),
            },
            LOG_SOURCE
          );
        }
      }
      results.push({
        feedId: webhook.feedId,
        provider: webhook.provider,
        renewed: false,
      });
      continue;
    }
    if (!forced && !isBefore(webhook.expiration, renewalDeadline)) {
      results.push({
        feedId: webhook.feedId,
        provider: webhook.provider,
        renewed: false,
      });
      continue;
    }
    // Backing off (a failed sync, or a sign-in that needs a reconnect): do not
    // retry every run. An explicit single-feed request still goes through.
    if (!forced && inBackoff(webhook.feed?.nextSyncAttemptAt, now)) {
      results.push({
        feedId: webhook.feedId,
        provider: webhook.provider,
        renewed: false,
      });
      continue;
    }

    try {
      if (webhook.provider === "GOOGLE") {
        await registerGoogleWatch(webhook.feedId);
      } else if (webhook.provider === "OUTLOOK") {
        await renewOutlookSubscription(webhook.feedId);
      }
      results.push({
        feedId: webhook.feedId,
        provider: webhook.provider,
        renewed: true,
      });
    } catch (error) {
      if (isExpectedWatchOutcome(error)) continue;
      if (await handleReconnectFailure(webhook.feedId, webhook.provider, error))
        continue;
      await logger.error(
        "Calendar webhook renewal failed",
        {
          feedId: webhook.feedId,
          provider: webhook.provider,
          error: error instanceof Error ? error.message : String(error),
        },
        LOG_SOURCE
      );
      failures.push({
        feedId: webhook.feedId,
        provider: webhook.provider,
        error,
      });
    }
  }

  if (options?.feedId && webhooks.length === 0) {
    if (options.provider === "GOOGLE") {
      await registerGoogleWatch(options.feedId);
    } else if (options.provider === "OUTLOOK") {
      await registerOutlookSubscription(options.feedId);
    }
  }

  if (!options?.feedId) {
    const feeds = await listPushEnabledCalendarFeeds();
    for (const feed of feeds.filter(
      (candidate) => candidate.webhooks.length === 0
    )) {
      if (options?.provider && feed.type !== options.provider) continue;
      if (inBackoff(feed.nextSyncAttemptAt, now)) continue;
      try {
        if (feed.type === "GOOGLE") {
          await registerGoogleWatch(feed.id);
        } else if (feed.type === "OUTLOOK") {
          await registerOutlookSubscription(feed.id);
        }
        results.push({ feedId: feed.id, provider: feed.type, renewed: true });
      } catch (error) {
        if (isExpectedWatchOutcome(error)) continue;
        if (await handleReconnectFailure(feed.id, feed.type, error)) continue;
        await logger.error(
          "Calendar webhook registration failed",
          {
            feedId: feed.id,
            provider: feed.type,
            error: error instanceof Error ? error.message : String(error),
          },
          LOG_SOURCE
        );
        failures.push({ feedId: feed.id, provider: feed.type, error });
      }
    }
  }

  if (failures.length > 0) {
    throw new CalendarWebhookRenewalError(failures.length);
  }

  return results;
}

/**
 * A revoked or expired sign-in cannot be fixed by retrying. Record it on the
 * feed (the account then shows "needs reconnect" and the sweeps back off) and
 * report it as handled, so it is not a job failure.
 */
async function handleReconnectFailure(
  feedId: string,
  provider: string,
  error: unknown
): Promise<boolean> {
  if (!calendarProviderNeedsReconnect(error)) return false;
  await recordCalendarFeedSyncFailure(feedId, error);
  await logger.warn(
    "Calendar webhook renewal skipped: the account needs to reconnect",
    { feedId, provider },
    LOG_SOURCE
  );
  return true;
}
