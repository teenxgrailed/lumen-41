import { getHostedAiUsage, publicHostedAiUsage } from "@/services/ai/usage";

import { APPLE_MANAGE_SUBSCRIPTIONS_URL } from "@/lib/apple-iap/config";
import { billingSource } from "@/lib/apple-iap/entitlement";
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
import { studentSummary } from "@/lib/students/student-service";
import { isTrialAvailable } from "@/lib/trials/trial-service";

const LOG_SOURCE = "BillingSummary";

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

/**
 * The billing summary `GET /api/billing` returns. The Apple transactions route
 * answers with the same shape, so the native app reads one model.
 */
export async function getBillingSummary(userId: string) {
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
    student,
  ] = await Promise.all([
    prisma.subscription.findUnique({
      where: { userId },
      select: {
        plan: true,
        status: true,
        interval: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        creemCustomerId: true,
        creemSubscriptionId: true,
        creemProductId: true,
        provider: true,
        appleConflictSince: true,
        discountApplied: true,
      },
    }),
    prisma.trialGrant.findUnique({
      where: { userId },
      select: { startedAt: true, endsAt: true },
    }),
    getPlan(userId),
    canAddCalendar(userId),
    canAutoScheduleMore(userId),
    canCreateBoard(userId),
    canAddMailbox(userId),
    canUseAiAgent(userId),
    canViewFocusStats(userId),
    getHostedAiUsage(userId),
    lifetimeAvailability(userId),
    isFeatureEnabled(BILLING_CHECKOUT, userId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailVerified: true },
    }),
    studentSummary(userId),
  ]);

  const trialEligible = await trialEligibility({
    userId: userId,
    plan,
    subscriptionPlan: subscription?.plan ?? null,
    email: account?.emailVerified ? (account.email ?? null) : null,
  });

  const source = billingSource(subscription);

  return {
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
    // An Apple plan is managed in the App Store, never in the Creem portal.
    canManageBilling:
      source !== "apple" && Boolean(subscription?.creemCustomerId),
    /** Who sells the plan: "creem", "apple", or null (Free or a comp). */
    source,
    /** Where to manage an Apple plan ("Manage in App Store"); null otherwise. */
    manageUrl: source === "apple" ? APPLE_MANAGE_SUBSCRIPTIONS_URL : null,
    /**
     * A second seller still billing for the same account: a Creem plan was
     * bought while an App Store subscription renewed. Only the person can
     * cancel the App Store side, so both are shown until Apple stops.
     */
    alsoBilledBy: subscription?.appleConflictSince
      ? {
          source: "apple" as const,
          manageUrl: APPLE_MANAGE_SUBSCRIPTIONS_URL,
          since: subscription.appleConflictSince,
        }
      : null,
    /** Creem reported a discount on this subscription (the student code). */
    discountApplied: subscription?.discountApplied ?? false,
    lifetimeAvailable: lifetime.available,
    lifetimeLeft: lifetime.left,
    checkoutEnabled,
    trialEligible,
    student,
    usage: {
      calendars,
      autoScheduledTasks,
      boards,
      mailboxes,
      aiAgent,
      focusStats,
      aiActions: publicHostedAiUsage(aiUsage),
    },
  };
}

export type BillingSummary = Awaited<ReturnType<typeof getBillingSummary>>;
