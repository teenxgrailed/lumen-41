import { NextRequest, NextResponse } from "next/server";

import {
  AccountDeletionStatus,
  SubscriptionPlan,
  SubscriptionStatus,
} from "@prisma/client";

import { APPLE_MANAGE_SUBSCRIPTIONS_URL } from "@/lib/apple-iap/config";
import { billingSource } from "@/lib/apple-iap/entitlement";
import { grantsAccess } from "@/lib/apple-iap/state";
import { authenticateAccountRequest } from "@/lib/auth/account-request-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await authenticateAccountRequest(request);
  if (auth.response) return auth.response;
  const [accounts, deletion, subscription] = await Promise.all([
    prisma.account.findMany({
      where: { userId: auth.user.id },
      select: { provider: true },
    }),
    prisma.accountDeletionRequest.findUnique({
      where: { userId: auth.user.id },
      select: { status: true, scheduledFor: true },
    }),
    prisma.subscription.findUnique({
      where: { userId: auth.user.id },
      select: {
        provider: true,
        plan: true,
        status: true,
        currentPeriodEnd: true,
        creemCustomerId: true,
        creemSubscriptionId: true,
      },
    }),
  ]);
  // Deleting the account does not stop an App Store subscription: only the
  // buyer can cancel it, in the App Store (Apple's account-deletion rules).
  const appleSubscription =
    subscription &&
    billingSource(subscription) === "apple" &&
    subscription.plan === SubscriptionPlan.PRO &&
    // CANCELED is auto-renew off: it ends on its own, nothing to warn about.
    subscription.status !== SubscriptionStatus.CANCELED &&
    grantsAccess(subscription)
      ? { manageUrl: APPLE_MANAGE_SUBSCRIPTIONS_URL }
      : null;
  return NextResponse.json({
    providers: [...new Set(accounts.map(({ provider }) => provider))],
    deletion:
      deletion?.status === AccountDeletionStatus.SCHEDULED ? deletion : null,
    appleSubscription,
  });
}
