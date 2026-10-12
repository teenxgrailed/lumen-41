import { randomBytes, randomUUID } from "node:crypto";

import {
  deleteCalendarWebhook,
  getCalendarFeedForSync,
  getCalendarWebhookForFeed,
  upsertCalendarWebhook,
} from "@/lib/calendar-db";
import { getWebhookBaseUrl } from "@/lib/calendar-webhooks/config";
import { addDays, newDate } from "@/lib/date-utils";
import { getGoogleCalendarClient } from "@/lib/google-calendar";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "GoogleCalendarWebhooks";

export async function registerGoogleWatch(feedId: string) {
  const feed = await getCalendarFeedForSync(feedId);
  if (
    !feed ||
    feed.type !== "GOOGLE" ||
    !feed.url ||
    !feed.accountId ||
    !feed.userId ||
    !feed.enabled
  ) {
    throw new Error("Google feed is not eligible for push notifications.");
  }

  const calendar = await getGoogleCalendarClient(feed.accountId, feed.userId);
  const existing = await getCalendarWebhookForFeed("GOOGLE", feedId);

  const channelId = randomUUID();
  const channelToken = randomBytes(32).toString("hex");
  const requestedExpiration = addDays(newDate(), 6);
  const response = await calendar.events.watch({
    calendarId: feed.url,
    requestBody: {
      id: channelId,
      type: "web_hook",
      address: `${getWebhookBaseUrl()}/api/webhooks/google`,
      token: channelToken,
      expiration: String(requestedExpiration.getTime()),
    },
  });

  if (!response.data.resourceId) {
    throw new Error("Google did not return a watch resource ID.");
  }

  const expiration = response.data.expiration
    ? newDate(Number(response.data.expiration))
    : requestedExpiration;
  const webhook = await upsertCalendarWebhook({
    provider: "GOOGLE",
    feedId,
    channelId,
    resourceId: response.data.resourceId,
    expiration,
    channelToken,
  });

  if (existing?.channelId && existing.resourceId) {
    try {
      await calendar.channels.stop({
        requestBody: {
          id: existing.channelId,
          resourceId: existing.resourceId,
        },
      });
    } catch (error) {
      await logger.warn(
        "Could not stop previous Google watch channel",
        {
          feedId,
          error: error instanceof Error ? error.message : String(error),
        },
        LOG_SOURCE
      );
    }
  }

  return webhook;
}

export interface DisableWebhookOptions {
  /** Abort the provider call after this many milliseconds. */
  timeoutMs?: number;
  /** False drops only our row and leaves the provider's channel alone. */
  stopRemote?: boolean;
}

export async function disableGoogleWatch(
  feedId: string,
  options: DisableWebhookOptions = {}
): Promise<void> {
  const webhook = await getCalendarWebhookForFeed("GOOGLE", feedId);
  if (!webhook) return;

  if (
    options.stopRemote !== false &&
    webhook.channelId &&
    webhook.resourceId &&
    webhook.feed.accountId &&
    webhook.feed.userId
  ) {
    try {
      const calendar = await getGoogleCalendarClient(
        webhook.feed.accountId,
        webhook.feed.userId
      );
      await calendar.channels.stop(
        {
          requestBody: {
            id: webhook.channelId,
            resourceId: webhook.resourceId,
          },
        },
        options.timeoutMs ? { timeout: options.timeoutMs } : {}
      );
    } catch (error) {
      await logger.warn(
        "Could not stop Google watch while disabling feed",
        {
          feedId,
          error: error instanceof Error ? error.message : String(error),
        },
        LOG_SOURCE
      );
    }
  }
  await deleteCalendarWebhook("GOOGLE", feedId);
}
