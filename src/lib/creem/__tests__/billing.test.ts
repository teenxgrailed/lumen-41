import { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

import { getCreemClient } from "@/lib/creem/client";
import { getCreemProductId, isCreemConfigured } from "@/lib/creem/config";
import { mapCreemEventToSubscription } from "@/lib/creem/webhook-mapping";
import { processCreemBillingEvent } from "@/lib/creem/webhook-processor";
import { newDate } from "@/lib/date-utils";
import {
  PLAN_LIMITS,
  effectiveSubscriptionPlan,
  limitStatus,
} from "@/lib/entitlements";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/creem/client", () => {
  const actual = jest.requireActual("@/lib/creem/client");
  return { ...actual, getCreemClient: jest.fn(actual.getCreemClient) };
});
jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
    subscription: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      upsert: jest.fn(),
    },
    lifetimeHold: {
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    creemSubscriptionCursor: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    creemWebhookEvent: { createMany: jest.fn() },
    user: { findUnique: jest.fn() },
  },
}));

const products = {
  proMonthly: "prod_pro_month",
  proYearly: "prod_pro_year",
  lifetime: "prod_lifetime",
};

type ProcessorSubscriptionState = {
  userId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  creemSubscriptionId: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  lastCreemEventId: string;
  lastCreemEventAt: Date;
};

type ProcessorCursorState = {
  lastEventId: string;
  lastEventAt: Date;
  restrictionLevel: number;
};

function installStatefulProcessorState(
  initialSubscription: ProcessorSubscriptionState | null,
  initialCursors: Record<string, ProcessorCursorState> = {}
) {
  let subscription = initialSubscription;
  const cursors = new Map(Object.entries(initialCursors));
  const receipts = new Set<string>();

  (prisma.subscription.findFirst as jest.Mock).mockImplementation(
    async () => subscription
  );
  (prisma.subscription.findUnique as jest.Mock).mockImplementation(
    async () => subscription
  );
  (prisma.subscription.upsert as jest.Mock).mockImplementation(
    async ({ create, update }) => {
      subscription = {
        ...(subscription ?? create),
        ...(subscription ? update : create),
      } as ProcessorSubscriptionState;
      return subscription;
    }
  );
  (prisma.creemSubscriptionCursor.findUnique as jest.Mock).mockImplementation(
    async ({ where }) =>
      cursors.get(where.userId_creemSubscriptionId.creemSubscriptionId) ?? null
  );
  (prisma.creemSubscriptionCursor.upsert as jest.Mock).mockImplementation(
    async ({ where, create, update }) => {
      const subscriptionId =
        where.userId_creemSubscriptionId.creemSubscriptionId;
      const cursor = cursors.has(subscriptionId) ? update : create;
      cursors.set(subscriptionId, cursor);
      return cursor;
    }
  );
  (prisma.creemWebhookEvent.createMany as jest.Mock).mockImplementation(
    async ({ data }) => {
      const eventId = data[0].id;
      if (receipts.has(eventId)) return { count: 0 };
      receipts.add(eventId);
      return { count: 1 };
    }
  );

  return {
    cursor: (subscriptionId: string) => cursors.get(subscriptionId),
    subscription: () => subscription,
  };
}

describe("Creem checkout selection", () => {
  it("maps each trusted checkout mode to its configured product", () => {
    expect(
      getCreemProductId({ plan: "pro", interval: "month" }, products)
    ).toBe(products.proMonthly);
    expect(getCreemProductId({ plan: "pro", interval: "year" }, products)).toBe(
      products.proYearly
    );
    expect(getCreemProductId({ plan: "lifetime" }, products)).toBe(
      products.lifetime
    );
  });

  it("does not throw at module import when Creem is unconfigured", () => {
    const previousApiKey = process.env.CREEM_API_KEY;
    delete process.env.CREEM_API_KEY;

    expect(isCreemConfigured()).toBe(false);
    expect(() => getCreemClient()).toThrow("Creem is not configured");

    if (previousApiKey) process.env.CREEM_API_KEY = previousApiKey;
  });
});

