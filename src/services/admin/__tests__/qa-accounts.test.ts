import {
  BillingProvider,
  SubscriptionPlan,
  SubscriptionStatus,
} from "@prisma/client";

import {
  NOT_QA_USER,
  internalReason,
  isQaTestEmail,
} from "../internal-accounts";
import {
  type StatSubscription,
  type StatUser,
  type StatsInput,
  computeOverviewStats,
} from "../overview-stats";

const NOW = new Date("2026-11-19T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const user = (id: string, email: string): StatUser => ({
  id,
  email,
  role: "user",
  sandboxKind: null,
  internal: false,
  createdAt: daysAgo(40),
  lastActiveAt: daysAgo(1),
});

const proSub = (userId: string): StatSubscription => ({
  userId,
  plan: SubscriptionPlan.PRO,
  status: SubscriptionStatus.ACTIVE,
  provider: BillingProvider.CREEM,
  currentPeriodEnd: new Date(NOW.getTime() + 20 * 86_400_000),
  amount: 700,
  creemCustomerId: "cus_1",
  creemSubscriptionId: "sub_1",
  creemProductId: "prod_1",
  stripeCustomerId: null,
  stripePaymentIntentId: null,
  appleOriginalTransactionId: null,
  appleEnvironment: null,
});

function stats(users: StatUser[]) {
  const input: StatsInput = {
    now: NOW,
    excludeInternal: true,
    ownerEmails: [],
    users,
    subscriptions: users.map((u) => proSub(u.id)),
    paymentEvents: users.map((u) => ({
      userId: u.id,
      eventType: "subscription.paid",
      outcome: "processed",
    })),
    trialUserIds: [],
    giftUserIds: [],
    activation: users.map((u) => ({
      userId: u.id,
      name: "keep_applied",
      lastAt: daysAgo(1),
    })),
    weeklyEventUserIds: [
      users.map((u) => u.id),
      ...Array.from({ length: 7 }, () => []),
    ],
    waitlist: 0,
  };
  return computeOverviewStats(input);
}

describe("QA bot accounts", () => {
  it("test_qa_plus_account_is_excluded_from_metrics", () => {
    const s = stats([
      user("bot", "qa+20261119@somedomain.com"),
      user("BOT2", "QA+Upper@somedomain.com"),
      user("real", "anna@gmail.com"),
    ]);
    expect(s.users.total).toBe(1);
    expect(s.weeklyActives).toBe(1);
    expect(s.paying.total).toBe(1);
    expect(s.funnel.find((f) => f.name === "keep_applied")?.users7Days).toBe(1);
    expect(s.internal.accounts).toBe(2);
  });

  it("test_regular_email_with_qa_elsewhere_is_counted", () => {
    expect(isQaTestEmail("aqa+x@gmail.com")).toBe(false);
    expect(isQaTestEmail("qa@gmail.com")).toBe(false);
    expect(isQaTestEmail("john+qa+x@gmail.com")).toBe(false);
    expect(isQaTestEmail("qa+x@gmail.com")).toBe(true);
    expect(isQaTestEmail(null)).toBe(false);
    const s = stats([
      user("a", "aqa+x@gmail.com"),
      user("b", "john+qa+x@gmail.com"),
      user("c", "dqa+x@gmail.com"),
    ]);
    expect(s.users.total).toBe(3);
    expect(s.paying.total).toBe(3);
  });

  it("reports the reason and builds a null-safe Prisma fragment", () => {
    expect(
      internalReason({
        email: "qa+1@x.io",
        role: "user",
        sandboxKind: null,
        internal: false,
      })
    ).toBe("qa-account");
    expect(NOT_QA_USER).toEqual({
      OR: [
        { email: null },
        { NOT: { email: { startsWith: "qa+", mode: "insensitive" } } },
      ],
    });
  });
});
