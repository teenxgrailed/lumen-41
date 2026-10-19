import { ReminderDeliveryStatus, TaskReminderKind } from "@prisma/client";

import { EmailService } from "@/lib/email/email-service";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { VapidVariableName, getVapidConfiguration } from "@/lib/push-config";

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

function reminderTarget(reminder: {
  kind: TaskReminderKind;
  offsetMinutes: number;
  task: {
    scheduledStart: Date | null;
    deadline: Date | null;
    dueDate: Date | null;
  };
}) {
  const anchor =
    reminder.kind === TaskReminderKind.BEFORE_START
      ? reminder.task.scheduledStart
      : (reminder.task.deadline ?? reminder.task.dueDate);
  return anchor
    ? new Date(anchor.getTime() - reminder.offsetMinutes * 60_000)
    : null;
}

function parseChannels(channels: unknown): Array<"push" | "email"> {
  if (!Array.isArray(channels)) return ["push", "email"];
  return channels.filter(
    (channel): channel is "push" | "email" =>
      channel === "push" || channel === "email"
  );
}

export async function findDueReminderIds(now = new Date()) {
  await prisma.taskReminder.updateMany({
    where: {
      deliveryStatus: ReminderDeliveryStatus.DELIVERING,
      lastAttemptAt: { lt: new Date(now.getTime() - 15 * 60_000) },
      deliveredAt: null,
      task: { isArchived: false },
    },
    data: { deliveryStatus: ReminderDeliveryStatus.FAILED },
  });

  const candidates = await prisma.taskReminder.findMany({
    where: {
      canceledAt: null,
      deliveredAt: null,
      task: { isArchived: false },
      OR: [
        { deliveryStatus: ReminderDeliveryStatus.PENDING },
        {
          deliveryStatus: ReminderDeliveryStatus.FAILED,
          lastAttemptAt: { lt: new Date(now.getTime() - RETRY_AFTER_MS) },
        },
      ],
    },
    include: {
      task: {
        select: {
          scheduledStart: true,
          deadline: true,
          dueDate: true,
        },
      },
    },
    take: 500,
  });

  return candidates
    .filter((reminder) => {
      const target = reminderTarget(reminder);
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

export async function deliverTaskReminder(reminderId: string) {
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
      lastAttemptAt: new Date(),
      attemptCount: { increment: 1 },
      lastError: null,
    },
  });
  if (claimed.count === 0) return { delivered: false, skipped: true };

  const reminder = await prisma.taskReminder.findUnique({
    where: { id: reminderId },
    include: {
      task: { select: { id: true, title: true, isArchived: true } },
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
  if (reminder.task.isArchived) {
    await prisma.taskReminder.update({
      where: { id: reminder.id },
      data: { deliveryStatus: ReminderDeliveryStatus.PENDING },
    });
    return { delivered: false, skipped: true };
  }

  const channels = parseChannels(reminder.channels);
  const payload = {
    title:
      reminder.kind === TaskReminderKind.BEFORE_START
        ? "Task starts soon"
        : "Deadline approaching",
    body: reminder.task.title,
    url: `/today?task=${encodeURIComponent(reminder.task.id)}`,
  };

  try {
    let pushDelivered = false;
    if (channels.includes("push")) {
      const results = await Promise.allSettled(
        reminder.user.pushSubscriptions.map((subscription) =>
          deliverPush(subscription, payload)
        )
      );
      pushDelivered = results.some(
        (result) => result.status === "fulfilled" && result.value
      );
    }

    // Email is both an explicit channel and the reliable fallback when web
    // push is unavailable (notably iOS browsers without an installed PWA).
    if (
      reminder.user.email &&
      reminder.user.emailVerified &&
      (channels.includes("email") || !pushDelivered)
    ) {
      await EmailService.sendEmail({
        to: reminder.user.email,
        subject: `${payload.title}: ${reminder.task.title}`,
        text: `${payload.body}\n\nOpen Needt: ${process.env.NEXTAUTH_URL ?? ""}${payload.url}`,
        html: `<p>${payload.body}</p><p><a href="${process.env.NEXTAUTH_URL ?? ""}${payload.url}">Open in Needt</a></p>`,
      });
    }

    if (
      !pushDelivered &&
      (!reminder.user.email || !reminder.user.emailVerified)
    ) {
      throw new Error("No deliverable push subscription or email");
    }

    await prisma.taskReminder.update({
      where: { id: reminder.id },
      data: {
        deliveryStatus: ReminderDeliveryStatus.DELIVERED,
        deliveredAt: new Date(),
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
