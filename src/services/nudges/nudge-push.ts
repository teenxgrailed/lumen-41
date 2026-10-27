import {
  getNotificationPrefs,
  shouldAlert,
} from "@/services/notifications/preferences";
import { deliverPush } from "@/services/reminders/reminder-delivery";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getVapidConfiguration } from "@/lib/push-config";

const LOG_SOURCE = "NudgePush";
/** At most this many pushes per person per sweep (every 15 minutes). */
export const MAX_NUDGE_PUSHES_PER_SWEEP = 2;
/** Give the open app this long to show a nudge itself before pushing it. */
const APP_GRACE_MS = 2 * 60_000;
/** A nudge older than this is stale news; it is left to the in-app list. */
const STALE_AFTER_MS = 2 * 60 * 60_000;

/**
 * Pushes the nudges nobody has seen yet. `ProactiveNudge.deliveredAt` is set
 * when the open app's feed shows a nudge, so a nudge still unset after the
 * grace period means the person is away from the app. Only people who switched
 * "Overdue tasks" on, and who have a device subscribed, get anything.
 */
export async function deliverNudgePushes(now = new Date()) {
  if (!getVapidConfiguration().configured) return { pushed: 0 };

  const nudges = await prisma.proactiveNudge.findMany({
    where: {
      deliveredAt: null,
      createdAt: {
        gte: new Date(now.getTime() - STALE_AFTER_MS),
        lte: new Date(now.getTime() - APP_GRACE_MS),
      },
      user: {
        notificationSettings: { is: { nudges: true } },
        pushSubscriptions: { some: {} },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      userId: true,
      title: true,
      body: true,
      deepLink: true,
      user: {
        select: {
          pushSubscriptions: {
            select: { id: true, endpoint: true, p256dh: true, auth: true },
          },
        },
      },
    },
  });

  const byUser = new Map<string, typeof nudges>();
  for (const nudge of nudges) {
    byUser.set(nudge.userId, [...(byUser.get(nudge.userId) ?? []), nudge]);
  }

  let pushed = 0;
  for (const [userId, items] of byUser) {
    // Quiet hours, the digest and the push channel switch keep it in the bell.
    const allowed = shouldAlert(
      await getNotificationPrefs(userId),
      "overdue",
      "push",
      now
    );
    const chosen = allowed ? items.slice(0, MAX_NUDGE_PUSHES_PER_SWEEP) : [];
    let anyDelivered = false;
    for (const nudge of chosen) {
      const results = await Promise.allSettled(
        nudge.user.pushSubscriptions.map((subscription) =>
          deliverPush(subscription, {
            title: nudge.title,
            body: nudge.body,
            url: nudge.deepLink,
          })
        )
      );
      if (
        results.some((result) => result.status === "fulfilled" && result.value)
      ) {
        anyDelivered = true;
        pushed += 1;
      }
    }
    // Everything seen by this sweep is closed out, pushed or not, so the same
    // backlog is never replayed on the next one.
    await prisma.proactiveNudge.updateMany({
      where: { id: { in: items.map((nudge) => nudge.id) }, deliveredAt: null },
      data: { deliveredAt: now },
    });
    if (!anyDelivered && allowed) {
      await logger.warn(
        "Nudges were not pushed to any device",
        { userId, count: items.length },
        LOG_SOURCE
      );
    }
  }
  return { pushed };
}
