import { SubscriptionPlan } from "@prisma/client";

import { processCreemBillingEvent } from "@/lib/creem/webhook-processor";
import { prisma } from "@/lib/prisma";
import { sendUmamiPurchase } from "@/lib/umami-server";

jest.mock("@/lib/umami-server", () => ({
  ...jest.requireActual("@/lib/umami-server"),
  sendUmamiPurchase: jest.fn(),
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
    creemSubscriptionCursor: { findUnique: jest.fn(), upsert: jest.fn() },
    creemWebhookEvent: { createMany: jest.fn() },
    user: { findUnique: jest.fn() },
  },
}));

const products = {
  proMonthly: "prod_pro_month",
  proYearly: "prod_pro_year",
  lifetime: "prod_lifetime",
};

function checkout(id: string, product: string, extra = {}) {
  return {
    id,
    createdAt: 1_728_734_327_355,
    eventType: "checkout.completed" as const,
    object: {
      id: `checkout_${id}`,
      product: { id: product },
      customer: { id: "cust_1" },
      subscription: { id: "sub_1" },
      metadata: { referenceId: "user_1" },
      ...extra,
    },
  };
}

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

describe("purchase event from the Creem webhook", () => {
  it.each([
    ["prod_pro_year", "pro_year"],
    ["prod_pro_month", "pro_month"],
    ["prod_lifetime", "lifetime"],
  ])("sends %s as %s once the checkout is applied", async (product, plan) => {
    const result = await processCreemBillingEvent(checkout("evt_1", product));

    expect(result.processed).toBe(true);
    expect(sendUmamiPurchase).toHaveBeenCalledTimes(1);
    expect(sendUmamiPurchase).toHaveBeenCalledWith(plan);
  });

  it("sends nothing for a replayed event", async () => {
    (prisma.creemWebhookEvent.createMany as jest.Mock).mockResolvedValue({
      count: 0,
    });
    const result = await processCreemBillingEvent(
      checkout("evt_2", products.proYearly)
    );

    expect(result).toEqual({ processed: false, reason: "replayed_event" });
    expect(sendUmamiPurchase).not.toHaveBeenCalled();
  });

  it("sends nothing for a renewal or other subscription event", async () => {
    await processCreemBillingEvent({
      id: "evt_3",
      createdAt: 1_728_734_327_355,
      eventType: "subscription.paid",
      object: {
        id: "sub_1",
        product: { id: products.proYearly },
        customer: { id: "cust_1" },
        metadata: { referenceId: "user_1" },
      },
    });

    expect(sendUmamiPurchase).not.toHaveBeenCalled();
  });

  it("does not wait for, or fail on, the analytics call", async () => {
    (sendUmamiPurchase as jest.Mock).mockReturnValue(new Promise(() => {}));
    const result = await processCreemBillingEvent(
      checkout("evt_4", products.lifetime)
    );
    expect(result.processed).toBe(true);
  });
});
