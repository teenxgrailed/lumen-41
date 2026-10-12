import { randomBytes } from "node:crypto";

import {
  deleteCalendarWebhook,
  getCalendarFeedForSync,
  getCalendarWebhookForFeed,
  upsertCalendarWebhook,
} from "@/lib/calendar-db";
import { getWebhookBaseUrl } from "@/lib/calendar-webhooks/config";
import type { DisableWebhookOptions } from "@/lib/calendar-webhooks/google";
import { addMinutes, newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { getOutlookClient } from "@/lib/outlook-calendar";

const LOG_SOURCE = "OutlookCalendarWebhooks";
const OUTLOOK_SUBSCRIPTION_LIFETIME_MINUTES = 4_000;

interface GraphSubscription {
  id: string;
  expirationDateTime: string;
}

function buildExpiration(): Date {
  return addMinutes(newDate(), OUTLOOK_SUBSCRIPTION_LIFETIME_MINUTES);
}

export async function registerOutlookSubscription(feedId: string) {
  const feed = await getCalendarFeedForSync(feedId);
  if (
    !feed ||
    feed.type !== "OUTLOOK" ||
    !feed.url ||
    !feed.accountId ||
    !feed.userId ||
    !feed.enabled
  ) {
    throw new Error("Outlook feed is not eligible for push notifications.");
  }

  const client = await getOutlookClient(feed.accountId, feed.userId);
  const existing = await getCalendarWebhookForFeed("OUTLOOK", feedId);
  if (existing?.subscriptionId) {
    try {
      await client.api(`/subscriptions/${existing.subscriptionId}`).delete();
    } catch (error) {
      await logger.warn(
        "Could not remove previous Outlook subscription",
        {
          feedId,
          error: error instanceof Error ? error.message : String(error),
        },
        LOG_SOURCE
      );
    }
  }

  const clientState = randomBytes(32).toString("hex");
  const requestedExpiration = buildExpiration();
  const subscription = (await client.api("/subscriptions").post({
    changeType: "created,updated,deleted",
    notificationUrl: `${getWebhookBaseUrl()}/api/webhooks/outlook`,
    resource: `/me/calendars/${encodeURIComponent(feed.url)}/events`,
    expirationDateTime: requestedExpiration.toISOString(),
    clientState,
  })) as GraphSubscription;

  if (!subscription.id) {
    throw new Error("Microsoft Graph did not return a subscription ID.");
  }

  return upsertCalendarWebhook({
    provider: "OUTLOOK",
    feedId,
    subscriptionId: subscription.id,
    expiration: subscription.expirationDateTime
      ? newDate(subscription.expirationDateTime)
      : requestedExpiration,
    clientState,
  });
}

export async function renewOutlookSubscription(feedId: string) {
  const webhook = await getCalendarWebhookForFeed("OUTLOOK", feedId);
  if (
    !webhook?.subscriptionId ||
    !webhook.feed.accountId ||
    !webhook.feed.userId
  ) {
    return registerOutlookSubscription(feedId);
  }

  const client = await getOutlookClient(
    webhook.feed.accountId,
    webhook.feed.userId
  );
  const requestedExpiration = buildExpiration();
  try {
    const subscription = (await client
      .api(`/subscriptions/${webhook.subscriptionId}`)
      .patch({
        expirationDateTime: requestedExpiration.toISOString(),
      })) as GraphSubscription;
    return upsertCalendarWebhook({
      provider: "OUTLOOK",
      feedId,
      subscriptionId: webhook.subscriptionId,
      expiration: subscription.expirationDateTime
        ? newDate(subscription.expirationDateTime)
        : requestedExpiration,
      clientState: webhook.clientState ?? undefined,
    });
  } catch (error) {
    await logger.warn(
      "Outlook subscription renewal failed; recreating it",
      {
        feedId,
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    return registerOutlookSubscription(feedId);
  }
}

export async function disableOutlookSubscription(
  feedId: string,
  options: DisableWebhookOptions = {}
): Promise<void> {
  const webhook = await getCalendarWebhookForFeed("OUTLOOK", feedId);
  if (!webhook) return;

  if (
    options.stopRemote !== false &&
    webhook.subscriptionId &&
    webhook.feed.accountId &&
    webhook.feed.userId
  ) {
    try {
      const client = await getOutlookClient(
        webhook.feed.accountId,
        webhook.feed.userId
      );
      const request = client.api(`/subscriptions/${webhook.subscriptionId}`);
      if (options.timeoutMs) {
        request.options({ signal: AbortSignal.timeout(options.timeoutMs) });
      }
      await request.delete();
    } catch (error) {
      await logger.warn(
        "Could not remove Outlook subscription while disabling feed",
        {
          feedId,
          error: error instanceof Error ? error.message : String(error),
        },
        LOG_SOURCE
      );
    }
  }
  await deleteCalendarWebhook("OUTLOOK", feedId);
}