describe("Creem webhook subscription mapping", () => {
  it("maps a completed Lifetime checkout to an active lifetime plan", () => {
    const mutation = mapCreemEventToSubscription(
      {
        id: "evt_lifetime_checkout",
        createdAt: 1_728_734_325_927,
        eventType: "checkout.completed",
        object: {
          product: { id: products.lifetime },
          customer: { id: "cust_1" },
          metadata: { referenceId: "user_1" },
          order: { amountPaid: 14900 },
        },
      },
      products
    );

    expect(mutation).toMatchObject({
      userId: "user_1",
      creemCustomerId: "cust_1",
      creemSubscriptionId: null,
      data: {
        plan: SubscriptionPlan.LIFETIME,
        status: SubscriptionStatus.ACTIVE,
        creemProductId: products.lifetime,
        interval: null,
        amount: 14900,
      },
    });
  });

  it("maps paid and scheduled-cancel subscription events", () => {
    const active = mapCreemEventToSubscription(
      {
        id: "evt_paid",
        createdAt: 1_728_734_327_355,
        eventType: "subscription.paid",
        object: {
          id: "sub_1",
          product: { id: products.proYearly },
          customer: { id: "cust_1" },
          currentPeriodEndDate: "2099-08-01T00:00:00.000Z",
        },
      },
      products
    );
    const canceling = mapCreemEventToSubscription(
      {
        id: "evt_scheduled_cancel",
        createdAt: 1_728_734_337_932,
        eventType: "subscription.scheduled_cancel",
        object: {
          id: "sub_1",
          product: { id: products.proYearly },
          customer: { id: "cust_1" },
          current_period_end_date: "2099-08-01T00:00:00.000Z",
        },
      },
      products
    );

    expect(active?.data).toMatchObject({
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.ACTIVE,
      interval: "year",
      cancelAtPeriodEnd: false,
    });
    expect(canceling?.data).toMatchObject({
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.ACTIVE,
      interval: "year",
      cancelAtPeriodEnd: true,
    });
  });

  it("rejects webhook products that are not in trusted configuration", () => {
    expect(
      mapCreemEventToSubscription(
        {
          id: "evt_untrusted",
          createdAt: 1_728_734_325_927,
          eventType: "checkout.completed",
          object: {
            product: { id: "prod_from_untrusted_metadata" },
            metadata: { referenceId: "user_1", plan: "LIFETIME" },
          },
        },
        products
      )
    ).toBeNull();
  });

  it("revokes access immediately for paused subscriptions", () => {
    const mutation = mapCreemEventToSubscription(
      {
        id: "evt_paused",
        createdAt: 1_728_734_337_932,
        eventType: "subscription.paused",
        object: {
          id: "sub_1",
          product: { id: products.proMonthly },
          customer: { id: "cust_1" },
          current_period_end_date: "2099-08-01T00:00:00.000Z",
        },
      },
      products
    );

    expect(mutation?.data).toMatchObject({
      status: SubscriptionStatus.CANCELED,
      currentPeriodEnd: null,
    });
  });

  it("distinguishes unpaid from the earlier past-due retry state", () => {
    const mutation = mapCreemEventToSubscription(
      {
        id: "evt_unpaid_update",
        createdAt: 1_728_734_337_932,
        eventType: "subscription.update",
        object: {
          id: "sub_1",
          product: { id: products.proMonthly },
          customer: { id: "cust_1" },
          status: "unpaid",
        },
      },
      products
    );

    expect(mutation?.data.status).toBe(SubscriptionStatus.PAYMENT_FAILED);
  });
});

