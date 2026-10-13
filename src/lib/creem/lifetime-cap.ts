import {
  LifetimeCheckoutReservationStatus,
  Prisma,
  SubscriptionPlan,
} from "@prisma/client";
import { randomUUID } from "node:crypto";

import { NEEDT_PRICING } from "@/lib/creem/config";
import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

const SERIALIZABLE_RETRIES = 3;
const OPEN_RESERVATION_STATUSES: LifetimeCheckoutReservationStatus[] = [
  LifetimeCheckoutReservationStatus.CREATING,
  LifetimeCheckoutReservationStatus.PENDING,
];

export const LIFETIME_BUYER_CAP = NEEDT_PRICING.lifetime.cap;

type LifetimeReservation = {
  id: string;
  requestId: string;
  creemCheckoutId: string | null;
  checkoutUrl: string | null;
  status: LifetimeCheckoutReservationStatus;
};

export type LifetimeReservationResult =
  | { outcome: "reserved"; reservation: LifetimeReservation }
  | { outcome: "closed" }
  | { outcome: "already_owned" };

type CompletionIdentity = {
  userId: string;
  reservationId: string | null;
  checkoutId: string | null;
  requestId: string | null;
};

// A completed payment is always honoured. The 300-seat cap is enforced when a
// checkout is created; refusing a purchase Creem has already charged for would
// take the money and leave the buyer on FREE with no way back. A grant with no
// matching reservation is flagged instead, so the owner can see it.
export type LifetimeCompletionAuthorization = {
  allowed: true;
  reservationId: string | null;
  unreserved: boolean;
};

function isRetryableTransaction(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2034"
  );
}

async function serializableTransaction<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  for (let attempt = 0; attempt < SERIALIZABLE_RETRIES; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (
        !isRetryableTransaction(error) ||
        attempt === SERIALIZABLE_RETRIES - 1
      ) {
        throw error;
      }
    }
  }
  throw new Error("Serializable Lifetime reservation retry limit reached.");
}

