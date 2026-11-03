import {
  BillingProvider,
  Prisma,
  SubscriptionPlan,
  type SubscriptionStatus,
} from "@prisma/client";
import { randomUUID } from "node:crypto";

import { lockLifetimeCapacity } from "@/lib/creem/lifetime-cap";
import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import type { AppleIapEnvironment } from "./config";
import { type AppleEntitlementState, grantsAccess } from "./state";

/**
 * Apple purchases live in the same `Subscription` row Creem writes, with
 * `provider = APPLE`, so every "is this person Pro / Lifetime" read (getPlan,
 * limits, the Lifetime seat count) keeps working with no special case. One
 * seller at a time: a live Creem plan is never overwritten from here, and the
 * Creem checkout refuses while an Apple plan is live.
 */

type SourceRow = {
  provider: BillingProvider | null;
  creemCustomerId: string | null;
  creemSubscriptionId: string | null;
  creemProductId?: string | null;
};

export type BillingSource = "creem" | "apple" | null;

/** Who sells this row's plan. Rows from before the column existed are Creem's
 *  when they carry a Creem id, and nobody's (a comp, or Free) otherwise. */
export function billingSource(row: SourceRow | null): BillingSource {
  if (!row) return null;
  if (row.provider === BillingProvider.APPLE) return "apple";
  if (row.provider === BillingProvider.CREEM) return "creem";
  return row.creemCustomerId || row.creemSubscriptionId || row.creemProductId
    ? "creem"
    : null;
}

/** The person's appAccountToken, created on first use. */
export async function getOrCreateAppAccountToken(
  userId: string
): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { appleAppAccountToken: true },
  });
  if (user?.appleAppAccountToken) return user.appleAppAccountToken;
  // Conditional write: two first requests racing both end with the one
  // token that landed, never two different ones handed out.
  await prisma.user.updateMany({
    where: { id: userId, appleAppAccountToken: null },
    data: { appleAppAccountToken: randomUUID() },
  });
  const stored = await prisma.user.findUnique({
    where: { id: userId },
    select: { appleAppAccountToken: true },
  });
  if (!stored?.appleAppAccountToken) {
    throw new Error("Could not store the Apple account token.");
  }
  return stored.appleAppAccountToken;
}

export async function findUserIdByAppAccountToken(
  token: string
): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { appleAppAccountToken: token.toLowerCase() },
    select: { id: true },
  });
  return user?.id ?? null;
}

export async function findUserIdByOriginalTransactionId(
  originalTransactionId: string
): Promise<string | null> {
  const row = await prisma.subscription.findUnique({
    where: { appleOriginalTransactionId: originalTransactionId },
    select: { userId: true },
  });
  return row?.userId ?? null;
}

export type AppleEntitlementInput = {
  userId: string;
  originalTransactionId: string;
  transactionId: string;
  productId: string;
  bundleId: string;
  environment: AppleIapEnvironment;
  signedAt: Date;
  state: AppleEntitlementState;
  /** A device post repeats what it already sent; a notification is news. */
  origin: "device" | "notification";
};

export type AppleEntitlementOutcome =
  | "applied"
  | "unchanged"
  | "stale"
  | "lifetime_preserved"
  | "creem_active"
  | "other_subscription"
  | "transaction_in_use";

const SERIALIZABLE_RETRIES = 3;

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
  throw new Error("Serializable Apple entitlement retry limit reached.");
}

type CurrentRow = SourceRow & {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  appleOriginalTransactionId: string | null;
  appleTransactionId: string | null;
  appleLastSignedAt: Date | null;
};

/**
 * Decide what an Apple fact does to this person's row. Pure, so every rule is
 * unit-tested without a database.
 */
export function decideAppleEntitlement(
  current: CurrentRow | null,
  input: Pick<
    AppleEntitlementInput,
    "originalTransactionId" | "transactionId" | "signedAt" | "state" | "origin"
  >,
  now: Date = newDate()
): AppleEntitlementOutcome | "apply" {
  if (!current) return "apply";
  const source = billingSource(current);
  const currentGrants = grantsAccess(current, now);

  // A live Creem plan is Creem's to change. (An Apple purchase on top of it
  // is not offered: account-token lists no products for this account.)
  if (source === "creem" && currentGrants) return "creem_active";

  const sameIdentity =
    current.appleOriginalTransactionId === input.originalTransactionId;

  if (source === "apple" && !sameIdentity) {
    if (
      current.plan === SubscriptionPlan.LIFETIME &&
      currentGrants &&
      input.state.plan !== SubscriptionPlan.LIFETIME
    ) {
      return "lifetime_preserved";
    }
    // An old subscription ending must not end the one that replaced it.
    if (!grantsAccess(input.state, now) && currentGrants) {
      return "other_subscription";
    }
    return "apply";
  }

  if (sameIdentity) {
    if (
      current.appleLastSignedAt &&
      input.signedAt < current.appleLastSignedAt
    ) {
      return "stale";
    }
    if (
      input.origin === "device" &&
      current.appleTransactionId === input.transactionId &&
      !input.state.revoked
    ) {
      // The device resends a transaction it posted before; the notifications
      // (renewal off, billing trouble) know more than it does.
      return "unchanged";
    }
  }
  return "apply";
}

export async function applyAppleEntitlement(
  input: AppleEntitlementInput
): Promise<{ outcome: AppleEntitlementOutcome }> {
  return serializableTransaction(async (transaction) => {
    if (input.state.plan === SubscriptionPlan.LIFETIME) {
      // Same lock the Creem seat count takes, so Apple and Creem Lifetime
      // grants are counted against the one 300-seat pool in order.
      await lockLifetimeCapacity(transaction);
    }

    const owner = await transaction.subscription.findUnique({
      where: { appleOriginalTransactionId: input.originalTransactionId },
      select: { userId: true },
    });
    if (owner && owner.userId !== input.userId) {
      return { outcome: "transaction_in_use" as const };
    }

    const current = await transaction.subscription.findUnique({
      where: { userId: input.userId },
      select: {
        provider: true,
        plan: true,
        status: true,
        currentPeriodEnd: true,
        creemCustomerId: true,
        creemSubscriptionId: true,
        creemProductId: true,
        appleOriginalTransactionId: true,
        appleTransactionId: true,
        appleLastSignedAt: true,
      },
    });

    const decision = decideAppleEntitlement(current, input);
    if (decision !== "apply") return { outcome: decision };

    const data = {
      provider: BillingProvider.APPLE,
      plan: input.state.plan,
      status: input.state.status,
      interval: input.state.interval,
      currentPeriodEnd: input.state.currentPeriodEnd,
      cancelAtPeriodEnd: input.state.cancelAtPeriodEnd,
      appleOriginalTransactionId: input.originalTransactionId,
      appleTransactionId: input.transactionId,
      appleProductId: input.productId,
      appleBundleId: input.bundleId,
      appleEnvironment: input.environment,
      appleLastSignedAt:
        current?.appleLastSignedAt &&
        current.appleOriginalTransactionId === input.originalTransactionId &&
        current.appleLastSignedAt > input.signedAt
          ? current.appleLastSignedAt
          : input.signedAt,
    };
    await transaction.subscription.upsert({
      where: { userId: input.userId },
      create: { userId: input.userId, ...data },
      update: data,
    });
    return { outcome: "applied" as const };
  });
}
