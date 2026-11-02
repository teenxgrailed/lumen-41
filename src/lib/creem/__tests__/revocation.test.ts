import { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

import {
  mapCreemRevocationEvent,
  processCreemRevocationEvent,
} from "@/lib/creem/revocation";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(),
    subscription: { findFirst: jest.fn(), update: jest.fn() },
    creemWebhookEvent: { createMany: jest.fn() },
  },
}));

const tx = {
  subscription: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  creemSubscriptionCursor: { upsert: jest.fn() },
  lifetimeHold: { updateMany: jest.fn() },
  creemWebhookEvent: { createMany: jest.fn() },
};

// Creem sends `subscription`, `order` and `customer` expanded or as a bare id.
function refundEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_refund_1",
    createdAt: 1_790_000_000_000,
    eventType: "refund.created" as const,
    object: {
      id: "ref_1",
      object: "refund",
      status: "succeeded",
      refund_amount: 14_900,
      refund_currency: "USD",
      reason: "requested_by_customer",
      transaction: { id: "tx_1", amount: 14_900 },
      order: { id: "ord_1", amount: 14_900 },
      subscription: { id: "sub_1", product: "prod_lifetime" },
      customer: { id: "cust_1" },
      ...overrides,
    },
  };
}

function disputeEvent() {
  return {
    id: "evt_dispute_1",
    createdAt: 1_790_000_100_000,
    eventType: "dispute.created" as const,
    object: {
      id: "dsp_1",
      object: "dispute",
      amount: 700,
      currency: "USD",
      transaction: { id: "tx_2", amount: 700 },
      order: "ord_2",
      subscription: "sub_2",
      customer: "cust_2",
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (prisma.$transaction as jest.Mock).mockImplementation(
    async (fn: (client: typeof tx) => unknown) => fn(tx)
  );
  tx.creemWebhookEvent.createMany.mockResolvedValue({ count: 1 });
  tx.subscription.update.mockResolvedValue({});
  tx.creemSubscriptionCursor.upsert.mockResolvedValue({});
  tx.lifetimeHold.updateMany.mockResolvedValue({ count: 1 });
});

describe("mapping a Creem revocation", () => {
  it("reads references that arrive expanded", () => {
    expect(mapCreemRevocationEvent(refundEvent())).toMatchObject({
      kind: "refund",
      creemSubscriptionId: "sub_1",
      creemCustomerId: "cust_1",
      returnedAmount: 14_900,
      paidAmount: 14_900,
    });
  });

  it("reads references that arrive as bare ids", () => {
    expect(mapCreemRevocationEvent(disputeEvent())).toMatchObject({
      kind: "dispute",
      creemSubscriptionId: "sub_2",
      creemCustomerId: "cust_2",
      returnedAmount: 700,
      // `order` is a bare id here, so the paid amount comes off the transaction.
      paidAmount: 700,
    });
  });

  it("refuses an event that names neither a subscription nor a customer", () => {
    expect(
      mapCreemRevocationEvent(
        refundEvent({ subscription: undefined, customer: undefined })
      )
    ).toBeNull();
  });
});

describe("processing a Creem revocation", () => {
  it("drops a refunded buyer to FREE immediately", async () => {
    tx.subscription.findFirst.mockResolvedValue({
      id: "row_1",
      userId: "user_1",
      plan: SubscriptionPlan.LIFETIME,
    });

    await expect(processCreemRevocationEvent(refundEvent())).resolves.toEqual({
      processed: true,
      outcome: "revoked",
    });
    expect(tx.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "row_1" },
        data: expect.objectContaining({
          plan: SubscriptionPlan.FREE,
          status: SubscriptionStatus.CANCELED,
          currentPeriodEnd: null,
        }),
      })
    );
  });

  it("drops a disputed buyer to FREE", async () => {
    tx.subscription.findFirst.mockResolvedValue({
      id: "row_2",
      userId: "user_2",
      plan: SubscriptionPlan.PRO,
    });

    await expect(processCreemRevocationEvent(disputeEvent())).resolves.toEqual({
      processed: true,
      outcome: "revoked",
    });
  });

  it("keeps access when only part of the payment came back", async () => {
    tx.subscription.findFirst.mockResolvedValue({
      id: "row_3",
      userId: "user_3",
      plan: SubscriptionPlan.PRO,
    });

    await expect(
      processCreemRevocationEvent(refundEvent({ refund_amount: 500 }))
    ).resolves.toEqual({
      processed: false,
      outcome: "partial_refund_retained",
    });
    expect(tx.subscription.update).not.toHaveBeenCalled();
  });

  it("revokes when the event does not say what was originally paid", async () => {
    tx.subscription.findFirst.mockResolvedValue({
      id: "row_4",
      userId: "user_4",
      plan: SubscriptionPlan.PRO,
    });

    await expect(
      processCreemRevocationEvent(
        refundEvent({ order: "ord_1", transaction: { id: "tx_1" } })
      )
    ).resolves.toEqual({ processed: true, outcome: "revoked" });
  });

  it("records the receipt once and ignores the replay", async () => {
    tx.subscription.findFirst.mockResolvedValue({
      id: "row_5",
      userId: "user_5",
      plan: SubscriptionPlan.PRO,
    });
    tx.creemWebhookEvent.createMany.mockResolvedValue({ count: 0 });

    await expect(processCreemRevocationEvent(refundEvent())).resolves.toEqual({
      processed: false,
      outcome: "replayed_event",
    });
    expect(tx.subscription.update).not.toHaveBeenCalled();
  });

  it("advances the subscription cursor so a later event cannot re-grant Pro", async () => {
    tx.subscription.findFirst.mockResolvedValue({
      id: "row_6",
      userId: "user_6",
      plan: SubscriptionPlan.PRO,
      creemSubscriptionId: "sub_1",
      lastCreemEventAt: new Date(1_789_000_000_000),
    });

    await processCreemRevocationEvent(refundEvent());

    expect(tx.creemSubscriptionCursor.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_creemSubscriptionId: {
            userId: "user_6",
            creemSubscriptionId: "sub_1",
          },
        },
        update: expect.objectContaining({
          lastEventId: "evt_refund_1",
          lastEventAt: new Date(1_790_000_000_000),
          restrictionLevel: 5,
        }),
      })
    );
    expect(tx.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentPeriodEnd: null,
          lastCreemEventAt: new Date(1_790_000_000_000),
        }),
      })
    );
  });

  it("never moves the cursor back past what the row already recorded", async () => {
    tx.subscription.findFirst.mockResolvedValue({
      id: "row_7",
      userId: "user_7",
      plan: SubscriptionPlan.PRO,
      creemSubscriptionId: "sub_1",
      lastCreemEventAt: new Date(1_795_000_000_000),
    });

    await processCreemRevocationEvent(refundEvent());

    expect(tx.creemSubscriptionCursor.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          lastEventAt: new Date(1_795_000_000_000),
        }),
      })
    );
  });

  it("does not touch the cursor for a partial refund", async () => {
    tx.subscription.findFirst.mockResolvedValue({
      id: "row_8",
      userId: "user_8",
      plan: SubscriptionPlan.PRO,
      creemSubscriptionId: "sub_1",
      lastCreemEventAt: null,
    });

    await processCreemRevocationEvent(refundEvent({ refund_amount: 500 }));

    expect(tx.creemSubscriptionCursor.upsert).not.toHaveBeenCalled();
  });

  it("returns the Lifetime seat: the consumed hold is released on a full refund", async () => {
    tx.subscription.findFirst.mockResolvedValue({
      id: "row_9",
      userId: "user_9",
      plan: SubscriptionPlan.LIFETIME,
      creemSubscriptionId: null,
      lastCreemEventAt: null,
    });

    await processCreemRevocationEvent(refundEvent());

    expect(tx.lifetimeHold.updateMany).toHaveBeenCalledWith({
      where: { userId: "user_9", status: "CONSUMED" },
      data: { status: "EXPIRED" },
    });
  });

  it("leaves the hold alone when a Pro subscription is refunded", async () => {
    tx.subscription.findFirst.mockResolvedValue({
      id: "row_10",
      userId: "user_10",
      plan: SubscriptionPlan.PRO,
      creemSubscriptionId: "sub_1",
      lastCreemEventAt: null,
    });

    await processCreemRevocationEvent(refundEvent());

    expect(tx.lifetimeHold.updateMany).not.toHaveBeenCalled();
  });

  it("does nothing when no subscription of ours matches", async () => {
    tx.subscription.findFirst.mockResolvedValue(null);

    await expect(processCreemRevocationEvent(refundEvent())).resolves.toEqual({
      processed: false,
      outcome: "missing_subscription",
    });
    expect(tx.creemWebhookEvent.createMany).not.toHaveBeenCalled();
  });
});
