import {
  listCalendarWebhooks,
  listPushEnabledCalendarFeeds,
} from "@/lib/calendar-db";
import { registerGoogleWatch } from "@/lib/calendar-webhooks/google";
import {
  registerOutlookSubscription,
  renewOutlookSubscription,
} from "@/lib/calendar-webhooks/outlook";
import { addMinutes, isBefore, newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { CalendarWebhookProvider } from "@/lib/queue/types";

const LOG_SOURCE = "CalendarWebhookRenewal";
const RENEWAL_WINDOW_MINUTES = 12 * 60;

export async function renewCalendarWebhooks(options?: {
  provider?: CalendarWebhookProvider;
  feedId?: string;
}) {
  const webhooks = await listCalendarWebhooks(options);
  const renewalDeadline = addMinutes(newDate(), RENEWAL_WINDOW_MINUTES);
  const results: Array<{ feedId: string; provider: string; renewed: boolean }> =
    [];
  // One broken feed must not stop the rest from renewing: collect and throw
  // once at the end so the job still fails (and retries) visibly.
  const failures: Array<{ feedId: string; provider: string; error: unknown }> =
    [];

  for (const webhook of webhooks) {
    const forced = Boolean(options?.feedId);
    if (!forced && !isBefore(webhook.expiration, renewalDeadline)) {
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
      try {
        if (feed.type === "GOOGLE") {
          await registerGoogleWatch(feed.id);
        } else if (feed.type === "OUTLOOK") {
          await registerOutlookSubscription(feed.id);
        }
        results.push({ feedId: feed.id, provider: feed.type, renewed: true });
      } catch (error) {
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
    const first = failures[0].error;
    throw new Error(
      `Calendar webhook renewal failed for ${failures.length} feed(s): ${failures
        .map((failure) => failure.feedId)
        .join(", ")}. First error: ${
        first instanceof Error ? first.message : String(first)
      }`
    );
  }

  return results;
}
