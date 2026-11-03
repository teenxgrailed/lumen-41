import { SubscriptionPlan } from "@prisma/client";

import { lifetimeAvailability } from "@/lib/creem/lifetime-cap";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    subscription: { findUnique: jest.fn(), count: jest.fn() },
    lifetimeHold: { findUnique: jest.fn(), count: jest.fn() },
  },
}));

const db = prisma as unknown as {
  subscription: { findUnique: jest.Mock; count: jest.Mock };
  lifetimeHold: { findUnique: jest.Mock; count: jest.Mock };
};

describe("Lifetime seats with App Store buyers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.subscription.findUnique.mockResolvedValue(null);
    db.lifetimeHold.findUnique.mockResolvedValue(null);
    db.lifetimeHold.count.mockResolvedValue(0);
  });

  it("counts every Lifetime row, whoever sold it", async () => {
    // e.g. 250 Creem + 50 Apple buyers: one pool of 300.
    db.subscription.count.mockResolvedValue(300);

    expect(await lifetimeAvailability("user_1")).toEqual({
      available: false,
      left: 0,
    });
    // No provider filter: Apple (provider APPLE) and Creem rows count alike.
    expect(db.subscription.count).toHaveBeenCalledWith({
      where: { plan: SubscriptionPlan.LIFETIME },
    });
  });

  it("open Creem checkout holds and Apple buyers share the pool", async () => {
    db.subscription.count.mockResolvedValue(298);
    db.lifetimeHold.count.mockResolvedValue(1);

    expect(await lifetimeAvailability("user_1")).toEqual({
      available: true,
      left: 1,
    });
  });
});
