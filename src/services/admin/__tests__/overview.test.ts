import { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import { getAdminOverview } from "../overview";

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { count: jest.fn() },
    trialGrant: { count: jest.fn() },
    subscription: { count: jest.fn() },
    waitlist: { count: jest.fn() },
  },
}));

const db = prisma as unknown as {
  user: { count: jest.Mock };
  trialGrant: { count: jest.Mock };
  subscription: { count: jest.Mock };
  waitlist: { count: jest.Mock };
};

const NOW = newDate("2026-10-16T12:00:00.000Z");

beforeEach(() => {
  jest.clearAllMocks();
  db.user.count.mockResolvedValueOnce(100).mockResolvedValueOnce(9);
  db.trialGrant.count.mockResolvedValue(20);
  db.subscription.count.mockResolvedValueOnce(12).mockResolvedValueOnce(3);
  db.waitlist.count.mockResolvedValue(41);
});

describe("getAdminOverview", () => {
  it("returns the counts and derives Free as everyone not paid and not on trial", async () => {
    const overview = await getAdminOverview(NOW);
    expect(overview).toMatchObject({
      users: { total: 100, newLast7Days: 9 },
      activeTrials: 20,
      plans: { pro: 12, lifetime: 3, free: 65 },
      waitlist: 41,
      generatedAt: "2026-10-16T12:00:00.000Z",
    });
  });

  it("counts new users from seven calendar days before now", async () => {
    await getAdminOverview(NOW);
    const where = db.user.count.mock.calls[1][0].where;
    expect(where.createdAt.gte.toISOString()).toBe("2026-10-09T12:00:00.000Z");
  });

  it("counts a trial only while it runs and only for people who have not paid", async () => {
    await getAdminOverview(NOW);
    const where = db.trialGrant.count.mock.calls[0][0].where;
    expect(where.endsAt).toEqual({ gt: NOW });
    expect(where.user.OR).toEqual([
      { subscription: { is: null } },
      { subscription: { is: { plan: SubscriptionPlan.FREE } } },
    ]);
  });

  it("counts Pro and Lifetime by the rule the entitlements use", async () => {
    await getAdminOverview(NOW);
    const pro = db.subscription.count.mock.calls[0][0].where;
    expect(pro.plan).toBe(SubscriptionPlan.PRO);
    expect(pro.OR[0]).toEqual({ status: SubscriptionStatus.ACTIVE });
    expect(pro.OR[1].currentPeriodEnd).toEqual({ gt: NOW });
    expect(db.subscription.count.mock.calls[1][0].where.plan).toBe(
      SubscriptionPlan.LIFETIME
    );
  });

  it("never reports a negative Free count", async () => {
    db.user.count.mockReset();
    db.user.count.mockResolvedValueOnce(5).mockResolvedValueOnce(0);
    const overview = await getAdminOverview(NOW);
    expect(overview.plans.free).toBe(0);
  });
});
