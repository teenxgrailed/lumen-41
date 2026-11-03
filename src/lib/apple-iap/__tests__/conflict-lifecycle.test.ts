import { NextRequest } from "next/server";

import { GET as lifecycle } from "@/app/api/account/lifecycle/route";

import { processCreemBillingEvent } from "@/lib/creem/webhook-processor";

import { applyAppleEntitlement } from "../entitlement";
import { stateFromNotification } from "../state";

/**
 * One row through the whole double-billing story, on a stateful fake of the
 * few Prisma calls involved: Apple Pro renews, a Creem plan is bought on top
 * (flag set), the Creem plan ends, Apple renews (flag cleared), Apple expires.
 */

type Row = Record<string, unknown> & { userId: string };

const store: {
  row: Row | null;
  cursors: Map<string, Record<string, unknown>>;
  events: Set<string>;
} = { row: null, cursors: new Map(), events: new Set() };

jest.mock("@/lib/prisma", () => {
  const matches = (row: Row | null, where: Record<string, unknown>) => {
    if (!row) return false;
    if ("userId" in where) return row.userId === where.userId;
    if ("appleOriginalTransactionId" in where) {
      return (
        row.appleOriginalTransactionId === where.appleOriginalTransactionId
      );
    }
    const or = (where.OR as Record<string, unknown>[] | undefined) ?? [];
    return or.some((clause) =>
      Object.entries(clause).every(([key, value]) => row[key] === value)
    );
  };
  const cursorKey = (where: {
    userId_creemSubscriptionId: { userId: string; creemSubscriptionId: string };
  }) =>
    `${where.userId_creemSubscriptionId.userId}|${where.userId_creemSubscriptionId.creemSubscriptionId}`;
  const prisma: Record<string, unknown> = {
    $executeRaw: jest.fn(async () => 0),
    subscription: {
      findFirst: jest.fn(async ({ where }) =>
        matches(store.row, where) ? { ...store.row } : null
      ),
      findUnique: jest.fn(async ({ where }) =>
        matches(store.row, where) ? { ...store.row } : null
      ),
      upsert: jest.fn(async ({ create, update }) => {
        store.row = store.row
          ? { ...store.row, ...update }
          : ({ provider: null, appleConflictSince: null, ...create } as Row);
        return { ...store.row };
      }),
      update: jest.fn(async ({ data }) => {
        store.row = { ...(store.row as Row), ...data };
        return { ...store.row };
      }),
    },
    creemSubscriptionCursor: {
      findUnique: jest.fn(
        async ({ where }) => store.cursors.get(cursorKey(where)) ?? null
      ),
      upsert: jest.fn(async ({ where, create, update }) => {
        const key = cursorKey(where);
        store.cursors.set(key, {
          ...(store.cursors.get(key) ?? create),
          ...update,
        });
      }),
    },
    creemWebhookEvent: {
      createMany: jest.fn(async ({ data }) => {
        if (store.events.has(data[0].id)) return { count: 0 };
        store.events.add(data[0].id);
        return { count: 1 };
      }),
    },
    user: { findUnique: jest.fn(async () => ({ id: "user_1" })) },
    account: { findMany: jest.fn(async () => []) },
    accountDeletionRequest: { findUnique: jest.fn(async () => null) },
  };
  prisma.$transaction = jest.fn(async (operation: (tx: unknown) => unknown) =>
    operation(prisma)
  );
  return { prisma };
});
jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock("@/lib/creem/pending-cancel", () => ({
  settlePendingCreemCancel: jest.fn(async () => true),
}));
jest.mock("@/lib/umami-server", () => ({
  purchasePlan: jest.fn(() => null),
  sendUmamiPurchase: jest.fn(),
}));
jest.mock("@/lib/auth/account-request-auth", () => ({
  authenticateAccountRequest: jest.fn(async () => ({
    user: { id: "user_1", email: "person@example.test", isActive: true },
    sessionHash: "hash",
  })),
}));

const day = 24 * 3600 * 1000;
const OTID = "2000000000000001";

