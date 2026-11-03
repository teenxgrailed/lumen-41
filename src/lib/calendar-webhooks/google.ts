import { randomBytes, randomUUID } from "node:crypto";

import {
  deleteCalendarWebhook,
  getCalendarFeedForSync,
  getCalendarWebhookForFeed,
  markCalendarFeedPushUnsupported,
  upsertCalendarWebhook,
} from "@/lib/calendar-db";
import { getWebhookBaseUrl } from "@/lib/calendar-webhooks/config";
import { addDays, newDate } from "@/lib/date-utils";
import { getGoogleCalendarClient } from "@/lib/google-calendar";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "GoogleCalendarWebhooks";

/** The feed cannot hold a watch right now (disabled, or missing its link). */
export class GoogleWatchIneligibleError extends Error {
  constructor() {
    super("Google feed is not eligible for push notifications.");
    this.name = "GoogleWatchIneligibleError";
  }
}

/** Google will never push for this calendar; the feed has been marked. */
export class GoogleWatchUnsupportedError extends Error {
  constructor() {
    super("Google does not support push notifications for this calendar.");
    this.name = "GoogleWatchUnsupportedError";
  }
}

/**
 * Permanent refusals from events.watch: 400 pushNotSupportedForRequestedResource
 * (holiday, birthday, read-only subscribed calendars) and 404 notFound (the
 * calendar no longer exists). Retrying either can never succeed.
 */
export function isGoogleWatchPermanentRefusal(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    status?: unknown;
    message?: unknown;
    errors?: Array<{ reason?: unknown }>;
    response?: {
      status?: unknown;
      data?: { error?: { errors?: Array<{ reason?: unknown }> } };
    };
  };
  const status = Number(
    candidate.status ?? candidate.response?.status ?? candidate.code
  );
  const reasons = [
    ...(candidate.errors ?? []),
    ...(candidate.response?.data?.error?.errors ?? []),
  ].map((entry) => String(entry?.reason ?? ""));
  if (reasons.includes("pushNotSupportedForRequestedResource")) return true;
  if (
    status === 400 &&
    /push notifications? (are|is) not supported/i.test(
      String(candidate.message ?? "")
    )
  ) {
    return true;
  }
  return (
    status === 404 && (reasons.length === 0 || reasons.includes("notFound"))
  );
}

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
    throw new GoogleWatchIneligibleError();
  }

  const calendar = await getGoogleCalendarClient(feed.accountId, feed.userId);
  const existing = await getCalendarWebhookForFeed("GOOGLE", feedId);

  const channelId = randomUUID();
  const channelToken = randomBytes(32).toString("hex");
  const requestedExpiration = addDays(newDate(), 6);
  let response;
  try {
    response = await calendar.events.watch({
      calendarId: feed.url,
      requestBody: {
        id: channelId,
        type: "web_hook",
        address: `${getWebhookBaseUrl()}/api/webhooks/google`,
        token: channelToken,
        expiration: String(requestedExpiration.getTime()),
      },
    });
  } catch (error) {
    if (!isGoogleWatchPermanentRefusal(error)) throw error;
    await markCalendarFeedPushUnsupported(feedId);
    await logger.info(
      "Google refused push for this calendar; marked it and will not retry",
      { feedId },
      LOG_SOURCE
    );
    throw new GoogleWatchUnsupportedError();
  }

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