export async function lockLifetimeCapacity(
  transaction: Prisma.TransactionClient
) {
  await transaction.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('needt-lifetime-buyer-cap'))`
  );
}

async function occupiedLifetimeSlots(transaction: Prisma.TransactionClient) {
  const [buyers, reservations] = await Promise.all([
    transaction.subscription.count({
      where: { plan: SubscriptionPlan.LIFETIME },
    }),
    transaction.lifetimeHold.count({
      where: { status: { in: OPEN_RESERVATION_STATUSES } },
    }),
  ]);
  return buyers + reservations;
}

export async function reserveLifetimeCheckout(
  userId: string
): Promise<LifetimeReservationResult> {
  return serializableTransaction(async (transaction) => {
    await lockLifetimeCapacity(transaction);

    const subscription = await transaction.subscription.findUnique({
      where: { userId },
      select: { plan: true },
    });
    if (subscription?.plan === SubscriptionPlan.LIFETIME) {
      return { outcome: "already_owned" };
    }

    const existing = await transaction.lifetimeHold.findUnique({
      where: { userId },
      select: {
        id: true,
        requestId: true,
        creemCheckoutId: true,
        checkoutUrl: true,
        status: true,
      },
    });
    if (existing && OPEN_RESERVATION_STATUSES.includes(existing.status)) {
      return { outcome: "reserved", reservation: existing };
    }
    if (existing?.status === LifetimeCheckoutReservationStatus.CONSUMED) {
      return { outcome: "already_owned" };
    }

    if ((await occupiedLifetimeSlots(transaction)) >= LIFETIME_BUYER_CAP) {
      return { outcome: "closed" };
    }

    const requestId = `needt-lifetime-${randomUUID()}`;
    const reservation = existing
      ? await transaction.lifetimeHold.update({
          where: { id: existing.id },
          data: {
            requestId,
            creemCheckoutId: null,
            checkoutUrl: null,
            status: LifetimeCheckoutReservationStatus.CREATING,
            lastCheckedAt: null,
          },
          select: {
            id: true,
            requestId: true,
            creemCheckoutId: true,
            checkoutUrl: true,
            status: true,
          },
        })
      : await transaction.lifetimeHold.create({
          data: { userId, requestId },
          select: {
            id: true,
            requestId: true,
            creemCheckoutId: true,
            checkoutUrl: true,
            status: true,
          },
        });

    return { outcome: "reserved", reservation };
  });
}

export async function attachLifetimeCheckout(
  reservationId: string,
  checkout: { id: string; checkoutUrl: string | null }
) {
  return prisma.lifetimeHold.updateMany({
    where: {
      id: reservationId,
      status: { in: OPEN_RESERVATION_STATUSES },
    },
    data: {
      creemCheckoutId: checkout.id,
      checkoutUrl: checkout.checkoutUrl,
      status: LifetimeCheckoutReservationStatus.PENDING,
    },
  });
}

async function countOccupiedLifetimeSlots() {
  const [buyers, reservations] = await Promise.all([
    prisma.subscription.count({
      where: { plan: SubscriptionPlan.LIFETIME },
    }),
    prisma.lifetimeHold.count({
      where: { status: { in: OPEN_RESERVATION_STATUSES } },
    }),
  ]);
  return buyers + reservations;
}

export type LifetimeAvailability = {
  /** This person can open a Lifetime checkout now. */
  available: boolean;
  /** Seats still open: the cap minus buyers and open checkout holds. */
  left: number;
};

/**
 * Both Lifetime answers the billing summary needs, from one count of buyers
 * and open holds.
 */
export async function lifetimeAvailability(
  userId: string
): Promise<LifetimeAvailability> {
  const [subscription, existing, occupied] = await Promise.all([
    prisma.subscription.findUnique({
      where: { userId },
      select: { plan: true },
    }),
    prisma.lifetimeHold.findUnique({
      where: { userId },
      select: { status: true },
    }),
    countOccupiedLifetimeSlots(),
  ]);
  const left = Math.max(0, LIFETIME_BUYER_CAP - occupied);
  if (subscription?.plan === SubscriptionPlan.LIFETIME) {
    return { available: false, left };
  }
  if (existing && OPEN_RESERVATION_STATUSES.includes(existing.status)) {
    return { available: true, left };
  }
  return { available: occupied < LIFETIME_BUYER_CAP, left };
}

export async function isLifetimeCheckoutAvailable(userId: string) {
  return (await lifetimeAvailability(userId)).available;
}

/** Seats still open: the cap minus buyers and open checkout holds. */
export async function lifetimeSeatsLeft() {
  return Math.max(0, LIFETIME_BUYER_CAP - (await countOccupiedLifetimeSlots()));
}

export async function authorizeLifetimeCompletion(
  transaction: Prisma.TransactionClient,
  identity: CompletionIdentity
): Promise<LifetimeCompletionAuthorization> {
  await lockLifetimeCapacity(transaction);

  const identities = [
    ...(identity.reservationId ? [{ id: identity.reservationId }] : []),
    ...(identity.checkoutId ? [{ creemCheckoutId: identity.checkoutId }] : []),
    ...(identity.requestId ? [{ requestId: identity.requestId }] : []),
  ];
  const reservation = identities.length
    ? await transaction.lifetimeHold.findFirst({
        where: { userId: identity.userId, OR: identities },
      })
    : null;

  const usable =
    reservation &&
    reservation.status !== LifetimeCheckoutReservationStatus.EXPIRED &&
    !(
      reservation.creemCheckoutId &&
      identity.checkoutId &&
      reservation.creemCheckoutId !== identity.checkoutId
    );

  if (reservation && usable) {
    if (!reservation.creemCheckoutId && identity.checkoutId) {
      await transaction.lifetimeHold.update({
        where: { id: reservation.id },
        data: { creemCheckoutId: identity.checkoutId },
      });
    }
    return { allowed: true, reservationId: reservation.id, unreserved: false };
  }

  // No reservation, or one that expired while the buyer was paying. Grant the
  // plan anyway and let the caller record the anomaly.
  return { allowed: true, reservationId: null, unreserved: true };
}

export async function consumeLifetimeReservation(
  transaction: Prisma.TransactionClient,
  reservationId: string | null
) {
  if (!reservationId) return;
  await transaction.lifetimeHold.update({
    where: { id: reservationId },
    data: { status: LifetimeCheckoutReservationStatus.CONSUMED },
  });
}

export async function expireLifetimeReservation(
  reservationId: string,
  creemCheckoutId: string
) {
  return serializableTransaction(async (transaction) => {
    await lockLifetimeCapacity(transaction);
    return transaction.lifetimeHold.updateMany({
      where: {
        id: reservationId,
        creemCheckoutId,
        status: LifetimeCheckoutReservationStatus.PENDING,
      },
      data: {
        status: LifetimeCheckoutReservationStatus.EXPIRED,
        lastCheckedAt: newDate(),
      },
    });
  });
}

export async function listReconcilableLifetimeReservations() {
  return prisma.lifetimeHold.findMany({
    where: {
      OR: [
        { status: LifetimeCheckoutReservationStatus.CREATING },
        {
          status: LifetimeCheckoutReservationStatus.PENDING,
          creemCheckoutId: { not: null },
        },
      ],
    },
    select: {
      id: true,
      requestId: true,
      creemCheckoutId: true,
      status: true,
      user: { select: { id: true, email: true, name: true } },
    },
    orderBy: { updatedAt: "asc" },
    take: 100,
  });
}

export async function markLifetimeReservationChecked(reservationId: string) {
  await prisma.lifetimeHold.update({
    where: { id: reservationId },
    data: { lastCheckedAt: newDate() },
  });
}
