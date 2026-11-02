import { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

import { getCreemClient } from "@/lib/creem/client";
import { prisma } from "@/lib/prisma";

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
    },
  });
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
