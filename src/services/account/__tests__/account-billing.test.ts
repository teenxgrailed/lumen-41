import { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

import { getCreemClient } from "@/lib/creem/client";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { cancelRecurringBillingForDeletion } from "../account-billing";

jest.mock("@/lib/creem/client", () => ({ getCreemClient: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    subscription: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

describe("account deletion billing", () => {
  const cancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getCreemClient).mockReturnValue({
      subscriptions: { cancel },
    } as never);
    jest.mocked(prisma.subscription.updateMany).mockResolvedValue({ count: 1 });
  });

  it("cancels recurring Creem billing before local account erasure", async () => {
    jest.mocked(prisma.subscription.findUnique).mockResolvedValue({
      creemSubscriptionId: "sub_delete",
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.ACTIVE,
    } as never);
    cancel.mockResolvedValue({});

    await cancelRecurringBillingForDeletion("user-1");

    expect(cancel).toHaveBeenCalledWith("sub_delete", { mode: "immediate" });
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", creemSubscriptionId: "sub_delete" },
      data: {
        status: SubscriptionStatus.CANCELED,
        cancelAtPeriodEnd: false,
      },
    });
  });

  it("never sends an App Store subscription to Creem", async () => {
    // A row that once had a Creem subscription and is now sold by Apple.
    jest.mocked(prisma.subscription.findUnique).mockResolvedValue({
      creemSubscriptionId: "sub_old_creem",
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.ACTIVE,
      provider: "APPLE",
      appleOriginalTransactionId: "2000000000000001",
    } as never);

    await cancelRecurringBillingForDeletion("user-1");

    expect(cancel).not.toHaveBeenCalled();
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled();
    // Recorded: the buyer cancels it in iOS Settings.
    expect(logger.info).toHaveBeenCalledWith(
      "Account deletion left an App Store subscription to the buyer",
      { userId: "user-1", appleOriginalTransactionId: "2000000000000001" },
      "AccountBilling"
    );
  });

  it("does not call Creem for free or lifetime accounts", async () => {
    jest.mocked(prisma.subscription.findUnique).mockResolvedValue({
      creemSubscriptionId: null,
      plan: SubscriptionPlan.LIFETIME,
      status: SubscriptionStatus.ACTIVE,
    } as never);

    await cancelRecurringBillingForDeletion("user-1");

    expect(cancel).not.toHaveBeenCalled();
  });

  describe("provider errors", () => {
    beforeEach(() => {
      jest.mocked(prisma.subscription.findUnique).mockResolvedValue({
        creemSubscriptionId: "sub_gone",
        plan: SubscriptionPlan.PRO,
        status: SubscriptionStatus.ACTIVE,
      } as never);
    });

    it("treats a 404 from Creem as cancelled", async () => {
      cancel.mockRejectedValue({ statusCode: 404, body: "not found" });
      await expect(
        cancelRecurringBillingForDeletion("user-1")
      ).resolves.toBeUndefined();
      expect(prisma.subscription.updateMany).toHaveBeenCalled();
    });

    it("treats an already-cancelled subscription as cancelled", async () => {
      cancel.mockRejectedValue({
        statusCode: 400,
        body: '{"message":"Subscription is already canceled"}',
      });
      await expect(
        cancelRecurringBillingForDeletion("user-1")
      ).resolves.toBeUndefined();
    });

    it("rethrows any other provider error and leaves the row alone", async () => {
      cancel.mockRejectedValue({ statusCode: 500, body: "boom" });
      await expect(cancelRecurringBillingForDeletion("user-1")).rejects.toEqual(
        expect.objectContaining({ statusCode: 500 })
      );
      expect(prisma.subscription.updateMany).not.toHaveBeenCalled();
    });
  });
});
