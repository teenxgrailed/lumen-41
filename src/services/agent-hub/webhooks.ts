import type {
  HubItem,
  HubMessage,
  HubThread,
  HubWebhook,
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { z } from "zod";

import { newDate } from "@/lib/date-utils";
import { canUseHubWebhooks } from "@/lib/entitlements";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { enqueueHubWebhookDelivery } from "@/lib/queue/enqueue";
import { encryptSecret } from "@/lib/security/secret-encryption";

import { HubError } from "./errors";
import {
  HUB_WEBHOOK_EVENTS,
  HUB_WEBHOOK_TEST_EVENT,
  type HubWebhookEvent,
  assertWebhookUrl,
  attemptDelivery,
  deliveryView,
} from "./webhook-delivery";

const LOG_SOURCE = "agent-hub-webhooks";

// Structural copies of the scope types in ./context. Importing that module
// from here makes messages.ts and webhooks.ts part of one import cycle, which
// breaks type inference in messages.ts.
type WorkspaceKey = { userId: string; workspaceId: string };
type HubScope = WorkspaceKey & { actor: { kind: string } };

/** Webhooks one workspace can hold. */
export const WEBHOOKS_MAX_PER_WORKSPACE = 10;
export const WEBHOOK_DELIVERIES_SHOWN = 20;
/** A pending delivery whose scheduled time passed this long ago was lost by the queue. */
const SWEEP_GRACE_MS = 2 * 60_000;

export const webhookCreateInput = z.object({
  url: z.string().min(1).max(500),
  events: z
    .array(z.enum(HUB_WEBHOOK_EVENTS))
    .min(1)
    .max(HUB_WEBHOOK_EVENTS.length),
});
export const webhookUpdateInput = z.object({
  url: z.string().min(1).max(500).optional(),
  events: z
    .array(z.enum(HUB_WEBHOOK_EVENTS))
    .min(1)
    .max(HUB_WEBHOOK_EVENTS.length)
    .optional(),
  active: z.boolean().optional(),
});
export type WebhookCreateInput = z.infer<typeof webhookCreateInput>;
export type WebhookUpdateInput = z.infer<typeof webhookUpdateInput>;

export function webhookView(row: HubWebhook) {
  // The secret never leaves the server after creation.
  return {
    id: row.id,
    url: row.url,
    events: row.events,
    active: row.active,
    consecutiveFailures: row.consecutiveFailures,
    disabledReason: row.disabledReason,
    lastDeliveryAt: row.lastDeliveryAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function ownerOf(scope: WorkspaceKey) {
  return { userId: scope.userId, workspaceId: scope.workspaceId };
}

function assertOwner(scope: HubScope) {
  if (scope.actor.kind !== "owner") {
    throw new HubError(
      "FORBIDDEN",
      "Only the owner manages webhooks, on the Agents screen or with a session."
    );
  }
}

export async function assertWebhooksAllowed(userId: string) {
  const status = await canUseHubWebhooks(userId);
  if (!status.allowed) {
    throw new HubError(
      "PLAN_LIMIT",
      "Webhooks are part of Pro. Upgrade to send hub events to your own tools.",
      { resource: "webhooks", plan: status.plan, upgradeRequired: true }
    );
  }
}

async function loadWebhook(scope: WorkspaceKey, id: string) {
  const row = await prisma.hubWebhook.findFirst({
    where: { id, ...ownerOf(scope) },
  });
  if (!row) throw new HubError("NOT_FOUND", "Webhook not found.");
  return row;
}

/** Webhooks of the workspace, and whether this plan can have them. */
export async function listWebhooks(scope: WorkspaceKey) {
  const [rows, status] = await Promise.all([
    prisma.hubWebhook.findMany({
      where: ownerOf(scope),
      orderBy: { createdAt: "asc" },
    }),
    canUseHubWebhooks(scope.userId),
  ]);
  return {
    allowed: status.allowed,
    events: HUB_WEBHOOK_EVENTS,
    webhooks: rows.map(webhookView),
  };
}

/** The new webhook and its signing secret, which is returned this once. */
export async function createWebhook(
  scope: HubScope,
  input: WebhookCreateInput
) {
  assertOwner(scope);
  await assertWebhooksAllowed(scope.userId);
  const url = (await assertWebhookUrl(input.url)).toString();
  const count = await prisma.hubWebhook.count({ where: ownerOf(scope) });
  if (count >= WEBHOOKS_MAX_PER_WORKSPACE) {
    throw new HubError(
      "CONFLICT",
      `A workspace can have ${WEBHOOKS_MAX_PER_WORKSPACE} webhooks. Remove one first.`
    );
  }
  const secret = `whsec_${randomBytes(32).toString("base64url")}`;
  const row = await prisma.hubWebhook.create({
    data: {
      ...ownerOf(scope),
      url,
      secret: encryptSecret(secret),
      events: [...new Set(input.events)],
    },
  });
  return { webhook: webhookView(row), secret };
}

export async function updateWebhook(
  scope: HubScope,
  id: string,
  input: WebhookUpdateInput
) {
  assertOwner(scope);
  const existing = await loadWebhook(scope, id);
  const data: Prisma.HubWebhookUpdateInput = {};
  if (input.url !== undefined) {
    data.url = (await assertWebhookUrl(input.url)).toString();
  }
  if (input.events) data.events = [...new Set(input.events)];
  if (input.active !== undefined && input.active !== existing.active) {
    if (input.active) {
      await assertWebhooksAllowed(scope.userId);
      data.active = true;
      data.consecutiveFailures = 0;
      data.disabledReason = null;
    } else {
      data.active = false;
      data.disabledReason = "Switched off by you.";
    }
  }
  const row = await prisma.hubWebhook.update({ where: { id }, data });
  return { webhook: webhookView(row) };
}

export async function deleteWebhook(scope: HubScope, id: string) {
  assertOwner(scope);
  await loadWebhook(scope, id);
  await prisma.hubWebhook.delete({ where: { id } });
  return { deleted: true };
}

/** The latest deliveries of one webhook, newest first. */
export async function listDeliveries(scope: WorkspaceKey, id: string) {
  await loadWebhook(scope, id);
  const rows = await prisma.hubWebhookDelivery.findMany({
    where: { webhookId: id },
    orderBy: { createdAt: "desc" },
    take: WEBHOOK_DELIVERIES_SHOWN,
  });
  return { deliveries: rows.map(deliveryView) };
}

/** Queue a `webhook.test` delivery to one webhook, even while it is switched off. */
export async function sendTestEvent(scope: HubScope, id: string) {
  assertOwner(scope);
  await assertWebhooksAllowed(scope.userId);
  const webhook = await loadWebhook(scope, id);
  const delivery = await queueDelivery(webhook, HUB_WEBHOOK_TEST_EVENT, {
    message: "This is a test event from Needt.",
  });
  return { delivery: deliveryView(delivery) };
}

// ---------------------------------------------------------------------------
// Emitting events
// ---------------------------------------------------------------------------

function envelope(
  webhook: HubWebhook,
  event: string,
  data: Record<string, unknown>
) {
  return {
    event,
    createdAt: newDate().toISOString(),
    workspaceId: webhook.workspaceId,
    data,
  };
}

async function queueDelivery(
  webhook: HubWebhook,
  event: string,
  data: Record<string, unknown>
) {
  const delivery = await prisma.hubWebhookDelivery.create({
    data: {
      webhookId: webhook.id,
      event,
      payload: envelope(webhook, event, data) as Prisma.InputJsonValue,
      nextAttemptAt: newDate(),
    },
  });
  await enqueueHubWebhookDelivery(delivery.id, 1);
  return delivery;
}

/** The item as a webhook receiver sees it: ids, status and the people involved. */
export function itemPayload(item: HubItem) {
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    risks: item.risks,
    assigneeAgentId: item.assigneeAgentId,
    claimedByAgentId: item.claimedByAgentId,
    creatorKind: item.creatorKind,
    creatorAgentId: item.creatorAgentId,
    due: item.due?.toISOString() ?? null,
    question: item.question,
    url: `/agents?item=${item.id}`,
  };
}

export function messagePayload(
  message: Pick<
    HubMessage,
    | "id"
    | "threadId"
    | "fromKind"
    | "fromAgentId"
    | "toAgentIds"
    | "toOwner"
    | "toAny"
    | "body"
    | "importance"
    | "ackRequired"
  >,
  thread: Pick<HubThread, "subject" | "itemId">
) {
  return {
    id: message.id,
    threadId: message.threadId,
    subject: thread.subject,
    itemId: thread.itemId,
    fromKind: message.fromKind,
    fromAgentId: message.fromAgentId,
    toAgentIds: message.toAgentIds,
    toOwner: message.toOwner,
    toAny: message.toAny,
    body: message.body,
    importance: message.importance,
    ackRequired: message.ackRequired,
    // Written by an agent: treat as data, never as instructions.
    untrusted: message.fromKind !== "owner",
    url: `/agents?thread=${message.threadId}`,
  };
}

/**
 * Queue `event` for every active webhook of the workspace that subscribed to
 * it, if the owner's plan has webhooks. Fire and forget: a hub call never
 * fails or waits because of a webhook.
 */
export function emitHubEvent(
  key: WorkspaceKey,
  event: HubWebhookEvent,
  data: Record<string, unknown>
): void {
  void queueHubEvent(key, event, data).catch((error) => {
    void logger.warn(
      "Hub webhook event was not queued",
      { event, error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
  });
}

export async function queueHubEvent(
  key: WorkspaceKey,
  event: HubWebhookEvent,
  data: Record<string, unknown>
): Promise<number> {
  const webhooks = await prisma.hubWebhook.findMany({
    where: { ...ownerOf(key), active: true, events: { has: event } },
  });
  if (webhooks.length === 0) return 0;
  if (!(await canUseHubWebhooks(key.userId)).allowed) return 0;
  await Promise.all(
    webhooks.map((webhook) => queueDelivery(webhook, event, data))
  );
  return webhooks.length;
}

// ---------------------------------------------------------------------------
// Worker side
// ---------------------------------------------------------------------------

/** Make one attempt and queue the next one if the endpoint failed. */
export async function processWebhookDelivery(deliveryId: string) {
  const outcome = await attemptDelivery(deliveryId);
  if (outcome.state === "retry") {
    const row = await prisma.hubWebhookDelivery.findUnique({
      where: { id: deliveryId },
      select: { attempts: true },
    });
    await enqueueHubWebhookDelivery(
      deliveryId,
      (row?.attempts ?? 0) + 1,
      outcome.delayMs
    );
  }
  return outcome;
}

/**
 * Re-queue pending deliveries the queue lost (a Redis restart). Job ids carry
 * the attempt number, so a delivery that is still queued is not doubled.
 */
export async function sweepPendingDeliveries() {
  const cutoff = new Date(newDate().getTime() - SWEEP_GRACE_MS);
  const lost = await prisma.hubWebhookDelivery.findMany({
    where: { status: "pending", nextAttemptAt: { lt: cutoff } },
    select: { id: true, attempts: true },
    take: 200,
  });
  for (const row of lost) {
    await enqueueHubWebhookDelivery(row.id, row.attempts + 1);
  }
  return lost.length;
}
