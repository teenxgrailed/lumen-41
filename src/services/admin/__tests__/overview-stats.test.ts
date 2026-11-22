import {
  BillingProvider,
  SubscriptionPlan,
  SubscriptionStatus,
} from "@prisma/client";

import {
  type StatPaymentEvent,
  type StatSubscription,
  type StatUser,
  type StatsInput,
  computeOverviewStats,
  isCreemPayer,
  subscriptionHoldsPlan,
} from "../overview-stats";

const NOW = new Date("2026-11-15T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const daysAhead = (n: number) => daysAgo(-n);

const user = (id: string, over: Partial<StatUser> = {}): StatUser => ({
  id,
  email: `${id}@gmail.com`,
  role: "user",
  sandboxKind: null,
  internal: false,
  createdAt: daysAgo(40),
  lastActiveAt: null,
  ...over,
});

const sub = (
  userId: string,
  over: Partial<StatSubscription> = {}
): StatSubscription => ({
  userId,
  plan: SubscriptionPlan.PRO,
  status: SubscriptionStatus.ACTIVE,
  provider: BillingProvider.CREEM,
  currentPeriodEnd: daysAhead(20),
  amount: 700,
  creemCustomerId: "cus_1",
  creemSubscriptionId: "sub_1",
  creemProductId: "prod_1",
  stripeCustomerId: null,
  stripePaymentIntentId: null,
  appleOriginalTransactionId: null,
  appleEnvironment: null,
  ...over,
});

const comp = (userId: string, over: Partial<StatSubscription> = {}) =>
  sub(userId, {
    provider: null,
    amount: null,
    creemCustomerId: null,
    creemSubscriptionId: null,
    creemProductId: null,
    ...over,
  });

const paid = (userId: string): StatPaymentEvent => ({
  userId,
  eventType: "subscription.paid",
  outcome: "processed",
});

function stats(over: Partial<StatsInput> = {}) {
  return computeOverviewStats({
    now: NOW,
    excludeInternal: true,
    ownerEmails: [],
    users: [],
    subscriptions: [],
    paymentEvents: [],
    trialUserIds: [],
    giftUserIds: [],
    activation: [],
    weeklyEventUserIds: Array.from({ length: 8 }, () => []),
    waitlist: 0,
    ...over,
  });
}

describe("paying vs granted", () => {
  it("counts a Creem payment as paying and a comp as granted, not paying", () => {
    const s = stats({
      users: [user("payer"), user("comped"), user("free")],
      subscriptions: [sub("payer"), comp("comped")],
      paymentEvents: [paid("payer")],
    });
    expect(s.paying).toMatchObject({ total: 1, activeNow: 1, creem: 1 });
    expect(s.granted).toMatchObject({ total: 1, pro: 1, lifetime: 0 });
    expect(s.free).toBe(1);
  });

  it("does not count a Pro plan without a payment as paying", () => {
    const s = stats({
      users: [user("a")],
      subscriptions: [sub("a")],
    });
    expect(s.paying.total).toBe(0);
    expect(s.granted.total).toBe(0);
  });

  it("counts a Lifetime comp and a running gift as granted", () => {
    const s = stats({
      users: [user("life"), user("gift")],
      subscriptions: [comp("life", { plan: SubscriptionPlan.LIFETIME })],
      giftUserIds: ["gift"],
    });
    expect(s.granted).toEqual({ total: 2, pro: 0, lifetime: 1, gifts: 1 });
    expect(s.paying.total).toBe(0);
  });

  it("keeps a lapsed payer in paying (ever paid) but not active now", () => {
    const s = stats({
      users: [user("old")],
      subscriptions: [
        sub("old", {
          status: SubscriptionStatus.CANCELED,
          currentPeriodEnd: daysAgo(3),
        }),
      ],
      paymentEvents: [paid("old")],
    });
    expect(s.paying).toMatchObject({ total: 1, activeNow: 0 });
    expect(s.free).toBe(1);
  });

  it("needs money for checkout.completed and ignores skipped events", () => {
    const checkout: StatPaymentEvent = {
      userId: "a",
      eventType: "checkout.completed",
      outcome: "processed",
    };
    expect(isCreemPayer([checkout], { amount: 5900 })).toBe(true);
    expect(isCreemPayer([checkout], { amount: 0 })).toBe(false);
    expect(isCreemPayer([checkout], undefined)).toBe(false);
    expect(
      isCreemPayer([{ ...paid("a"), outcome: "stale_event" }], { amount: 700 })
    ).toBe(false);
    expect(isCreemPayer([paid("a")], { amount: null })).toBe(true);
  });

  it("counts a live production App Store subscription, not a sandbox one", () => {
    const apple = (env: string) =>
      sub("a", {
        provider: BillingProvider.APPLE,
        creemCustomerId: null,
        creemSubscriptionId: null,
        creemProductId: null,
        appleOriginalTransactionId: "1000",
        appleEnvironment: env,
      });
    expect(
      stats({ users: [user("a")], subscriptions: [apple("Production")] }).paying
    ).toMatchObject({ total: 1, apple: 1 });
    expect(
      stats({ users: [user("a")], subscriptions: [apple("Sandbox")] }).paying
        .total
    ).toBe(0);
  });

  it("holds a plan the way the entitlement rule does", () => {
    expect(subscriptionHoldsPlan(sub("a"), NOW)).toBe(true);
    expect(
      subscriptionHoldsPlan(
        sub("a", {
          status: SubscriptionStatus.CANCELED,
          currentPeriodEnd: daysAgo(1),
        }),
        NOW
      )
    ).toBe(false);
    expect(
      subscriptionHoldsPlan(sub("a", { plan: SubscriptionPlan.FREE }), NOW)
    ).toBe(false);
  });
});

describe("internal accounts", () => {
  const people = [
    user("real", { lastActiveAt: daysAgo(1) }),
    user("owner", { email: "me@gmail.com", lastActiveAt: daysAgo(1) }),
    user("boss", { role: "admin", lastActiveAt: daysAgo(1) }),
    user("sbx", { sandboxKind: "reviewer", lastActiveAt: daysAgo(1) }),
    user("pat", { email: "x+test@gmail.com", lastActiveAt: daysAgo(1) }),
    user("flag", { internal: true, lastActiveAt: daysAgo(1) }),
  ];

  it("leaves them out of every tile by default", () => {
    const s = stats({
      users: people,
      ownerEmails: ["me@gmail.com"],
      subscriptions: [sub("owner"), comp("boss"), sub("real")],
      paymentEvents: [paid("owner"), paid("real")],
      trialUserIds: ["sbx", "flag"],
      activation: [
        { userId: "owner", name: "keep_applied", lastAt: daysAgo(1) },
        { userId: "real", name: "keep_applied", lastAt: daysAgo(1) },
      ],
    });
    expect(s.users.total).toBe(1);
    expect(s.weeklyActives).toBe(1);
    expect(s.paying.total).toBe(1);
    expect(s.granted.total).toBe(0);
    expect(s.activeTrials).toBe(0);
    expect(s.funnel.find((f) => f.name === "keep_applied")?.users7Days).toBe(1);
    expect(s.internal).toEqual({ accounts: 5, weeklyActives: 5 });
  });

  it("counts them when the toggle is off, but never in the goals", () => {
    const s = stats({
      excludeInternal: false,
      users: people,
      ownerEmails: ["me@gmail.com"],
      subscriptions: [sub("owner"), sub("real")],
      paymentEvents: [paid("owner"), paid("real")],
      activation: [
        { userId: "owner", name: "keep_applied", lastAt: daysAgo(1) },
        { userId: "real", name: "keep_applied", lastAt: daysAgo(1) },
      ],
    });
    expect(s.users.total).toBe(6);
    expect(s.weeklyActives).toBe(6);
    expect(s.paying.total).toBe(2);
    expect(s.goals.keep.value).toBe(1);
    expect(s.goals.paying.value).toBe(1);
    expect(s.goals.may.weeklyActives.value).toBe(1);
  });
});

describe("user tiles", () => {
  it("counts total, new in 7 days, weekly actives and waitlist", () => {
    const s = stats({
      users: [
        user("a", { createdAt: daysAgo(2), lastActiveAt: daysAgo(2) }),
        user("b", { createdAt: daysAgo(10), lastActiveAt: daysAgo(8) }),
        user("c", { createdAt: null }),
      ],
      waitlist: 4,
    });
    expect(s.users).toEqual({ total: 3, newLast7Days: 1 });
    expect(s.weeklyActives).toBe(1);
    expect(s.waitlist).toBe(4);
  });

  it("counts a trial only for a person who has not bought anything", () => {
    const s = stats({
      users: [user("t1"), user("t2"), user("t3")],
      subscriptions: [
        sub("t2", { plan: SubscriptionPlan.PRO }),
        { ...sub("t3"), plan: SubscriptionPlan.FREE },
      ],
      trialUserIds: ["t1", "t2", "t3"],
    });
    expect(s.activeTrials).toBe(2);
  });

  it("makes Free the people with no plan, grant or trial", () => {
    const s = stats({
      users: [user("a"), user("b"), user("c"), user("d")],
      subscriptions: [comp("a")],
      trialUserIds: ["b"],
    });
    expect(s.free).toBe(2);
  });
});

describe("activation funnel", () => {
  it("counts distinct users per step in 7 and 30 days", () => {
    const s = stats({
      users: [user("a"), user("b"), user("c")],
      activation: [
        { userId: "a", name: "account_created", lastAt: daysAgo(3) },
        { userId: "b", name: "account_created", lastAt: daysAgo(20) },
        { userId: "c", name: "account_created", lastAt: daysAgo(45) },
        { userId: "a", name: "task_created", lastAt: daysAgo(1) },
        { userId: "b", name: "task_created", lastAt: daysAgo(9) },
        { userId: "a", name: "keep_applied", lastAt: daysAgo(1) },
        { userId: "a", name: "first_replan_skipped", lastAt: daysAgo(2) },
      ],
    });
    const step = (name: string) => s.funnel.find((f) => f.name === name);
    expect(s.funnel.map((f) => f.name)).toEqual([
      "account_created",
      "calendar_connected",
      "task_created",
      "replan_shown",
      "keep_applied",
    ]);
    expect(step("account_created")).toMatchObject({
      users7Days: 1,
      users30Days: 2,
    });
    expect(step("task_created")).toMatchObject({
      users7Days: 1,
      users30Days: 2,
    });
    expect(step("calendar_connected")).toMatchObject({
      users7Days: 0,
      users30Days: 0,
    });
    expect(step("keep_applied")).toMatchObject({
      users7Days: 1,
      users30Days: 1,
    });
    expect(
      s.sideEvents.find((e) => e.name === "first_replan_skipped")
    ).toMatchObject({ users7Days: 1, users30Days: 1 });
  });
});

describe("weekly activity", () => {
  it("reports real past weeks from events, oldest first, internal left out", () => {
    const weekly = Array.from({ length: 8 }, () => [] as string[]);
    weekly[0] = ["a", "b", "boss"];
    weekly[2] = ["a"];
    const s = stats({
      users: [user("a"), user("b"), user("boss", { role: "admin" })],
      weeklyEventUserIds: weekly,
    });
    expect(s.weeks).toHaveLength(8);
    expect(s.weeks[7].activeUsers).toBe(2);
    expect(s.weeks[5].activeUsers).toBe(1);
    expect(s.weeks[0].activeUsers).toBe(0);
    expect(s.weeks[7].from).toBe(daysAgo(7).toISOString());
  });
});

describe("goals", () => {
  it("tracks Keep against 5 by 30.11 and paying against 10 by 31.12", () => {
    const keepers = ["a", "b", "c", "d", "e"];
    const s = stats({
      users: [
        ...keepers.map((id) => user(id)),
        user("boss", { role: "admin" }),
      ],
      subscriptions: [sub("a")],
      paymentEvents: [paid("a")],
      activation: [
        ...keepers.map((id) => ({
          userId: id,
          name: "keep_applied",
          lastAt: daysAgo(2),
        })),
        { userId: "boss", name: "keep_applied", lastAt: daysAgo(1) },
        { userId: "a", name: "keep_applied", lastAt: daysAgo(1) },
      ],
    });
    expect(s.goals.keep).toMatchObject({
      value: 5,
      target: 5,
      deadline: "2026-11-30",
      met: true,
      daysLeft: 15,
    });
    expect(s.goals.paying).toMatchObject({
      value: 1,
      target: 10,
      deadline: "2026-12-31",
      met: false,
    });
    expect(s.goals.may.weeklyActives.target).toBe(300);
    expect(s.goals.may.paying).toMatchObject({ target: 100, value: 1 });
  });
});
