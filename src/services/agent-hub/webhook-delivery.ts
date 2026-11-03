import {
  SafeFetchError,
  assertPublicHttpsUrl,
  guardedLookup,
} from "@/services/imports/safe-fetch";
import { Prisma } from "@prisma/client";
import { createHmac } from "node:crypto";
import https from "node:https";

import { newDate } from "@/lib/date-utils";
import { canUseHubWebhooks } from "@/lib/entitlements";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/security/secret-encryption";

import { HubError } from "./errors";

const LOG_SOURCE = "agent-hub-webhooks";

/** Events an owner can subscribe a webhook to. */
export const HUB_WEBHOOK_EVENTS = [
  "item.created",
  "item.claimed",
  "item.completed",
  "item.escalated",
  "message.created",
] as const;
export type HubWebhookEvent = (typeof HUB_WEBHOOK_EVENTS)[number];

/** Sent only by "send a test event"; never subscribed to. */
export const HUB_WEBHOOK_TEST_EVENT = "webhook.test";

export const WEBHOOK_TIMEOUT_MS = 10_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** Wait before retry n (1-based): 1m, 5m, 30m, 2h, 12h, then the delivery is failed. */
export const WEBHOOK_RETRY_DELAYS_MS = [
  1 * MINUTE,
  5 * MINUTE,
  30 * MINUTE,
  2 * HOUR,
  12 * HOUR,
] as const;
/** The first try plus one per retry delay. */
export const WEBHOOK_MAX_ATTEMPTS = WEBHOOK_RETRY_DELAYS_MS.length + 1;
/** Deliveries in a row that ended failed before the webhook switches itself off. */
export const WEBHOOK_AUTO_DISABLE_AFTER = 20;
const ERROR_MAX = 300;

/** `sha256=<hex HMAC of the raw body>`, the X-Needt-Signature value. */
export function signWebhookBody(secret: string, rawBody: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

/**
 * Delay before the next try after `attemptsMade` tries have failed, or null
 * when the delivery has used all of them.
 */
export function nextRetryDelayMs(attemptsMade: number): number | null {
  if (attemptsMade < 1) return WEBHOOK_RETRY_DELAYS_MS[0];
  return WEBHOOK_RETRY_DELAYS_MS[attemptsMade - 1] ?? null;
}

/** Refuses non-https, credentialed, odd-port and non-public addresses. */
export async function assertWebhookUrl(
  raw: string,
  resolve?: Parameters<typeof assertPublicHttpsUrl>[1]
): Promise<URL> {
  try {
    return await assertPublicHttpsUrl(raw, resolve);
  } catch (error) {
    if (error instanceof SafeFetchError) {
      // One message for every reason: telling "could not be resolved" from
      // "not public" would let a caller probe internal DNS. The reason goes to
      // the log only.
      await logger.info(
        "Hub webhook URL refused",
        { code: error.code, reason: error.message },
        LOG_SOURCE
      );
      throw new HubError(
        "INVALID",
        "Webhook URL refused. Use a public https address on port 443, without a login in the URL.",
        { field: "url" }
      );
    }
    throw error;
  }
}

export interface WebhookResponse {
  status: number;
}
export type WebhookTransport = (
  url: URL,
  options: { body: string; headers: Record<string, string> }
) => Promise<WebhookResponse>;

/**
 * POST with the guarded DNS lookup (the address is checked again at connect
 * time), the 10 s timeout and no redirect following: a 3xx is a failure.
 */
export const httpsWebhookTransport: WebhookTransport = (
  url,
  { body, headers }
) =>
  new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: "POST",
        lookup: guardedLookup as never,
        timeout: WEBHOOK_TIMEOUT_MS,
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
        headers: {
          ...headers,
          "content-length": String(Buffer.byteLength(body)),
        },
      },
      (response) => {
        response.resume();
        resolve({ status: response.statusCode ?? 0 });
      }
    );
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", reject);
    request.end(body);
  });

function describeError(error: unknown): string {
  const text =
    error instanceof SafeFetchError || error instanceof HubError
      ? error.message
      : error instanceof Error
        ? error.message
        : "Request failed.";
  return text.slice(0, ERROR_MAX);
}

export interface DeliveryDeps {
  transport?: WebhookTransport;
  resolve?: Parameters<typeof assertPublicHttpsUrl>[1];
  now?: () => Date;
}

export type DeliveryOutcome =
  | { state: "success" }
  | { state: "retry"; delayMs: number; nextAttemptAt: Date }
  | { state: "failed"; disabled: boolean }
  | { state: "skipped" };

/**
 * One attempt at one delivery. Records the result, schedules the next try (the
 * caller enqueues it) or fails the delivery for good, and switches the webhook
 * off after WEBHOOK_AUTO_DISABLE_AFTER failed deliveries in a row.
 */
