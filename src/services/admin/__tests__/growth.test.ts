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
const PAID_ACTIVITY = [3, 2, 1, 0, 4, 0, 0, 1];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** Week index (0 = this week) from the upper edge of a count's window. */
const weekOf = (lte: Date) =>
  Math.round((NOW.getTime() - lte.getTime()) / WEEK_MS);

/* Mocks answer by what the query asks for, never by call order. */
function seed(seen: number[]) {
  db.user.count.mockImplementation(
    async ({ where }: { where: { lastActiveAt: { lte: Date } } }) =>
      seen[weekOf(where.lastActiveAt.lte)]
  );
  db.subscription.count.mockImplementation(
    async ({
      where,
    }: {
      where: {
        plan?: SubscriptionPlan;
        AND?: [unknown, { updatedAt: { lte: Date } }];
      };
    }) => {
      if (where.plan === SubscriptionPlan.PRO) return 30;
      if (where.plan === SubscriptionPlan.LIFETIME) return 6;
      return PAID_ACTIVITY[weekOf(where.AND![1].updatedAt.lte)];
    }
  );
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
    const wheres = db.subscription.count.mock.calls.map((c) => c[0].where);
    const proWhere = wheres.find((w) => w.plan === SubscriptionPlan.PRO);
    const lifetimeWhere = wheres.find(
      (w) => w.plan === SubscriptionPlan.LIFETIME
    );
    expect(proWhere).toBeDefined();
    expect(lifetimeWhere).toBeDefined();
    const trialWhere = db.trialGrant.count.mock.calls[0][0].where;
    expect(trialWhere.user.OR).toEqual([
      { subscription: { is: null } },
      { subscription: { is: { plan: SubscriptionPlan.FREE } } },
    ]);
  });

  it("leaves sandbox accounts out of paying, paid activity and trials", async () => {
    await getAdminGrowth(NOW);
    for (const [{ where }] of db.subscription.count.mock.calls) {
      const parts = where.AND ? where.AND[0].OR : [where];
      for (const part of parts) {
        expect(part.user).toEqual({ sandboxKind: null });
      }
    }
    expect(
      db.trialGrant.count.mock.calls[0][0].where.user.sandboxKind
    ).toBeNull();
  });

  it("buckets paid activity by when the row last changed, not created", async () => {
    await getAdminGrowth(NOW);
    const weekly = db.subscription.count.mock.calls
      .map((c) => c[0].where)
      .filter((w) => w.AND);
    expect(weekly).toHaveLength(GROWTH_TREND_WEEKS);
    for (const w of weekly) {
      expect(w.AND[1]).toHaveProperty("updatedAt");
      expect(w.AND[1]).not.toHaveProperty("createdAt");
    }
  });

  it("returns eight week buckets, oldest first, the last being this week", async () => {
    const growth = await getAdminGrowth(NOW);
    expect(growth.weeks).toHaveLength(GROWTH_TREND_WEEKS);
    expect(growth.weeks.map((w) => w.lastSeen)).toEqual([...SEEN].reverse());
    expect(growth.weeks.map((w) => w.paidActivity)).toEqual(
      [...PAID_ACTIVITY].reverse()
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
