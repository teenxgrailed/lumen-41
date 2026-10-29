/* THE WORKER'S TWO NOTIFICATION SWEEPS (reminder queue, kinds "digest" and
 * "activity"):
 *
 *  - deliverDailyDigests: for people who chose "Daily digest instead of a
 *    stream", one push (and email, if on) at their digest time summing up
 *    what waits in the bell.
 *  - deliverActivityPushes: mentions, shares and system rows (sync problems,
 *    imports) as pushes, for what arrived since the last sweep. Reminders,
 *    overdue nudges and Focus have their own senders.
 *
 * Both read Settings → Notifications through preferences.ts first.
 */
import { deliverPush } from "@/services/reminders/reminder-delivery";

import { newDate } from "@/lib/date-utils";
import { EmailService } from "@/lib/email/email-service";
import { getDigestTemplate } from "@/lib/email/templates/notifications";
import { unsubscribeUrl } from "@/lib/email/unsubscribe";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getVapidConfiguration } from "@/lib/push-config";

import { alertable, digestSummary } from "./alerts";
import { getNotificationFeed } from "./feed";
import { digestDue, getNotificationPrefs, typeOfFeedKind } from "./preferences";

const LOG_SOURCE = "NotificationSweeps";
const USERS_PER_SWEEP = 200;
const PUSHES_PER_PERSON = 3;

type Subscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

async function pushAll(
  subscriptions: Subscription[],
  payload: { title: string; body: string; url: string }
) {
  const results = await Promise.allSettled(
    subscriptions.map((s) => deliverPush(s, payload))
  );
  return results.some((r) => r.status === "fulfilled" && r.value);
}

export async function deliverDailyDigests(now = newDate()) {
  const rows = await prisma.notificationSettings.findMany({
    where: { digest: true },
    take: USERS_PER_SWEEP,
    orderBy: { lastDigestAt: { sort: "asc", nulls: "first" } },
    select: {
      userId: true,
      lastDigestAt: true,
      user: {
        select: {
          email: true,
          emailVerified: true,
          pushSubscriptions: {
            select: { id: true, endpoint: true, p256dh: true, auth: true },
          },
        },
      },
    },
  });
  let sent = 0;
  for (const row of rows) {
    const prefs = await getNotificationPrefs(row.userId);
    if (!digestDue(prefs, row.lastDigestAt, now)) continue;
    // Claimed first, so two workers never send the same morning twice.
    const claimed = await prisma.notificationSettings.updateMany({
      where: { userId: row.userId, lastDigestAt: row.lastDigestAt },
      data: { lastDigestAt: now },
    });
    if (!claimed.count) continue;
    const feed = await getNotificationFeed({
      userId: row.userId,
      group: "activity",
      limit: 100,
      now,
    });
    const summary = digestSummary(feed.items);
    if (!summary) continue;
    try {
      if (
        prefs.channelPush &&
        row.user.pushSubscriptions.length &&
        getVapidConfiguration().configured
      ) {
        await pushAll(row.user.pushSubscriptions, {
          ...summary,
          url: "/today",
        });
      }
      if (
        prefs.emailNotifications &&
        row.user.email &&
        row.user.emailVerified
      ) {
        const link = `${process.env.NEXTAUTH_URL ?? ""}/today`;
        /* Not transactional: the layout's footer and the headers carry a
           one-click unsubscribe that turns the digest off. */
        const unsubscribe = unsubscribeUrl(row.userId, "digest");
        await EmailService.sendEmail({
          to: row.user.email,
          ...getDigestTemplate({
            title: summary.title,
            body: summary.body,
            openUrl: link,
            unsubscribeUrl: unsubscribe,
          }),
          unsubscribeUrl: unsubscribe,
        });
      }
      sent += 1;
    } catch (error) {
      await logger.warn(
        "Daily digest was not delivered",
        {
          userId: row.userId,
          error: error instanceof Error ? error.message : String(error),
        },
        LOG_SOURCE
      );
    }
  }
  return { sent };
}

export async function deliverActivityPushes(now = newDate()) {
  if (!getVapidConfiguration().configured) return { pushed: 0 };
  const rows = await prisma.notificationSettings.findMany({
    where: {
      channelPush: true,
      digest: false,
      OR: [{ mentions: true }, { system: true }],
      user: { pushSubscriptions: { some: {} } },
    },
    take: USERS_PER_SWEEP,
    orderBy: { activityPushedAt: { sort: "asc", nulls: "first" } },
    select: {
      userId: true,
      activityPushedAt: true,
      user: {
        select: {
          pushSubscriptions: {
            select: { id: true, endpoint: true, p256dh: true, auth: true },
          },
        },
      },
    },
  });
  let pushed = 0;
  for (const row of rows) {
    await prisma.notificationSettings.update({
      where: { userId: row.userId },
      data: { activityPushedAt: now },
    });
    // The first sweep for someone only sets the baseline.
    if (!row.activityPushedAt) continue;
    const [prefs, feed] = await Promise.all([
      getNotificationPrefs(row.userId),
      getNotificationFeed({
        userId: row.userId,
        group: "activity",
        limit: 50,
        now,
      }),
    ]);
    const items = alertable(
      feed.items,
      prefs,
      "push",
      row.activityPushedAt,
      now
    )
      .filter((i) => {
        const type = typeOfFeedKind(i.kind);
        return type === "mention" || (type === "system" && i.kind !== "agent");
      })
      .slice(0, PUSHES_PER_PERSON);
    for (const item of items) {
      if (
        await pushAll(row.user.pushSubscriptions, {
          title: item.title,
          body: item.body ?? "",
          url: item.link,
        })
      ) {
        pushed += 1;
      }
    }
  }
  return { pushed };
}
