import * as Sentry from "@sentry/node";

import { APP_NAME } from "@/lib/app-config";
import { EmailService } from "@/lib/email/email-service";
import { logger } from "@/lib/logger";
import { getRedisConnection } from "@/lib/queue/connection";

const LOG_SOURCE = "OperationsAlerts";

export type AlertLevel = "warning" | "critical";

/** One alert per key and level per five minutes, across web and worker. */
const DEDUPE_SECONDS = 300;

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ENTITIES[char] ?? char);
}

export function alertRecipient(): string | null {
  return process.env.NEEDT_ALERT_EMAIL?.trim() || null;
}

async function claimAlertSlot(key: string, level: AlertLevel) {
  try {
    const acquired = await getRedisConnection().set(
      `needt:operations-alert:${key}:${level}`,
      "1",
      "EX",
      DEDUPE_SECONDS,
      "NX"
    );
    return Boolean(acquired);
  } catch (error) {
    // Redis being unreachable is itself worth hearing about, so let the alert
    // through rather than swallowing it with the deduplication.
    void logger.warn(
      "Alert deduplication unavailable; sending anyway",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return true;
  }
}

async function emailOwner(level: AlertLevel, message: string) {
  const to = alertRecipient();
  if (!to) return;
  const subject = `${APP_NAME} ${level === "critical" ? "critical" : "warning"}: ${message.slice(0, 80)}`;
  try {
    await EmailService.sendEmail({
      to,
      subject,
      text: message,
      html: `<p>${escapeHtml(message)}</p>`,
    });
  } catch (error) {
    void logger.error(
      "Failed to deliver an operations alert by email",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
  }
}

/**
 * Raise an operational alert on every channel the owner actually reads.
 *
 * Sentry already received these; a dashboard nobody opens is not an alert.
 * Critical alerts also go to `NEEDT_ALERT_EMAIL` through the same Resend
 * sender the product uses. Warnings stay in Sentry — paging on a two-minute
 * queue backlog teaches the owner to ignore the channel.
 *
 * Deduplication is shared, so the web container and the worker observing the
 * same fault send one message between them, not two.
 */
export async function raiseOperationsAlert(
  key: string,
  level: AlertLevel,
  message: string
): Promise<boolean> {
  if (!(await claimAlertSlot(key, level))) return false;

  Sentry.captureMessage(message, level === "critical" ? "fatal" : "warning");
  void logger.warn("Operations alert", { key, level, message }, LOG_SOURCE);
  if (level === "critical") await emailOwner(level, message);
  return true;
}
