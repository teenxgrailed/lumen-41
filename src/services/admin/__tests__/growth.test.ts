import { SubscriptionPlan } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import { GROWTH_GOAL, GROWTH_TREND_WEEKS, getAdminGrowth } from "../growth";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { count: jest.fn() },
    trialGrant: { count: jest.fn() },
    subscription: { count: jest.fn() },
  },
}));

const db = prisma as unknown as {
  user: { count: jest.Mock };
  trialGrant: { count: jest.Mock };
  subscription: { count: jest.Mock };
};

const NOW = newDate("2026-11-05T12:00:00.000Z");

/** Counts the user table returns, newest week first (index 0 = this week). */
const SEEN = [120, 90, 70, 50, 40, 30, 20, 10];
const NEW_PAID = [3, 2, 1, 0, 4, 0, 0, 1];

function seed(seen: number[]) {
  let userCall = 0;
  db.user.count.mockImplementation(async () => seen[userCall++]);
  /* subscription.count order: Pro, Lifetime, then eight new-paying weeks. */
  const subs = [30, 6, ...NEW_PAID];
  let subCall = 0;
  db.subscription.count.mockImplementation(async () => subs[subCall++]);
}

beforeEach(() => {
  jest.clearAllMocks();
  db.trialGrant.count.mockResolvedValue(15);
  seed(SEEN);
});

describe("getAdminGrowth", () => {
  it("counts weekly actives as the newest 7-day window", async () => {
    const growth = await getAdminGrowth(NOW);
    expect(growth.weeklyActives).toBe(120);
    const firstWindow = db.user.count.mock.calls[0][0].where;
    expect(firstWindow.sandboxKind).toBeNull();
    expect(firstWindow.lastActiveAt.lte).toEqual(NOW);
    expect(firstWindow.lastActiveAt.gt.toISOString()).toBe(
      "2026-10-29T12:00:00.000Z"
    );
  });

  it("counts paying as active Pro plus Lifetime and keeps trials apart", async () => {
    const growth = await getAdminGrowth(NOW);
    expect(growth.paying).toEqual({ total: 36, pro: 30, lifetime: 6 });
    expect(growth.activeTrials).toBe(15);
  });

  it("uses the app's hold-the-plan rule and a trial count that excludes subscribers", async () => {
    await getAdminGrowth(NOW);
    const proWhere = db.subscription.count.mock.calls[0][0].where;
    const lifetimeWhere = db.subscription.count.mock.calls[1][0].where;
    expect(proWhere.plan).toBe(SubscriptionPlan.PRO);
    expect(lifetimeWhere.plan).toBe(SubscriptionPlan.LIFETIME);
    const trialWhere = db.trialGrant.count.mock.calls[0][0].where;
    expect(trialWhere.user.OR).toEqual([
      { subscription: { is: null } },
      { subscription: { is: { plan: SubscriptionPlan.FREE } } },
    ]);
  });

  it("returns eight week buckets, oldest first, the last being this week", async () => {
    const growth = await getAdminGrowth(NOW);
    expect(growth.weeks).toHaveLength(GROWTH_TREND_WEEKS);
    expect(growth.weeks.map((w) => w.lastSeen)).toEqual([...SEEN].reverse());
    expect(growth.weeks.map((w) => w.newPaying)).toEqual(
      [...NEW_PAID].reverse()
    );
    expect(growth.weeks[7].from).toBe("2026-10-29T12:00:00.000Z");
    expect(growth.weeks[0].from).toBe("2026-09-10T12:00:00.000Z");
  });

  it("measures the goal and what is still needed per week", async () => {
    const growth = await getAdminGrowth(NOW);
    expect(growth.goal).toBe(GROWTH_GOAL);
    expect(growth.daysToCheckpoint).toBe(92);
    expect(growth.daysToDeadline).toBe(181);
    /* (300 - 120) / (181 / 7) = 6.96 -> 7; (100 - 36) / 25.86 = 2.47 -> 3 */
    expect(growth.neededPerWeek).toEqual({ weeklyActives: 7, paying: 3 });
  });

  it("needs nothing more once a target is met", async () => {
    seed([300, ...SEEN.slice(1)]);
    const growth = await getAdminGrowth(NOW);
    expect(growth.neededPerWeek.weeklyActives).toBe(0);
  });
});
