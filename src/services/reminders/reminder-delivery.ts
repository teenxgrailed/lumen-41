import { ReminderDeliveryStatus, TaskReminderKind } from "@prisma/client";

import { EmailService } from "@/lib/email/email-service";
import { getReminderTemplate } from "@/lib/email/templates/notifications";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { VapidVariableName, getVapidConfiguration } from "@/lib/push-config";

import {
  getNotificationPrefs,
  shouldAlert,
} from "../notifications/preferences";
import { reminderFireTime } from "./reminder-time";
import { reminderLink, reminderTitle } from "./reminders";

const LOG_SOURCE = "ReminderDelivery";
const RETRY_AFTER_MS = 5 * 60_000;
let hasWarnedAboutMissingVapidConfiguration = false;
let missingVapidWarning: Promise<void> | null = null;

export async function warnAboutMissingVapidConfigurationOnce(
  missingVariables: VapidVariableName[]
) {
  if (hasWarnedAboutMissingVapidConfiguration) return;
  if (!missingVapidWarning) {
    missingVapidWarning = logger
      .warn(
        `Web Push delivery is unavailable; missing environment variables: ${missingVariables.join(", ")}`,
        { missingVariables },
        LOG_SOURCE
      )
      .then(() => {
        hasWarnedAboutMissingVapidConfiguration = true;
      })
      .finally(() => {
        missingVapidWarning = null;
      });
  }
  await missingVapidWarning;
}

export async function warnIfVapidConfigurationIsMissingOnce() {
  const configuration = getVapidConfiguration();
  if (configuration.configured) return;
  await warnAboutMissingVapidConfigurationOnce(configuration.missingVariables);
}

function parseChannels(channels: unknown): Array<"push" | "email"> {
  if (!Array.isArray(channels)) return ["push", "email"];
  return channels.filter(
    (channel): channel is "push" | "email" =>
      channel === "push" || channel === "email"
  );
}

/** Reminders whose task or event is gone, archived or done never fire. */
const LIVE = {
  canceledAt: null,
  deliveredAt: null,
  AND: [
    { OR: [{ taskId: null }, { task: { isArchived: false } }] },
    { OR: [{ eventId: null }, { event: { archivedAt: null } }] },
  ],
};

/**
 * The minute sweep: what is due now and not delivered. The delayed job per
 * reminder normally gets there first; this catches a job that was lost.
 */
export async function findDueReminderIds(now = new Date()) {
  await prisma.taskReminder.updateMany({
    where: {
      deliveryStatus: ReminderDeliveryStatus.DELIVERING,
      lastAttemptAt: { lt: new Date(now.getTime() - 15 * 60_000) },
      deliveredAt: null,
    },
    data: { deliveryStatus: ReminderDeliveryStatus.FAILED },
  });

  const candidates = await prisma.taskReminder.findMany({
    where: {
      ...LIVE,
      OR: [
        { deliveryStatus: ReminderDeliveryStatus.PENDING },
        {
          deliveryStatus: ReminderDeliveryStatus.FAILED,
          lastAttemptAt: { lt: new Date(now.getTime() - RETRY_AFTER_MS) },
        },
      ],
      // Only rows that can have a time: a snooze, an absolute time, a task
      // with a start or deadline, or an event.
      AND: [
        {
          OR: [
            { snoozedUntil: { lte: now } },
            { fireAt: { lte: now } },
            { eventId: { not: null } },
            { task: { scheduledStart: { not: null } } },
            { task: { deadline: { not: null } } },
            { task: { dueDate: { not: null } } },
          ],
        },
      ],
    },
    include: {
      task: {
        select: { scheduledStart: true, deadline: true, dueDate: true },
      },
      event: { select: { start: true } },
      user: { select: { userSettings: { select: { timeZone: true } } } },
    },
    orderBy: { updatedAt: "asc" },
    take: 500,
  });

  return candidates
    .filter((reminder) => {
      const target = reminderFireTime(
        reminder,
        reminder.user.userSettings?.timeZone ?? "UTC"
      );
      return target !== null && target <= now;
    })
    .map((reminder) => reminder.id);
}

export async function deliverPush(
  subscription: {
    id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  },
  payload: {
    title: string;
    body: string;
    url: string;
    /** A Focus-ended push for a task: the service worker adds "Mark done". */
    taskId?: string;
  }
) {
  const configuration = getVapidConfiguration();
  if (!configuration.configured) {
    await warnAboutMissingVapidConfigurationOnce(
      configuration.missingVariables
    );
    return false;
  }

  // This standards-based push helper is ESM-only. Keep the import dynamic so
  // the CommonJS BullMQ worker can load it without bundling top-level await.
  const { buildPushPayload } = await import("@block65/webcrypto-web-push");
  const request = await buildPushPayload(
    {
      data: payload,
      options: { ttl: 15 * 60 },
    },
    {
      endpoint: subscription.endpoint,
      expirationTime: null,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    },
    {
      subject: configuration.subject,
      publicKey: configuration.publicKey,
      privateKey: configuration.privateKey,
    }
  );
  const response = await fetch(subscription.endpoint, request);
  if (response.status === 404 || response.status === 410) {
    await prisma.pushSubscription.deleteMany({
      where: { id: subscription.id },
    });
    await logger.info(
      "Removed dead push subscription",
      { status: response.status, host: new URL(subscription.endpoint).host },
      LOG_SOURCE
    );
    return false;
  }
  if (!response.ok) {
    await logger.error(
      "Push provider rejected a message",
      { status: response.status, host: new URL(subscription.endpoint).host },
      LOG_SOURCE
    );
    throw new Error(`Push provider returned ${response.status}`);
  }
  return true;
}

