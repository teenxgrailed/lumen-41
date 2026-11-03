import {
  BillingProvider,
  LifetimeCheckoutReservationStatus,
  Prisma,
  SubscriptionPlan,
  SubscriptionStatus,
} from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { effectiveSubscriptionPlan } from "@/lib/entitlements";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "CreemRevocation";

export type CreemRevocationEventType = "refund.created" | "dispute.created";

export type CreemRevocationEvent = {
  id: string;
  createdAt: number;
  eventType: CreemRevocationEventType;
  object: Record<string, unknown>;
};

export type CreemRevocation = {
  kind: "refund" | "dispute";
  creemSubscriptionId: string | null;
  creemCustomerId: string | null;
  userId: string | null;
  /** Minor units given back to the buyer. */
  returnedAmount: number | null;
  /** Minor units the buyer originally paid, when the event carries it. */
  paidAmount: number | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Creem sends these references either expanded or as a bare id. */
function entityId(value: unknown): string | null {
  return stringValue(value) || stringValue(asRecord(value)?.id);
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function metadataUserId(object: Record<string, unknown>): string | null {
  const sources = [
    asRecord(object.metadata),
    asRecord(asRecord(object.checkout)?.metadata),
    asRecord(asRecord(object.subscription)?.metadata),
    asRecord(asRecord(object.customer)?.metadata),
  ];
  for (const metadata of sources) {
    const value =
      stringValue(metadata?.referenceId) || stringValue(metadata?.userId);
    if (value) return value;
  }
  return null;
}

export function mapCreemRevocationEvent(
  event: CreemRevocationEvent
): CreemRevocation | null {
  const object = event.object;
  const kind = event.eventType === "refund.created" ? "refund" : "dispute";
  const transaction = asRecord(object.transaction);
  const order = asRecord(object.order);

  const creemSubscriptionId = entityId(object.subscription);
  const creemCustomerId = entityId(object.customer);
  if (!creemSubscriptionId && !creemCustomerId) return null;

  return {
    kind,
    creemSubscriptionId,
    creemCustomerId,
    userId: metadataUserId(object),
    returnedAmount:
      kind === "refund"
        ? numberValue(object.refund_amount)
        : numberValue(object.amount),
    paidAmount: numberValue(order?.amount) ?? numberValue(transaction?.amount),
  };
}

type RevocationOutcome =
  | "revoked"
  | "partial_refund_retained"
  | "already_free"
  | "apple_active"
  | "missing_subscription"
  | "replayed_event";

/**
 * A refund or a chargeback takes the money back, so it takes the plan back.
 *
 * A refund smaller than what was paid does not: the buyer kept part of what
 * they bought, and cutting their access over a partial give-back is the
 * mirror of the mistake this module exists to prevent. When the event does
 * not say what was originally paid, the refund is treated as full — serving a
 * refunded customer is the worse of the two errors, and the owner can
 * re-grant.
 *
 * Lifetime needs no special case: the seat cap counts `Subscription` rows at
 * plan LIFETIME, so dropping the plan returns the seat to the pool.
 */
export async function processCreemRevocationEvent(
  event: CreemRevocationEvent
): Promise<{ processed: boolean; outcome: RevocationOutcome }> {
  const revocation = mapCreemRevocationEvent(event);
  if (!revocation) {
    return { processed: false, outcome: "missing_subscription" };
  }

  const partial =
    revocation.kind === "refund" &&
    revocation.returnedAmount !== null &&
    revocation.paidAmount !== null &&
    revocation.returnedAmount < revocation.paidAmount;

  const eventCreatedAt = newDate(event.createdAt);

  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.subscription.findFirst({
        where: {
          OR: [
            ...(revocation.creemSubscriptionId
              ? [{ creemSubscriptionId: revocation.creemSubscriptionId }]
              : []),
            ...(revocation.creemCustomerId
              ? [{ creemCustomerId: revocation.creemCustomerId }]
              : []),
            ...(revocation.userId ? [{ userId: revocation.userId }] : []),
          ],
        },
        select: {
          id: true,
          userId: true,
          plan: true,
          status: true,
          currentPeriodEnd: true,
          provider: true,
          creemSubscriptionId: true,
          lastCreemEventAt: true,
        },
      });

      const userId = existing?.userId ?? revocation.userId;
      if (!existing || !userId) {
        void logger.warn(
          "Creem revocation names no subscription we hold",
          {
            eventId: event.id,
            kind: revocation.kind,
            creemSubscriptionId: revocation.creemSubscriptionId,
            creemCustomerId: revocation.creemCustomerId,
          },
          LOG_SOURCE
        );
        return { processed: false, outcome: "missing_subscription" as const };
      }

      // A refund of an old Creem purchase never takes away a live App Store
      // plan that replaced it.
      const appleActive =
        existing.provider === BillingProvider.APPLE &&
        effectiveSubscriptionPlan(existing) !== SubscriptionPlan.FREE;
      const outcome: RevocationOutcome = appleActive
        ? "apple_active"
        : partial
          ? "partial_refund_retained"
          : existing.plan === SubscriptionPlan.FREE
            ? "already_free"
            : "revoked";

      const receipt = await tx.creemWebhookEvent.createMany({
        data: [
          {
            id: event.id,
            userId,
            eventType: event.eventType,
            eventCreatedAt: eventCreatedAt,
            outcome,
          },
        ],
        skipDuplicates: true,
      });
      if (receipt.count === 0) {
        return { processed: false, outcome: "replayed_event" as const };
      }

      if (outcome === "revoked") {
        // The cursor moves to the end state (restriction level 5), so a
        // subscription.* event for the same subscription that is older than
        // this one, or equal to it, can no longer re-grant Pro. It never
        // moves backwards past what the row already recorded.
        const cursorAt =
          existing.lastCreemEventAt &&
          existing.lastCreemEventAt > eventCreatedAt
            ? existing.lastCreemEventAt
            : eventCreatedAt;
        const subscriptionIds = new Set(
          [existing.creemSubscriptionId, revocation.creemSubscriptionId].filter(
            (id): id is string => Boolean(id)
          )
        );
        for (const creemSubscriptionId of subscriptionIds) {
          await tx.creemSubscriptionCursor.upsert({
            where: {
              userId_creemSubscriptionId: { userId, creemSubscriptionId },
            },
            create: {
              userId,
              creemSubscriptionId,
              lastEventId: event.id,
              lastEventAt: cursorAt,
              restrictionLevel: 5,
            },
            update: {
              lastEventId: event.id,
              lastEventAt: cursorAt,
              restrictionLevel: 5,
            },
          });
        }

        await tx.subscription.update({
          where: { id: existing.id },
          data: {
            plan: SubscriptionPlan.FREE,
            status: SubscriptionStatus.CANCELED,
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
            lastCreemEventId: event.id,
            lastCreemEventAt: cursorAt,
          },
        });

        // Terms 5.5: a refunded Lifetime returns the seat, and the buyer may
        // buy again. A consumed hold would otherwise lock them out for good.
        if (existing.plan === SubscriptionPlan.LIFETIME) {
          await tx.lifetimeHold.updateMany({
            where: {
              userId,
              status: LifetimeCheckoutReservationStatus.CONSUMED,
            },
            data: { status: LifetimeCheckoutReservationStatus.EXPIRED },
          });
        }
      }

      void logger.warn(
        revocation.kind === "dispute"
          ? "Chargeback opened against a Needt subscription"
          : "Refund issued against a Needt subscription",
        {
          eventId: event.id,
          userId,
          outcome,
          returnedAmount: revocation.returnedAmount,
          paidAmount: revocation.paidAmount,
        },
        LOG_SOURCE
      );

      return { processed: outcome === "revoked", outcome };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}