describe("Creem webhook processing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CREEM_PRODUCT_PRO_MONTHLY = products.proMonthly;
    process.env.CREEM_PRODUCT_PRO_YEARLY = products.proYearly;
    process.env.CREEM_PRODUCT_LIFETIME = products.lifetime;
    (prisma.subscription.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.subscription.count as jest.Mock).mockResolvedValue(0);
    (prisma.$executeRaw as jest.Mock).mockResolvedValue(0);
    (prisma.lifetimeHold.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.lifetimeHold.count as jest.Mock).mockResolvedValue(0);
    (prisma.lifetimeHold.update as jest.Mock).mockResolvedValue({});
    (prisma.creemSubscriptionCursor.findUnique as jest.Mock).mockResolvedValue(
      null
    );
    (prisma.creemSubscriptionCursor.upsert as jest.Mock).mockResolvedValue({});
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: "user_1" });
    (prisma.creemWebhookEvent.createMany as jest.Mock).mockResolvedValue({
      count: 1,
    });
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (operation: (transaction: typeof prisma) => Promise<unknown>) =>
        operation(prisma)
    );
    (prisma.subscription.upsert as jest.Mock).mockResolvedValue({
      userId: "user_1",
      plan: SubscriptionPlan.PRO,
    });
  });

  it("ignores an older active event after a newer cancellation", async () => {
    (prisma.subscription.findFirst as jest.Mock).mockResolvedValue({
      userId: "user_1",
      plan: SubscriptionPlan.PRO,
      lastCreemEventId: "evt_cancel",
      lastCreemEventAt: newDate(1_728_734_337_932),
    });
    (prisma.creemSubscriptionCursor.findUnique as jest.Mock).mockResolvedValue({
      lastEventAt: newDate(1_728_734_337_932),
      restrictionLevel: 4,
    });

    const result = await processCreemBillingEvent({
      id: "evt_active_old",
      createdAt: 1_728_734_327_355,
      eventType: "subscription.active",
      object: {
        id: "sub_1",
        product: { id: products.proMonthly },
        customer: { id: "cust_1" },
      },
    });

    expect(result).toEqual({ processed: false, reason: "stale_event" });
    expect(prisma.subscription.upsert).not.toHaveBeenCalled();
    expect(prisma.creemWebhookEvent.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ outcome: "stale_event" })],
      })
    );
  });

  it.each([
    ["scheduled cancel", SubscriptionStatus.ACTIVE, true, true],
    ["past due", SubscriptionStatus.PAST_DUE, false, true],
    ["unpaid", SubscriptionStatus.PAYMENT_FAILED, false, true],
    ["canceled", SubscriptionStatus.CANCELED, true, true],
    ["expired", SubscriptionStatus.CANCELED, false, false],
  ])(
    "does not weaken %s at the same provider timestamp",
    async (label, status, cancelAtPeriodEnd, hasPaidThroughDate) => {
      const eventCreatedAt = 1_728_734_337_932;
      (prisma.subscription.findFirst as jest.Mock).mockResolvedValue({
        userId: "user_1",
        plan: SubscriptionPlan.PRO,
        status,
        creemSubscriptionId: "sub_1",
        currentPeriodEnd: hasPaidThroughDate
          ? newDate("2099-08-01T00:00:00.000Z")
          : null,
        cancelAtPeriodEnd,
        lastCreemEventId: `evt_${label}`,
        lastCreemEventAt: newDate(eventCreatedAt),
      });

      for (const eventType of [
        "subscription.active",
        "subscription.paid",
      ] as const) {
        const result = await processCreemBillingEvent({
          id: `evt_equal_${eventType}_${label}`,
          createdAt: eventCreatedAt,
          eventType,
          object: {
            id: "sub_1",
            product: { id: products.proMonthly },
            customer: { id: "cust_1" },
          },
        });

        expect(result).toEqual({
          processed: false,
          reason: "equal_time_weaker_event",
        });
      }

      expect(prisma.subscription.upsert).not.toHaveBeenCalled();
      expect(prisma.creemWebhookEvent.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            expect.objectContaining({ outcome: "equal_time_weaker_event" }),
          ],
        })
      );
    }
  );

  it("allows a more restrictive event at the same provider timestamp", async () => {
    const eventCreatedAt = 1_728_734_337_932;
    (prisma.subscription.findFirst as jest.Mock).mockResolvedValue({
      userId: "user_1",
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.PAST_DUE,
      creemSubscriptionId: "sub_1",
      currentPeriodEnd: newDate("2099-08-01T00:00:00.000Z"),
      cancelAtPeriodEnd: false,
      lastCreemEventId: "evt_past_due",
      lastCreemEventAt: newDate(eventCreatedAt),
    });

    const result = await processCreemBillingEvent({
      id: "evt_equal_expired",
      createdAt: eventCreatedAt,
      eventType: "subscription.expired",
      object: {
        id: "sub_1",
        product: { id: products.proMonthly },
        customer: { id: "cust_1" },
      },
    });

    expect(result.processed).toBe(true);
    expect(prisma.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: SubscriptionStatus.CANCELED,
          currentPeriodEnd: null,
        }),
      })
    );
  });

  it("allows an equal-time resubscribe with a new subscription id", async () => {
    const eventCreatedAt = 1_728_734_337_932;
    (prisma.subscription.findFirst as jest.Mock).mockResolvedValue({
      userId: "user_1",
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.CANCELED,
      creemSubscriptionId: "sub_old",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      lastCreemEventId: "evt_expired",
      lastCreemEventAt: newDate(eventCreatedAt),
    });
    (prisma.creemSubscriptionCursor.findUnique as jest.Mock).mockImplementation(
      async ({ where }) =>
        where.userId_creemSubscriptionId.creemSubscriptionId === "sub_old"
          ? {
              lastEventId: "evt_expired",
              lastEventAt: newDate(eventCreatedAt),
              restrictionLevel: 5,
            }
          : null
    );

    const result = await processCreemBillingEvent({
      id: "evt_equal_resubscribe",
      createdAt: eventCreatedAt,
      eventType: "subscription.active",
      object: {
        id: "sub_new",
        product: { id: products.proMonthly },
        customer: { id: "cust_1" },
      },
    });

    expect(result.processed).toBe(true);
    expect(prisma.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: SubscriptionStatus.ACTIVE,
          creemSubscriptionId: "sub_new",
        }),
      })
    );
  });

  it("ignores a later restrictive event from the old subscription after resubscribe", async () => {
    const eventCreatedAt = 1_728_734_337_932;
    (prisma.subscription.findFirst as jest.Mock).mockResolvedValue({
      userId: "user_1",
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.ACTIVE,
      creemSubscriptionId: "sub_new",
      currentPeriodEnd: newDate("2099-08-01T00:00:00.000Z"),
      cancelAtPeriodEnd: false,
      lastCreemEventId: "evt_resubscribed",
      lastCreemEventAt: newDate(eventCreatedAt),
    });

    const result = await processCreemBillingEvent({
      id: "evt_later_old_expired",
      createdAt: eventCreatedAt + 1_000,
      eventType: "subscription.expired",
      object: {
        id: "sub_old",
        product: { id: products.proMonthly },
        customer: { id: "cust_1" },
      },
    });

    expect(result).toEqual({
      processed: false,
      reason: "subscription_identity_mismatch",
    });
    expect(prisma.subscription.upsert).not.toHaveBeenCalled();
    expect(prisma.creemWebhookEvent.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            outcome: "subscription_identity_mismatch",
          }),
        ],
      })
    );
  });

  it("does not let a later foreign grant replace an unrestricted active id", async () => {
    const eventCreatedAt = 1_728_734_337_932;
    (prisma.subscription.findFirst as jest.Mock).mockResolvedValue({
      userId: "user_1",
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.ACTIVE,
      creemSubscriptionId: "sub_old",
      currentPeriodEnd: newDate("2099-08-01T00:00:00.000Z"),
      cancelAtPeriodEnd: false,
      lastCreemEventId: "evt_resubscribed",
      lastCreemEventAt: newDate(eventCreatedAt),
    });

    const result = await processCreemBillingEvent({
      id: "evt_new_active",
      createdAt: eventCreatedAt + 1_000,
      eventType: "subscription.active",
      object: {
        id: "sub_new",
        product: { id: products.proMonthly },
        customer: { id: "cust_1" },
      },
    });

    expect(result).toEqual({
      processed: false,
      reason: "subscription_identity_mismatch",
    });
    expect(prisma.subscription.upsert).not.toHaveBeenCalled();
    expect(prisma.creemSubscriptionCursor.upsert).not.toHaveBeenCalled();
  });

  it("keeps a dunning subscription protected from a foreign paid-expired pair", async () => {
    const paidThrough = newDate("2099-08-01T00:00:00.000Z");
    const baseTime = 1_728_734_337_932;
    const state = installStatefulProcessorState(
      {
        userId: "user_1",
        plan: SubscriptionPlan.PRO,
        status: SubscriptionStatus.ACTIVE,
        creemSubscriptionId: "sub_B",
        currentPeriodEnd: paidThrough,
        cancelAtPeriodEnd: false,
        lastCreemEventId: "evt_paid_B",
        lastCreemEventAt: newDate(baseTime),
      },
      {
        sub_B: {
          lastEventId: "evt_paid_B",
          lastEventAt: newDate(baseTime),
          restrictionLevel: 0,
        },
      }
    );

    await expect(
      processCreemBillingEvent({
        id: "evt_past_due_B",
        createdAt: baseTime + 1_000,
        eventType: "subscription.past_due",
        object: {
          id: "sub_B",
          product: { id: products.proMonthly },
          customer: { id: "cust_1" },
        },
      })
    ).resolves.toMatchObject({ processed: true });

    await expect(
      processCreemBillingEvent({
        id: "evt_old_paid_A",
        createdAt: baseTime + 2_000,
        eventType: "subscription.paid",
        object: {
          id: "sub_A",
          product: { id: products.proMonthly },
          customer: { id: "cust_1" },
          current_period_end_date: "2020-01-01T00:00:00.000Z",
        },
      })
    ).resolves.toEqual({
      processed: false,
      reason: "subscription_identity_mismatch",
    });
    await expect(
      processCreemBillingEvent({
        id: "evt_old_expired_A",
        createdAt: baseTime + 3_000,
        eventType: "subscription.expired",
        object: {
          id: "sub_A",
          product: { id: products.proMonthly },
          customer: { id: "cust_1" },
        },
      })
    ).resolves.toEqual({
      processed: false,
      reason: "subscription_identity_mismatch",
    });

    expect(state.subscription()).toMatchObject({
      creemSubscriptionId: "sub_B",
      status: SubscriptionStatus.PAST_DUE,
      currentPeriodEnd: paidThrough,
    });
    expect(effectiveSubscriptionPlan(state.subscription())).toBe(
      SubscriptionPlan.PRO
    );
    expect(state.cursor("sub_A")).toBeUndefined();
  });

  it("keeps rejected concurrent grants unclaimed until the stored id ends", async () => {
    const baseTime = 1_728_734_337_932;
    const state = installStatefulProcessorState(null);

    await expect(
      processCreemBillingEvent({
        id: "evt_paid_A",
        createdAt: baseTime + 1_000,
        eventType: "subscription.paid",
        object: {
          id: "sub_A",
          product: { id: products.proMonthly },
          customer: { id: "cust_1" },
          current_period_end_date: "2099-08-01T00:00:00.000Z",
          metadata: { referenceId: "user_1" },
        },
      })
    ).resolves.toMatchObject({ processed: true });
    await expect(
      processCreemBillingEvent({
        id: "evt_paid_B_rejected",
        createdAt: baseTime + 2_000,
        eventType: "subscription.paid",
        object: {
          id: "sub_B",
          product: { id: products.proMonthly },
          customer: { id: "cust_1" },
          current_period_end_date: "2099-09-01T00:00:00.000Z",
        },
      })
    ).resolves.toEqual({
      processed: false,
      reason: "subscription_identity_mismatch",
    });
    expect(state.cursor("sub_B")).toBeUndefined();

    await expect(
      processCreemBillingEvent({
        id: "evt_expired_A",
        createdAt: baseTime + 3_000,
        eventType: "subscription.expired",
        object: {
          id: "sub_A",
          product: { id: products.proMonthly },
          customer: { id: "cust_1" },
        },
      })
    ).resolves.toMatchObject({ processed: true });
    await expect(
      processCreemBillingEvent({
        id: "evt_paid_B_after_A_ended",
        createdAt: baseTime + 4_000,
        eventType: "subscription.paid",
        object: {
          id: "sub_B",
          product: { id: products.proMonthly },
          customer: { id: "cust_1" },
          current_period_end_date: "2099-09-01T00:00:00.000Z",
        },
      })
    ).resolves.toMatchObject({ processed: true });
    expect(state.subscription()).toMatchObject({
      creemSubscriptionId: "sub_B",
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: newDate("2099-09-01T00:00:00.000Z"),
    });
    expect(effectiveSubscriptionPlan(state.subscription())).toBe(
      SubscriptionPlan.PRO
    );
  });

  it("does not let a rejected future restriction make an earlier grant stale", async () => {
    const baseTime = 1_728_734_337_932;
    const state = installStatefulProcessorState(null);

    await expect(
      processCreemBillingEvent({
        id: "evt_future_cancel_A",
        createdAt: baseTime + 9_000,
        eventType: "subscription.scheduled_cancel",
        object: {
          id: "sub_A",
          product: { id: products.proMonthly },
          customer: { id: "cust_1" },
          metadata: { referenceId: "user_1" },
        },
      })
    ).resolves.toEqual({
      processed: false,
      reason: "subscription_identity_mismatch",
    });
    expect(state.cursor("sub_A")).toBeUndefined();

    await expect(
      processCreemBillingEvent({
        id: "evt_earlier_paid_A",
        createdAt: baseTime + 1_000,
        eventType: "subscription.paid",
        object: {
          id: "sub_A",
          product: { id: products.proMonthly },
          customer: { id: "cust_1" },
          current_period_end_date: "2099-08-01T00:00:00.000Z",
          metadata: { referenceId: "user_1" },
        },
      })
    ).resolves.toMatchObject({ processed: true });
    expect(state.subscription()).toMatchObject({
      creemSubscriptionId: "sub_A",
      status: SubscriptionStatus.ACTIVE,
    });
    expect(state.cursor("sub_A")).toMatchObject({
      lastEventId: "evt_earlier_paid_A",
      lastEventAt: newDate(baseTime + 1_000),
      restrictionLevel: 0,
    });
  });

  it("allows a new grant to replace a subscription already in cancellation grace", async () => {
    (prisma.subscription.findFirst as jest.Mock).mockResolvedValue({
      userId: "user_1",
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.CANCELED,
      creemSubscriptionId: "sub_old",
      currentPeriodEnd: newDate("2099-08-01T00:00:00.000Z"),
      cancelAtPeriodEnd: true,
      lastCreemEventId: "evt_canceled",
      lastCreemEventAt: newDate(1_728_734_327_355),
    });
    (prisma.creemSubscriptionCursor.findUnique as jest.Mock).mockImplementation(
      async ({ where }) =>
        where.userId_creemSubscriptionId.creemSubscriptionId === "sub_old"
          ? {
              lastEventId: "evt_expired",
              lastEventAt: newDate(1_728_734_327_355),
              restrictionLevel: 5,
            }
          : null
    );

    const result = await processCreemBillingEvent({
      id: "evt_new_paid",
      createdAt: 1_728_734_337_932,
      eventType: "subscription.paid",
      object: {
        id: "sub_new",
        product: { id: products.proMonthly },
        customer: { id: "cust_1" },
        current_period_end_date: "2099-09-01T00:00:00.000Z",
      },
    });

    expect(result.processed).toBe(true);
    expect(prisma.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: SubscriptionStatus.ACTIVE,
          creemSubscriptionId: "sub_new",
        }),
      })
    );
  });

  it("fails closed when a recurring event has no incoming subscription id", async () => {
    (prisma.subscription.findFirst as jest.Mock).mockResolvedValue({
      userId: "user_1",
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.ACTIVE,
      creemSubscriptionId: "sub_current",
      currentPeriodEnd: newDate("2099-08-01T00:00:00.000Z"),
      cancelAtPeriodEnd: false,
      lastCreemEventId: "evt_active",
      lastCreemEventAt: newDate(1_728_734_327_355),
    });

    const result = await processCreemBillingEvent({
      id: "evt_expired_without_id",
      createdAt: 1_728_734_337_932,
      eventType: "subscription.expired",
      object: {
        product: { id: products.proMonthly },
        customer: { id: "cust_1" },
      },
    });

    expect(result).toEqual({
      processed: false,
      reason: "missing_subscription_identity",
    });
    expect(prisma.subscription.upsert).not.toHaveBeenCalled();
    expect(prisma.creemSubscriptionCursor.upsert).not.toHaveBeenCalled();
  });

  it("does not let a restrictive event claim a paid row with a null stored id", async () => {
    (prisma.subscription.findFirst as jest.Mock).mockResolvedValue({
      userId: "user_1",
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.ACTIVE,
      creemSubscriptionId: null,
      currentPeriodEnd: newDate("2099-08-01T00:00:00.000Z"),
      cancelAtPeriodEnd: false,
      lastCreemEventId: "evt_legacy_grant",
      lastCreemEventAt: newDate(1_728_734_327_355),
    });

    const result = await processCreemBillingEvent({
      id: "evt_expired_claiming_legacy_row",
      createdAt: 1_728_734_337_932,
      eventType: "subscription.expired",
      object: {
        id: "sub_unverified",
        product: { id: products.proMonthly },
        customer: { id: "cust_1" },
      },
    });

    expect(result).toEqual({
      processed: false,
      reason: "subscription_identity_mismatch",
    });
    expect(prisma.subscription.upsert).not.toHaveBeenCalled();
    expect(prisma.creemSubscriptionCursor.upsert).not.toHaveBeenCalled();
  });

  it("preserves an active subscription against an equal-time grant with another id", async () => {
    const eventCreatedAt = 1_728_734_337_932;
    (prisma.subscription.findFirst as jest.Mock).mockResolvedValue({
      userId: "user_1",
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.ACTIVE,
      creemSubscriptionId: "sub_new",
      currentPeriodEnd: newDate("2099-08-01T00:00:00.000Z"),
      cancelAtPeriodEnd: false,
      lastCreemEventId: "evt_resubscribed",
      lastCreemEventAt: newDate(eventCreatedAt),
    });

    const result = await processCreemBillingEvent({
      id: "evt_equal_other_active",
      createdAt: eventCreatedAt,
      eventType: "subscription.active",
      object: {
        id: "sub_other",
        product: { id: products.proMonthly },
        customer: { id: "cust_1" },
      },
    });

    expect(result).toEqual({
      processed: false,
      reason: "subscription_identity_mismatch",
    });
    expect(prisma.subscription.upsert).not.toHaveBeenCalled();
  });

  it.each([
    ["subscription.past_due", SubscriptionStatus.PAST_DUE],
    ["subscription.unpaid", SubscriptionStatus.PAYMENT_FAILED],
    ["subscription.canceled", SubscriptionStatus.CANCELED],
    ["subscription.scheduled_cancel", SubscriptionStatus.ACTIVE],
  ] as const)(
    "keeps the paid-through date when %s omits it",
    async (eventType, expectedStatus) => {
      const paidThrough = newDate("2099-08-01T00:00:00.000Z");
      (prisma.subscription.findFirst as jest.Mock).mockResolvedValue({
        userId: "user_1",
        plan: SubscriptionPlan.PRO,
        status: SubscriptionStatus.ACTIVE,
        creemSubscriptionId: "sub_1",
        currentPeriodEnd: paidThrough,
        cancelAtPeriodEnd: false,
        lastCreemEventId: "evt_active",
        lastCreemEventAt: newDate(1_728_734_327_355),
      });

      await processCreemBillingEvent({
        id: `evt_without_period_${eventType}`,
        createdAt: 1_728_734_337_932,
        eventType,
        object: {
          id: "sub_1",
          product: { id: products.proMonthly },
          customer: { id: "cust_1" },
        },
      });

      expect(prisma.subscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            status: expectedStatus,
            currentPeriodEnd: paidThrough,
          }),
        })
      );
    }
  );

  it("does not downgrade Lifetime when an old Pro event arrives late", async () => {
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
      userId: "user_1",
      plan: SubscriptionPlan.LIFETIME,
    });

    const result = await processCreemBillingEvent({
      id: "evt_old_pro",
      createdAt: 1_728_734_327_355,
      eventType: "subscription.update",
      object: {
        id: "sub_old",
        product: { id: products.proMonthly },
        customer: { id: "cust_1" },
        metadata: { referenceId: "user_1" },
      },
    });

    expect(result).toEqual({
      processed: false,
      reason: "lifetime_preserved",
    });
    expect(prisma.subscription.upsert).not.toHaveBeenCalled();
  });

  it("atomically consumes the matching hold when Lifetime is granted", async () => {
    (prisma.lifetimeHold.findFirst as jest.Mock).mockResolvedValue({
      id: "reservation_1",
      userId: "user_1",
      requestId: "request_1",
      creemCheckoutId: "checkout_1",
      status: "PENDING",
    });

    const result = await processCreemBillingEvent({
      id: "evt_lifetime_reserved",
      createdAt: 1_728_734_327_355,
      eventType: "checkout.completed",
      object: {
        id: "checkout_1",
        requestId: "request_1",
        product: { id: products.lifetime },
        customer: { id: "cust_1" },
        metadata: {
          referenceId: "user_1",
          lifetimeReservationId: "reservation_1",
        },
      },
    });

    expect(result.processed).toBe(true);
    expect(prisma.lifetimeHold.update).toHaveBeenCalledWith({
      where: { id: "reservation_1" },
      data: { status: "CONSUMED" },
    });
  });

  describe("Pro to Lifetime upgrade", () => {
    const cancel = jest.fn();
    const proRow = {
      userId: "user_1",
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.ACTIVE,
      creemSubscriptionId: "sub_pro_old",
      currentPeriodEnd: newDate(1_790_000_000_000),
      cancelAtPeriodEnd: false,
      lastCreemEventId: "evt_pro",
      lastCreemEventAt: newDate(1_728_000_000_000),
    };
    const lifetimeEvent = {
      id: "evt_upgrade",
      createdAt: 1_728_734_327_355,
      eventType: "checkout.completed" as const,
      object: {
        id: "checkout_up",
        product: { id: products.lifetime },
        customer: { id: "cust_1" },
        metadata: { referenceId: "user_1" },
      },
    };

    beforeEach(() => {
      cancel.mockReset().mockResolvedValue({});
      (getCreemClient as jest.Mock).mockReturnValue({
        subscriptions: { cancel },
      });
    });

    afterEach(() => {
      (getCreemClient as jest.Mock).mockImplementation(
        jest.requireActual("@/lib/creem/client").getCreemClient
      );
    });

    it("cancels the old Pro subscription at Creem when Lifetime is granted", async () => {
      (prisma.subscription.findFirst as jest.Mock).mockResolvedValue(proRow);

      const result = await processCreemBillingEvent(lifetimeEvent);

      expect(result.processed).toBe(true);
      expect(cancel).toHaveBeenCalledWith("sub_pro_old", { mode: "immediate" });
    });

    it("still grants Lifetime and logs when the cancel fails", async () => {
      (prisma.subscription.findFirst as jest.Mock).mockResolvedValue(proRow);
      cancel.mockRejectedValue(new Error("creem down"));

      const result = await processCreemBillingEvent(lifetimeEvent);

      expect(result.processed).toBe(true);
      expect(prisma.subscription.upsert).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("superseded by Lifetime"),
        expect.objectContaining({ creemSubscriptionId: "sub_pro_old" }),
        "CreemWebhookProcessor"
      );
    });

    it("does not cancel anything for a first-time Lifetime buyer", async () => {
      await processCreemBillingEvent(lifetimeEvent);

      expect(cancel).not.toHaveBeenCalled();
    });

    it("does not cancel an already canceled Pro subscription", async () => {
      (prisma.subscription.findFirst as jest.Mock).mockResolvedValue({
        ...proRow,
        status: SubscriptionStatus.CANCELED,
      });

      await processCreemBillingEvent(lifetimeEvent);

      expect(cancel).not.toHaveBeenCalled();
    });
  });

  it("grants a Lifetime payment with no reservation and marks the receipt", async () => {
    const result = await processCreemBillingEvent({
      id: "evt_lifetime_over_cap",
      createdAt: 1_728_734_327_355,
      eventType: "checkout.completed",
      object: {
        id: "checkout_301",
        product: { id: products.lifetime },
        customer: { id: "cust_301" },
        metadata: { referenceId: "user_1" },
      },
    });

    expect(result).toMatchObject({ processed: true });
    expect(prisma.subscription.upsert).toHaveBeenCalled();
    expect(prisma.creemWebhookEvent.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            outcome: "processed_without_lifetime_reservation",
          }),
        ],
      })
    );
  });

  it.each([
    ["subscription.expired", undefined],
    ["subscription.paused", undefined],
    ["subscription.update", "canceled"],
  ] as const)(
    "preserves Lifetime for a Lifetime-product %s event",
    async (eventType, status) => {
      (prisma.subscription.findFirst as jest.Mock).mockResolvedValue({
        userId: "user_1",
        plan: SubscriptionPlan.LIFETIME,
        status: SubscriptionStatus.ACTIVE,
        creemSubscriptionId: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        lastCreemEventId: "evt_lifetime_checkout",
        lastCreemEventAt: newDate(1_728_734_327_355),
      });

      const result = await processCreemBillingEvent({
        id: `evt_lifetime_${eventType}`,
        createdAt: 1_728_734_337_932,
        eventType,
        object: {
          id: "sub_lifetime_stray",
          product: { id: products.lifetime },
          customer: { id: "cust_lifetime" },
          ...(status ? { status } : {}),
        },
      });

      expect(result).toEqual({
        processed: false,
        reason: "lifetime_preserved",
      });
      expect(prisma.subscription.upsert).not.toHaveBeenCalled();
    }
  );

  it("restores a paused subscription when Creem reports it active again", async () => {
    (prisma.subscription.findFirst as jest.Mock).mockResolvedValue({
      userId: "user_1",
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.CANCELED,
      creemSubscriptionId: "sub_1",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      lastCreemEventId: "evt_paused",
      lastCreemEventAt: newDate(1_728_734_327_355),
    });

    const result = await processCreemBillingEvent({
      id: "evt_resumed",
      createdAt: 1_728_734_337_932,
      eventType: "subscription.update",
      object: {
        id: "sub_1",
        product: { id: products.proMonthly },
        customer: { id: "cust_1" },
        status: "active",
        current_period_end_date: "2099-08-01T00:00:00.000Z",
      },
    });

    expect(result.processed).toBe(true);
    expect(prisma.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: SubscriptionStatus.ACTIVE,
          currentPeriodEnd: newDate("2099-08-01T00:00:00.000Z"),
        }),
      })
    );
  });
});

