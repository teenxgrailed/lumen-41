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
/** Finished deliveries (and the event text in their payload) are kept this long. */
export const DELIVERY_RETENTION_DAYS = 14;
/**
 * Deliveries a single webhook may have waiting. A looping agent (or a dead
 * endpoint on a long retry) cannot grow the table past this: later events for
 * that webhook are dropped and logged until the backlog clears.
 */
export const MAX_PENDING_PER_WEBHOOK = 500;
/** At most one "backlog full" log line per webhook in this window. */
const DROP_LOG_WINDOW_MS = 5 * 60_000;
/** Retention deletes this many rows per statement, this many statements per run. */
export const PRUNE_BATCH_SIZE = 1000;
export const PRUNE_MAX_BATCHES = 10;

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

/**
 * What an agent may see of a webhook address. n8n, Zapier and Make put the
 * credential in the path, so agents get the origin only.
 */
export function maskWebhookUrl(raw: string): string {
  try {
    const url = new URL(raw);
    return url.pathname === "/" && !url.search ? url.origin : `${url.origin}/…`;
  } catch {
    return "";
  }
}

export function webhookView(row: HubWebhook, exposeUrl: boolean) {
  // The secret never leaves the server after creation.
  return {
    id: row.id,
    url: exposeUrl ? row.url : maskWebhookUrl(row.url),
    events: row.events,
    active: row.active,
    consecutiveFailures: row.consecutiveFailures,
    disabledReason: row.disabledReason,
    lastDeliveryAt: row.lastDeliveryAt?.toISOString() ?? null,
    droppedCount: row.droppedCount,
    lastDroppedAt: row.lastDroppedAt?.toISOString() ?? null,
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

/**
 * Webhooks of the workspace, and whether this plan can have them. `exposeUrl`
 * is true only for the owner's own session; agents (bearer REST, MCP) get the
 * origin, not the path.
 */
export async function listWebhooks(scope: WorkspaceKey, exposeUrl: boolean) {
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
    webhooks: rows.map((row) => webhookView(row, exposeUrl)),
  };
}

//todo: POST /api/agent-hub/webhooks/[id]/rotate (owner-only, Pro): a new secret, returned once. Today a leaked secret means delete and re-create.
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
  return { webhook: webhookView(row, true), secret };
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
  return { webhook: webhookView(row, true) };
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
  if (!delivery)
    throw new HubError("CONFLICT", "The test could not be queued.");
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
  if (event !== HUB_WEBHOOK_TEST_EVENT) {
    const waiting = await prisma.hubWebhookDelivery.count({
      where: { webhookId: webhook.id, status: "pending" },
    });
    // A soft cap: the count and the create are not one statement, so events
    // arriving at the same moment can overshoot it a little.
    if (waiting >= MAX_PENDING_PER_WEBHOOK) {
      const now = newDate();
      await prisma.hubWebhook.update({
        where: { id: webhook.id },
        data: { droppedCount: { increment: 1 }, lastDroppedAt: now },
      });
      // One log line per webhook per window, not one per dropped event.
      const last = webhook.lastDroppedAt?.getTime() ?? 0;
      if (now.getTime() - last > DROP_LOG_WINDOW_MS) {
        await logger.warn(
          "Hub webhook backlog is full; events are being dropped",
          { webhookId: webhook.id, event, waiting },
          LOG_SOURCE
        );
      }
      return null;
    }
  }
  const delivery = await prisma.hubWebhookDelivery.create({
    data: {
      webhookId: webhook.id,
      event,
      payload: envelope(webhook, event, data) as Prisma.InputJsonValue,
      nextAttemptAt: newDate(),
    },
  });
  const queued = await enqueueHubWebhookDelivery(delivery.id, 1);
  if (queued === null) {
    // No Redis: nothing will ever deliver this, so say so instead of leaving
    // it pending forever.
    return failQueued(delivery.id, "Delivery queue is not configured.");
  }
  return delivery;
}

async function failQueued(id: string, reason: string) {
  return prisma.hubWebhookDelivery.update({
    where: { id },
    data: { status: "failed", lastError: reason, nextAttemptAt: null },
  });
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
  const queued = await Promise.all(
    webhooks.map((webhook) => queueDelivery(webhook, event, data))
  );
  return queued.filter(Boolean).length;
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
    const queued = await enqueueHubWebhookDelivery(
      deliveryId,
      (row?.attempts ?? 0) + 1,
      outcome.delayMs
    );
    if (queued === null) {
      await failQueued(deliveryId, "Delivery queue is not configured.");
    }
  }
  return outcome;
}

/**
 * Re-queue pending deliveries the queue lost (a Redis restart; job ids carry
 * the attempt number, so a delivery that is still queued is not doubled), and
 * delete finished deliveries past the retention window.
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
  // Retention: finished deliveries carry event text (titles, questions,
  // message bodies), so they do not stay forever.
  const old = new Date(
    newDate().getTime() - DELIVERY_RETENTION_DAYS * 24 * 60 * 60_000
  );
  // In batches, oldest first through the createdAt index, so a first run
  // after a long gap is a few small statements over several sweeps, not one
  // big delete.
  let pruned = 0;
  for (let batch = 0; batch < PRUNE_MAX_BATCHES; batch += 1) {
    const ids = await prisma.hubWebhookDelivery.findMany({
      where: { createdAt: { lt: old }, status: { not: "pending" } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
      take: PRUNE_BATCH_SIZE,
    });
    if (ids.length === 0) break;
    const removed = await prisma.hubWebhookDelivery.deleteMany({
      where: { id: { in: ids.map((row) => row.id) } },
    });
    pruned += removed.count;
    if (ids.length < PRUNE_BATCH_SIZE) break;
  }
  return { requeued: lost.length, pruned };
}