async function appleNotification(
  notificationType: string,
  transactionId: string,
  subtype: string | null = null
) {
  const now = Date.now();
  const state = stateFromNotification({
    notificationType,
    subtype,
    transaction: {
      transactionId,
      originalTransactionId: OTID,
      productId: "app.needt.pro.monthly",
      expiresDate: now + 30 * day,
    },
    renewalInfo: { autoRenewStatus: 1 },
  });
  return applyAppleEntitlement({
    userId: "user_1",
    originalTransactionId: OTID,
    transactionId,
    productId: "app.needt.pro.monthly",
    bundleId: "app.needt.ios",
    environment: "Production",
    signedAt: new Date(now),
    state: state!,
    origin: "notification",
  });
}

async function deletionWarning() {
  const response = await lifecycle(
    new NextRequest("http://localhost/api/account/lifecycle")
  );
  return (await response.json()).appleSubscription;
}

beforeAll(() => {
  process.env.CREEM_PRODUCT_PRO_MONTHLY = "prod_pro_month";
  process.env.CREEM_PRODUCT_PRO_YEARLY = "prod_pro_year";
  process.env.CREEM_PRODUCT_LIFETIME = "prod_lifetime";
});

it("flags a Creem plan bought on top of a renewing App Store Pro, then clears the flag once Apple sells again", async () => {
  // 1. An App Store Pro that renews.
  store.row = {
    userId: "user_1",
    provider: "APPLE",
    plan: "PRO",
    status: "ACTIVE",
    interval: "month",
    currentPeriodEnd: new Date(Date.now() + 20 * day),
    cancelAtPeriodEnd: false,
    creemCustomerId: null,
    creemSubscriptionId: null,
    creemProductId: null,
    lastCreemEventId: null,
    lastCreemEventAt: null,
    appleOriginalTransactionId: OTID,
    appleTransactionId: "t1",
    appleLastSignedAt: new Date(Date.now() - day),
    appleEnvironment: "Production",
    appleConflictSince: null,
  };

  // 2. A Creem subscription paid on top: applied, and the double billing
  //    flagged.
  const bought = await processCreemBillingEvent({
    id: "evt_creem_active",
    createdAt: Date.now() - 60_000,
    eventType: "subscription.active",
    object: {
      id: "sub_web",
      product: { id: "prod_pro_month" },
      customer: { id: "cust_1" },
      metadata: { referenceId: "user_1" },
    },
  });
  expect(bought.processed).toBe(true);
  expect(store.row).toMatchObject({ provider: "CREEM", plan: "PRO" });
  expect(store.row?.appleConflictSince).toBeInstanceOf(Date);
  expect(await deletionWarning()).toEqual({
    manageUrl: "https://apps.apple.com/account/subscriptions",
  });

  // 3. The Creem plan ends.
  const ended = await processCreemBillingEvent({
    id: "evt_creem_expired",
    createdAt: Date.now() - 30_000,
    eventType: "subscription.expired",
    object: {
      id: "sub_web",
      product: { id: "prod_pro_month" },
      customer: { id: "cust_1" },
      metadata: { referenceId: "user_1" },
    },
  });
  expect(ended.processed).toBe(true);
  expect(store.row).toMatchObject({ provider: "CREEM", status: "CANCELED" });

  // 4. Apple renews: Apple sells the plan again and the flag goes.
  expect((await appleNotification("DID_RENEW", "t2")).outcome).toBe("applied");
  expect(store.row).toMatchObject({
    provider: "APPLE",
    plan: "PRO",
    status: "ACTIVE",
    appleConflictSince: null,
  });
  // `alsoBilledBy` in GET /api/billing is exactly this column.
  expect(store.row?.appleConflictSince).toBeNull();

  // 5. Apple expires: no double-billing flag, no deletion warning.
  expect((await appleNotification("EXPIRED", "t2", "VOLUNTARY")).outcome).toBe(
    "applied"
  );
  expect(store.row).toMatchObject({
    provider: "APPLE",
    status: "CANCELED",
    currentPeriodEnd: null,
    appleConflictSince: null,
  });
  expect(await deletionWarning()).toBeNull();
});