describe("billing entitlements", () => {
  it.each([
    [SubscriptionPlan.FREE, 1, 1, false, true],
    [SubscriptionPlan.PRO, null, 250, true, false],
    [SubscriptionPlan.LIFETIME, null, 250, true, false],
  ] as const)(
    "returns structured limit status for %s",
    (plan, limit, used, allowed, upgradeRequired) => {
      expect(limitStatus(plan, limit, used)).toMatchObject({
        allowed,
        limit,
        used,
        upgradeRequired,
      });
    }
  );

  it("keeps the requested plan matrix in one server-side source", () => {
    expect(PLAN_LIMITS.FREE).toMatchObject({
      calendars: 1,
      autoScheduledTasks: 15,
      boards: 1,
      mailboxes: 0,
      aiAgent: false,
      focusStats: false,
    });
    expect(PLAN_LIMITS.PRO).toEqual(PLAN_LIMITS.LIFETIME);
  });

  it("honors paid access only for active or not-yet-expired periods", () => {
    expect(
      effectiveSubscriptionPlan({
        plan: SubscriptionPlan.PRO,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: null,
      })
    ).toBe(SubscriptionPlan.PRO);
    expect(
      effectiveSubscriptionPlan({
        plan: SubscriptionPlan.PRO,
        status: SubscriptionStatus.CANCELED,
        currentPeriodEnd: newDate("2099-01-01T00:00:00.000Z"),
      })
    ).toBe(SubscriptionPlan.PRO);
    expect(
      effectiveSubscriptionPlan({
        plan: SubscriptionPlan.PRO,
        status: SubscriptionStatus.PAYMENT_FAILED,
        currentPeriodEnd: newDate("2099-01-01T00:00:00.000Z"),
      })
    ).toBe(SubscriptionPlan.PRO);
    expect(
      effectiveSubscriptionPlan({
        plan: SubscriptionPlan.PRO,
        status: SubscriptionStatus.PAST_DUE,
        currentPeriodEnd: newDate("2000-01-01T00:00:00.000Z"),
      })
    ).toBe(SubscriptionPlan.FREE);
  });
});