export async function attemptDelivery(
  deliveryId: string,
  deps: DeliveryDeps = {}
): Promise<DeliveryOutcome> {
  const now = (deps.now ?? newDate)();
  const delivery = await prisma.hubWebhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { webhook: true },
  });
  if (!delivery || delivery.status !== "pending") return { state: "skipped" };
  const webhook = delivery.webhook;
  const attempts = delivery.attempts + 1;
  // A test is one try and never touches the failure streak of real events.
  const isTest = delivery.event === HUB_WEBHOOK_TEST_EVENT;

  const fail = async (
    error: string,
    lastStatus: number | null
  ): Promise<DeliveryOutcome> => {
    const delayMs = isTest ? null : nextRetryDelayMs(attempts);
    if (delayMs !== null) {
      const nextAttemptAt = new Date(now.getTime() + delayMs);
      await prisma.hubWebhookDelivery.update({
        where: { id: delivery.id },
        data: { attempts, lastError: error, lastStatus, nextAttemptAt },
      });
      return { state: "retry", delayMs, nextAttemptAt };
    }
    await prisma.hubWebhookDelivery.update({
      where: { id: delivery.id },
      data: {
        attempts,
        status: "failed",
        lastError: error,
        lastStatus,
        nextAttemptAt: null,
      },
    });
    if (isTest) return { state: "failed", disabled: false };
    const updated = await prisma.hubWebhook.update({
      where: { id: webhook.id },
      data: { consecutiveFailures: { increment: 1 }, lastDeliveryAt: now },
      select: { consecutiveFailures: true, active: true },
    });
    const disable =
      updated.active &&
      updated.consecutiveFailures >= WEBHOOK_AUTO_DISABLE_AFTER;
    if (disable) {
      await prisma.hubWebhook.update({
        where: { id: webhook.id },
        data: {
          active: false,
          disabledReason: `Switched off after ${WEBHOOK_AUTO_DISABLE_AFTER} failed deliveries in a row. Fix the endpoint and switch it on again.`,
        },
      });
      await logger.warn(
        "Hub webhook switched off after repeated failures",
        { webhookId: webhook.id },
        LOG_SOURCE
      );
    }
    return { state: "failed", disabled: disable };
  };

  // A webhook switched off (or removed from the plan) after the event was
  // queued does not get it.
  if (!webhook.active && !isTest) {
    await prisma.hubWebhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "failed",
        lastError: "Webhook is switched off.",
        nextAttemptAt: null,
      },
    });
    return { state: "skipped" };
  }

  // The plan was checked when the event was queued; a downgrade since then
  // stops it (and its retries) here. Not the endpoint's fault: no strike.
  if (!isTest && !(await canUseHubWebhooks(webhook.userId)).allowed) {
    await prisma.hubWebhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "failed",
        lastError: "Plan has no webhooks.",
        nextAttemptAt: null,
      },
    });
    return { state: "skipped" };
  }

  let secret: string;
  try {
    secret = decryptSecret(webhook.secret);
  } catch {
    return fail("The signing secret could not be read.", null);
  }

  const body = JSON.stringify(delivery.payload);
  try {
    // The address can have changed since it was saved; check again each try.
    const url = await assertWebhookUrl(webhook.url, deps.resolve);
    const response = await (deps.transport ?? httpsWebhookTransport)(url, {
      body,
      headers: {
        "content-type": "application/json",
        "user-agent": "Needt-Webhooks/1",
        "x-needt-event": delivery.event,
        "x-needt-delivery": delivery.id,
        "x-needt-signature": signWebhookBody(secret, body),
      },
    });
    if (response.status >= 200 && response.status < 300) {
      await prisma.hubWebhookDelivery.update({
        where: { id: delivery.id },
        data: {
          attempts,
          status: "success",
          lastError: null,
          lastStatus: response.status,
          nextAttemptAt: null,
        },
      });
      if (!isTest) {
        await prisma.hubWebhook.update({
          where: { id: webhook.id },
          data: { consecutiveFailures: 0, lastDeliveryAt: now },
        });
      }
      return { state: "success" };
    }
    return fail(`The endpoint answered ${response.status}.`, response.status);
  } catch (error) {
    return fail(describeError(error), null);
  }
}

export type WebhookDeliveryRow = {
  id: string;
  event: string;
  status: string;
  attempts: number;
  lastError: string | null;
  lastStatus: number | null;
  nextAttemptAt: string | null;
  createdAt: string;
};

export function deliveryView(
  row: Prisma.HubWebhookDeliveryGetPayload<object>
): WebhookDeliveryRow {
  return {
    id: row.id,
    event: row.event,
    status: row.status,
    attempts: row.attempts,
    lastError: row.lastError,
    lastStatus: row.lastStatus,
    nextAttemptAt: row.nextAttemptAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
