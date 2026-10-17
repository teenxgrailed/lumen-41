import { Prisma, SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

import { addCalendarDays, newDate } from "@/lib/date-utils";

/**
 * Manual comps: a plan granted by hand, with no payment behind it. It lives in
 * the same `Subscription` row the payment webhooks write, so every limit and
 * every "what plan is this person on" reads it with no special case. Nothing
 * here calls Creem and nothing here can create a charge.
 *
 * A comp is recognised by what it lacks: no Creem customer, subscription or
 * product, no Stripe id. A row with any of those is a real purchase and is
 * never overwritten or revoked from here (refund it in Creem instead).
 *
 * Pro for N days is stored the way a cancelled paid month is: PRO, CANCELED,
 * with `currentPeriodEnd`. `effectiveSubscriptionPlan` already keeps that plan
 * until the end date and falls back to Free after it, so a comp expires with
 * no sweep and no job. (An ACTIVE row would never expire.)
 */

export type ManualGrantKind = "pro_days" | "lifetime";

export type BillingGrantErrorCode =
  | "PAID_SUBSCRIPTION"
  | "ALREADY_LIFETIME"
  | "NOT_A_COMP"
  | "NOTHING_TO_REVOKE"
  | "INVALID_DAYS";

export class BillingGrantError extends Error {
  constructor(
    readonly code: BillingGrantErrorCode,
    message: string
  ) {
    super(message);
    this.name = "BillingGrantError";
  }
}

export const MAX_COMP_DAYS = 3650;

type SubscriptionRow = {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  creemCustomerId: string | null;
  creemSubscriptionId: string | null;
  creemProductId: string | null;
  stripeCustomerId: string | null;
  stripePaymentIntentId: string | null;
};

/** True for a row nobody paid for: free, or a comp this module wrote. */
export function isManualSubscription(
  row: Pick<
    SubscriptionRow,
    | "creemCustomerId"
    | "creemSubscriptionId"
    | "creemProductId"
    | "stripeCustomerId"
    | "stripePaymentIntentId"
  >
): boolean {
  return (
    !row.creemCustomerId &&
    !row.creemSubscriptionId &&
    !row.creemProductId &&
    !row.stripeCustomerId &&
    !row.stripePaymentIntentId
  );
}

export function describeManualGrant(
  kind: ManualGrantKind,
  days: number | null
) {
  return kind === "lifetime" ? "Lifetime" : `Pro for ${days} days`;
}

export interface ManualGrantResult {
  plan: SubscriptionPlan;
  /** Null for Lifetime. */
  currentPeriodEnd: Date | null;
}

async function readSubscription(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<SubscriptionRow | null> {
  return tx.subscription.findUnique({
    where: { userId },
    select: {
      plan: true,
      status: true,
      currentPeriodEnd: true,
      creemCustomerId: true,
      creemSubscriptionId: true,
      creemProductId: true,
      stripeCustomerId: true,
      stripePaymentIntentId: true,
    },
  });
}

/**
 * Grants a comp inside the caller's transaction, so the grant and whatever
 * records it (an audit row, a promo redemption) commit or fail together.
 * Pro days stack onto a comp that is still running; they never shorten one.
 */
export async function grantManualPlan(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    kind: ManualGrantKind;
    /** Required for `pro_days`. */
    days?: number | null;
    now?: Date;
  }
): Promise<ManualGrantResult> {
  const now = input.now ?? newDate();
  const existing = await readSubscription(tx, input.userId);
  if (existing && existing.plan !== SubscriptionPlan.FREE) {
    if (!isManualSubscription(existing)) {
      throw new BillingGrantError(
        "PAID_SUBSCRIPTION",
        "This account has a paid plan. Change it in Creem, not here."
      );
    }
    if (existing.plan === SubscriptionPlan.LIFETIME) {
      throw new BillingGrantError(
        "ALREADY_LIFETIME",
        "This account already has Lifetime."
      );
    }
  }

  if (input.kind === "lifetime") {
    await tx.subscription.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        plan: SubscriptionPlan.LIFETIME,
        status: SubscriptionStatus.ACTIVE,
      },
      update: {
        plan: SubscriptionPlan.LIFETIME,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        interval: null,
      },
    });
    return { plan: SubscriptionPlan.LIFETIME, currentPeriodEnd: null };
  }

  const days = input.days;
  if (
    typeof days !== "number" ||
    !Number.isInteger(days) ||
    days < 1 ||
    days > MAX_COMP_DAYS
  ) {
    throw new BillingGrantError(
      "INVALID_DAYS",
      `Days must be a whole number from 1 to ${MAX_COMP_DAYS}.`
    );
  }
  const runningUntil =
    existing?.plan === SubscriptionPlan.PRO &&
    existing.currentPeriodEnd &&
    existing.currentPeriodEnd > now
      ? existing.currentPeriodEnd
      : now;
  const currentPeriodEnd = addCalendarDays(runningUntil, days);
  await tx.subscription.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.CANCELED,
      cancelAtPeriodEnd: true,
      currentPeriodEnd,
    },
    update: {
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.CANCELED,
      cancelAtPeriodEnd: true,
      currentPeriodEnd,
      interval: null,
    },
  });
  return { plan: SubscriptionPlan.PRO, currentPeriodEnd };
}

/** Ends a comp at once. A purchased plan is refused. Returns the plan it ended. */
export async function revokeManualPlan(
  tx: Prisma.TransactionClient,
  input: { userId: string }
): Promise<{ revoked: SubscriptionPlan }> {
  const existing = await readSubscription(tx, input.userId);
  if (!existing || existing.plan === SubscriptionPlan.FREE) {
    throw new BillingGrantError(
      "NOTHING_TO_REVOKE",
      "This account has no paid plan to revoke."
    );
  }
  if (!isManualSubscription(existing)) {
    throw new BillingGrantError(
      "NOT_A_COMP",
      "This plan was bought. Refund or cancel it in Creem, not here."
    );
  }
  await tx.subscription.update({
    where: { userId: input.userId },
    data: {
      plan: SubscriptionPlan.FREE,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      interval: null,
    },
  });
  return { revoked: existing.plan };
}
