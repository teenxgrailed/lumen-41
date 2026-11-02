import type { CalendarWebhook } from "@prisma/client";

import { secretsMatch } from "@/lib/cron/auth";

export interface OutlookChangeNotification {
  subscriptionId?: string;
  clientState?: string;
  changeType?: string;
  resource?: string;
}

export function validateGoogleWebhookHeaders(
  headers: Headers,
  webhook: Pick<CalendarWebhook, "channelId" | "resourceId" | "channelToken">
): boolean {
  return (
    Boolean(webhook.channelId) &&
    Boolean(webhook.resourceId) &&
    Boolean(webhook.channelToken) &&
    secretsMatch(headers.get("x-goog-channel-id"), webhook.channelId) &&
    secretsMatch(headers.get("x-goog-resource-id"), webhook.resourceId) &&
    secretsMatch(
      headers.get("x-goog-channel-token"),
      webhook.channelToken
    )
  );
}

export function validateOutlookNotification(
  notification: OutlookChangeNotification,
  webhook: Pick<CalendarWebhook, "subscriptionId" | "clientState">
): boolean {
  return (
    Boolean(webhook.subscriptionId) &&
    Boolean(webhook.clientState) &&
    secretsMatch(notification.subscriptionId, webhook.subscriptionId) &&
    secretsMatch(notification.clientState, webhook.clientState)
  );
}
