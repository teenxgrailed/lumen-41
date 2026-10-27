import { SubscriptionPlan } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { effectiveSubscriptionPlan } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";

import { isManualSubscription } from "../billing/manual-grant";

export const USER_SEARCH_LIMIT = 25;

export interface AdminUserRow {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  createdAt: string | null;
  plan: SubscriptionPlan;
  /** Whether the email address is confirmed. */
  verified: boolean;
  lastSignInAt: string | null;
}

export interface AdminUserDetail extends AdminUserRow {
  isActive: boolean;
  trialEndsAt: string | null;
  /** Paid (or comped) plan row, before a trial is taken into account. */
  subscription: {
    plan: SubscriptionPlan;
    status: string;
    currentPeriodEnd: string | null;
    manual: boolean;
  } | null;
  /** Provider names only. Never a token, an address or an id. */
  providers: { signIn: string[]; calendar: string[]; mail: string[] };
  deletionScheduledFor: string | null;
}

/** A search is a short, trimmed piece of text. */
function plainSearch(value: string) {
  return value.trim().slice(0, 120);
}

const iso = (date: Date | null | undefined) =>
  date ? date.toISOString() : null;

function unique(values: string[]) {
  return [...new Set(values.map((v) => v.toLowerCase()))].sort();
}

/**
 * Finds people by part of their email. An empty search lists the newest
 * accounts. Prisma binds `contains` as a parameter, so the text cannot change
 * the query.
 */
export async function searchAdminUsers(
  query: string,
  now: Date = newDate(),
  page: { offset?: number; limit?: number } = {}
): Promise<AdminUserRow[]> {
  const q = plainSearch(query);
  const users = await prisma.user.findMany({
    where: q ? { email: { contains: q, mode: "insensitive" } } : undefined,
    orderBy: [
      { createdAt: { sort: "desc", nulls: "last" } },
      { email: "asc" },
      { id: "asc" },
    ],
    ...(page.offset ? { skip: page.offset } : {}),
    take: Math.min(page.limit ?? USER_SEARCH_LIMIT, USER_SEARCH_LIMIT * 2),
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      emailVerified: true,
      lastAuthenticatedAt: true,
      subscription: {
        select: { plan: true, status: true, currentPeriodEnd: true },
      },
      trialGrant: { select: { endsAt: true } },
    },
  });
  return users.map((user) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: iso(user.createdAt),
    plan: effectiveSubscriptionPlan(user.subscription, user.trialGrant, now),
    verified: Boolean(user.emailVerified),
    lastSignInAt: iso(user.lastAuthenticatedAt),
  }));
}

export async function getAdminUserDetail(
  userId: string,
  now: Date = newDate()
): Promise<AdminUserDetail | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
      emailVerified: true,
      lastAuthenticatedAt: true,
      subscription: {
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
      },
      trialGrant: { select: { endsAt: true } },
      accounts: { select: { provider: true } },
      connectedAccounts: { select: { provider: true } },
      mailAccounts: { select: { provider: true } },
      deletionRequest: { select: { status: true, scheduledFor: true } },
    },
  });
  if (!user) return null;
  const subscription = user.subscription;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    createdAt: iso(user.createdAt),
    verified: Boolean(user.emailVerified),
    lastSignInAt: iso(user.lastAuthenticatedAt),
    trialEndsAt: iso(user.trialGrant?.endsAt),
    plan: effectiveSubscriptionPlan(subscription, user.trialGrant, now),
    subscription: subscription
      ? {
          plan: subscription.plan,
          status: subscription.status,
          currentPeriodEnd: iso(subscription.currentPeriodEnd),
          manual: isManualSubscription(subscription),
        }
      : null,
    providers: {
      signIn: unique(user.accounts.map((a) => a.provider)),
      calendar: unique(user.connectedAccounts.map((a) => a.provider)),
      mail: unique(user.mailAccounts.map((a) => a.provider)),
    },
    deletionScheduledFor:
      user.deletionRequest?.status === "SCHEDULED"
        ? iso(user.deletionRequest.scheduledFor)
        : null,
  };
}