/** Early by this much is still on time: a delayed job can wake a little early. */
const EARLY_MS = 5_000;

export async function deliverTaskReminder(
  reminderId: string,
  now = new Date()
) {
  const peek = await prisma.taskReminder.findUnique({
    where: { id: reminderId },
    include: {
      task: {
        select: {
          scheduledStart: true,
          deadline: true,
          dueDate: true,
          status: true,
        },
      },
      event: { select: { start: true } },
      user: { select: { userSettings: { select: { timeZone: true } } } },
    },
  });
  if (!peek || peek.deliveredAt || peek.canceledAt) {
    return { delivered: false, skipped: true };
  }
  const timeZone = peek.user.userSettings?.timeZone ?? "UTC";
  const target = reminderFireTime(peek, timeZone);
  // A job scheduled for a time the task has since moved away from.
  if (!target || target.getTime() > now.getTime() + EARLY_MS) {
    return { delivered: false, skipped: true };
  }
  // Done tasks are not reminded about; the reminder is closed with them.
  if (peek.task?.status === "completed") {
    await prisma.taskReminder.update({
      where: { id: reminderId },
      data: { canceledAt: now },
    });
    return { delivered: false, skipped: true };
  }

  const claimed = await prisma.taskReminder.updateMany({
    where: {
      id: reminderId,
      deliveredAt: null,
      canceledAt: null,
      deliveryStatus: {
        in: [ReminderDeliveryStatus.PENDING, ReminderDeliveryStatus.FAILED],
      },
    },
    data: {
      deliveryStatus: ReminderDeliveryStatus.DELIVERING,
      lastAttemptAt: now,
      attemptCount: { increment: 1 },
      lastError: null,
    },
  });
  if (claimed.count === 0) return { delivered: false, skipped: true };

  const reminder = await prisma.taskReminder.findUnique({
    where: { id: reminderId },
    include: {
      task: { select: { id: true, title: true, isArchived: true } },
      event: { select: { id: true, title: true, archivedAt: true } },
      user: {
        select: {
          email: true,
          emailVerified: true,
          pushSubscriptions: true,
        },
      },
    },
  });
  if (!reminder) return { delivered: false, skipped: true };
  if (reminder.task?.isArchived || reminder.event?.archivedAt) {
    await prisma.taskReminder.update({
      where: { id: reminder.id },
      data: { deliveryStatus: ReminderDeliveryStatus.PENDING },
    });
    return { delivered: false, skipped: true };
  }

  const prefs = await getNotificationPrefs(reminder.userId);
  const channels = parseChannels(reminder.channels);
  const title = reminderTitle(reminder);
  const payload = {
    title:
      reminder.kind === TaskReminderKind.AT_TIME || reminder.snoozedUntil
        ? "Reminder"
        : reminder.eventId
          ? "Event starts soon"
          : reminder.kind === TaskReminderKind.BEFORE_START
            ? "Task starts soon"
            : "Deadline approaching",
    body: title,
    url: reminderLink(reminder),
    ...(reminder.taskId ? { taskId: reminder.taskId } : {}),
  };

  try {
    // The bell shows it whatever happens here (the feed reads fired
    // reminders); these are the interruptions Settings allow right now.
    const pushAllowed =
      channels.includes("push") && shouldAlert(prefs, "reminder", "push", now);
    const emailAllowed = shouldAlert(prefs, "reminder", "email", now);
    let pushDelivered = false;
    if (pushAllowed) {
      const results = await Promise.allSettled(
        reminder.user.pushSubscriptions.map((subscription) =>
          deliverPush(subscription, payload)
        )
      );
      pushDelivered = results.some(
        (result) => result.status === "fulfilled" && result.value
      );
    }

    // Email is both an explicit channel and the fallback when web push is
    // unavailable (notably iOS browsers without an installed PWA).
    if (
      emailAllowed &&
      reminder.user.email &&
      reminder.user.emailVerified &&
      (channels.includes("email") || (pushAllowed && !pushDelivered))
    ) {
      await EmailService.sendEmail({
        to: reminder.user.email,
        ...getReminderTemplate({
          title: `${payload.title}: ${title}`,
          body: payload.body,
          openUrl: `${process.env.NEXTAUTH_URL ?? ""}${payload.url}`,
        }),
      });
    }

    await prisma.taskReminder.update({
      where: { id: reminder.id },
      data: {
        deliveryStatus: ReminderDeliveryStatus.DELIVERED,
        deliveredAt: now,
        lastError: null,
      },
    });
    return { delivered: true, skipped: false };
  } catch (error) {
    const message =
      error instanceof Error ? error.message.slice(0, 500) : "Delivery failed";
    await prisma.taskReminder.update({
      where: { id: reminder.id },
      data: {
        deliveryStatus: ReminderDeliveryStatus.FAILED,
        lastError: message,
      },
    });
    await logger.error(
      "Task reminder delivery failed",
      { reminderId, error: message },
      LOG_SOURCE
    );
    throw error;
  }
}
