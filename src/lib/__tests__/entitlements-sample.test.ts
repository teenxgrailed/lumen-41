import { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

import { canAutoScheduleMore, canCreateHabit } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    habit: { count: jest.fn() },
    task: { count: jest.fn() },
  },
}));

const db = prisma as unknown as {
  user: { findUnique: jest.Mock };
  habit: { count: jest.Mock };
  task: { count: jest.Mock };
};

beforeEach(() => {
  jest.clearAllMocks();
  db.user.findUnique.mockResolvedValue({
    subscription: {
      plan: SubscriptionPlan.FREE,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: new Date("2999-01-01"),
    },
    trialGrant: null,
  });
});

describe("first-run examples do not count toward Free limits", () => {
  it("the habit allowance skips sample habits", async () => {
    db.habit.count.mockResolvedValue(0);
    await canCreateHabit("u1");
    expect(db.habit.count).toHaveBeenCalledWith({
      where: { userId: "u1", archivedAt: null, isSample: false },
    });
  });

  it("the auto-schedule allowance skips sample tasks", async () => {
    db.task.count.mockResolvedValue(0);
    await canAutoScheduleMore("u1");
    expect(db.task.count.mock.calls[0][0].where).toMatchObject({
      userId: "u1",
      isSample: false,
    });
  });
});
