import { NextRequest, NextResponse } from "next/server";

import { getHostedAiUsage, publicHostedAiUsage } from "@/services/ai/usage";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { isCreemConfigured } from "@/lib/creem/config";
import { lifetimeAvailability } from "@/lib/creem/lifetime-cap";
import { newDate } from "@/lib/date-utils";
import {
  canAddCalendar,
  canAddMailbox,
  canAutoScheduleMore,
  canCreateBoard,
  canUseAiAgent,
  canViewFocusStats,
  getPlan,
} from "@/lib/entitlements";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { BILLING_CHECKOUT } from "@/lib/feature-flags-keys";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { isTrialAvailable } from "@/lib/trials/trial-service";

const LOG_SOURCE = "BillingAPI";

/**
 * Whether "Start 14-day free trial" can work: a confirmed address, a Free
 * account, and nobody (under this address or this account) who has had one.
 * Unknown counts as no: the button must not promise what it cannot do.
 */
async function trialEligibility(input: {
  userId: string;
  plan: string;
  subscriptionPlan: string | null;
  email: string | null;
}): Promise<boolean> {
  if (!input.email) return false;
  if (input.plan !== "FREE" || input.subscriptionPlan === "PRO") return false;
  try {
    return await isTrialAvailable({ userId: input.userId, email: input.email });
  } catch (error) {
    logger.warn(
      "Could not read trial eligibility",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) return auth.response;

    const [
      subscription,
      trialGrant,
      plan,
      calendars,
      autoScheduledTasks,
      boards,
      mailboxes,
      aiAgent,
      focusStats,
      aiUsage,
      lifetime,
      checkoutEnabled,
      account,
    ] = await Promise.all([
      prisma.subscription.findUnique({
        where: { userId: auth.userId },
        select: {
          plan: true,
          status: true,
          interval: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
          creemCustomerId: true,
        },
      }),
      prisma.trialGrant.findUnique({
        where: { userId: auth.userId },
        select: { startedAt: true, endsAt: true },
      }),
      getPlan(auth.userId),
      canAddCalendar(auth.userId),
      canAutoScheduleMore(auth.userId),
      canCreateBoard(auth.userId),
      canAddMailbox(auth.userId),
      canUseAiAgent(auth.userId),
      canViewFocusStats(auth.userId),
      getHostedAiUsage(auth.userId),
      lifetimeAvailability(auth.userId),
      isFeatureEnabled(BILLING_CHECKOUT, auth.userId),
      prisma.user.findUnique({
        where: { id: auth.userId },
        select: { email: true, emailVerified: true },
      }),
    ]);

    const trialEligible = await trialEligibility({
      userId: auth.userId,
      plan,
      subscriptionPlan: subscription?.plan ?? null,
      email: account?.emailVerified ? (account.email ?? null) : null,
    });

    return NextResponse.json({
      configured: isCreemConfigured(),
      plan,
      isTrial:
        plan === "PRO" &&
        Boolean(trialGrant?.endsAt && trialGrant.endsAt > newDate()) &&
        subscription?.plan !== "PRO" &&
        subscription?.plan !== "LIFETIME",
      trialEndsAt: trialGrant?.endsAt ?? null,
      status: subscription?.status ?? "ACTIVE",
      interval: subscription?.interval ?? null,
      currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
      canManageBilling: Boolean(subscription?.creemCustomerId),
      lifetimeAvailable: lifetime.available,
      lifetimeLeft: lifetime.left,
      checkoutEnabled,
      trialEligible,
      usage: {
        calendars,
        autoScheduledTasks,
        boards,
        mailboxes,
        aiAgent,
        focusStats,
        aiActions: publicHostedAiUsage(aiUsage),
      },
    });
  } catch (error) {
    logger.error(
      "Failed to load billing summary",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to load billing summary" },
      { status: 500 }
    );
  }
}
