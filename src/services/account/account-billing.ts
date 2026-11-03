import {
  BillingProvider,
  SubscriptionPlan,
  SubscriptionStatus,
} from "@prisma/client";

import { getCreemClient } from "@/lib/creem/client";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "AccountBilling";

/** Creem no longer has the subscription, or it has already ended. */
function isAlreadyGone(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { statusCode, body } = error as {
    statusCode?: unknown;
    body?: unknown;
  };
  if (statusCode === 404) return true;
  return (
    (statusCode === 400 || statusCode === 409 || statusCode === 422) &&
    typeof body === "string" &&
    /already[^"]{0,40}(cancel|expire|ended)|(cancel|expire)[^"]{0,20}already/i.test(
      body
    )
  );
}

export async function cancelRecurringBillingForDeletion(
  userId: string
): Promise<void> {
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
    select: {
      creemSubscriptionId: true,
      plan: true,
      status: true,
      provider: true,
      appleOriginalTransactionId: true,
    },
  });
  if (subscription?.provider === BillingProvider.APPLE) {
    // An App Store subscription cannot be cancelled by the seller: the buyer
    // cancels it in iOS Settings. Never send its row to Creem; record that it
    // was left running so support can tell the person if they write in.
    if (
      subscription.plan === SubscriptionPlan.PRO &&
      subscription.status !== SubscriptionStatus.CANCELED
    ) {
      await logger.info(
        "Account deletion left an App Store subscription to the buyer",
        {
          userId,
          appleOriginalTransactionId: subscription.appleOriginalTransactionId,
        },
        LOG_SOURCE
      );
    }
    return;
  }
  if (
    !subscription?.creemSubscriptionId ||
    subscription.plan !== SubscriptionPlan.PRO ||
    subscription.status === SubscriptionStatus.CANCELED
  ) {
    return;
  }

  try {
    await getCreemClient().subscriptions.cancel(
      subscription.creemSubscriptionId,
      { mode: "immediate" }
    );
  } catch (error) {
    /* A subscription that is already gone is the state deletion wants:
       record it locally and carry on. Anything else is thrown for the
       caller to log. */
    if (!isAlreadyGone(error)) throw error;
  }
  await prisma.subscription.updateMany({
    where: {
      userId,
      creemSubscriptionId: subscription.creemSubscriptionId,
    },
    data: {
      status: SubscriptionStatus.CANCELED,
      cancelAtPeriodEnd: false,
    },
  });
}
