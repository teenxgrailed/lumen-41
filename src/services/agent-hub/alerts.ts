import {
  getNotificationPrefs,
  shouldAlert,
} from "@/services/notifications/preferences";
import { deliverPush } from "@/services/reminders/reminder-delivery";

import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { TERMINAL_STATUSES } from "./constants";
import type { WorkspaceKey } from "./context";

const LOG_SOURCE = "agent-hub-alerts";

/** Where a hub alert opens: the Agents screen, on that item. */
export const hubItemUrl = (itemId: string) => `/agents?item=${itemId}`;

function oneLine(text: string, max: number) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * The owner has to look at an item (an escalation, or no agent can do it):
 * one push to every device that has a subscription, opening
 * `/agents?item=<id>`. It follows Settings, Notifications like any other
 * system push (channel, quiet hours, digest). The unread badge on the Agents
 * item is the record, so a missed push loses nothing. Never throws: an alert
 * that fails to send must not fail the agent's call.
 *
 * Text from agents is untrusted, so it is flattened and capped before it
 * reaches a lock screen.
 */
export async function pushOwnerAlert(
  userId: string,
  alert: { title: string; body: string; itemId: string }
): Promise<{ sent: number; skipped: boolean }> {
  try {
    const now = newDate();
    const prefs = await getNotificationPrefs(userId);
    if (!shouldAlert(prefs, "system", "push", now)) {
      return { sent: 0, skipped: true };
    }
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
    });
    if (!subscriptions.length) return { sent: 0, skipped: false };
    const payload = {
      title: oneLine(alert.title, 60),
      body: oneLine(alert.body, 140),
      url: hubItemUrl(alert.itemId),
    };
    const results = await Promise.allSettled(
      subscriptions.map((subscription) => deliverPush(subscription, payload))
    );
    return {
      sent: results.filter(
        (result) => result.status === "fulfilled" && result.value
      ).length,
      skipped: false,
    };
  } catch (error) {
    await logger.warn(
      "Could not push an agent hub alert",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return { sent: 0, skipped: false };
  }
}

/** Items with an alert the owner has not opened, and that are still live. */
export function unreadCount(key: WorkspaceKey) {
  return prisma.hubItem.count({
    where: {
      userId: key.userId,
      workspaceId: key.workspaceId,
      ownerUnread: true,
      status: { notIn: [...TERMINAL_STATUSES] },
    },
  });
}

/** The owner opened an item: its alert is read. Does not change the item's version. */
export async function markItemSeen(key: WorkspaceKey, itemId: string) {
  const done = await prisma.hubItem.updateMany({
    where: {
      id: itemId,
      userId: key.userId,
      workspaceId: key.workspaceId,
      ownerUnread: true,
    },
    data: { ownerUnread: false },
  });
  return done.count > 0;
}
