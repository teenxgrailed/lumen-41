import { createTestChain } from "@/lib/apple-iap/__tests__/test-chain";
import type { AppleIapConfig } from "@/lib/apple-iap/config";
import { lifetimeAvailability } from "@/lib/creem/lifetime-cap";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";
import { isSandboxUser } from "@/lib/sandbox/guard";

import {
  appleAccountToken,
  appleOfferedProducts,
  processAppleNotification,
  processAppleTransactionPost,
} from "../apple-iap";
import { getBillingSummary } from "../billing-summary";

jest.mock("../billing-summary", () => ({
  getBillingSummary: jest.fn(),
}));
jest.mock("@/lib/creem/lifetime-cap", () => ({
  ...jest.requireActual("@/lib/creem/lifetime-cap"),
  lifetimeAvailability: jest.fn(),
}));
jest.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: jest.fn() }));
jest.mock("@/lib/sandbox/guard", () => ({ isSandboxUser: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock("@/lib/prisma", () => {
  const prisma = {
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
    user: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    subscription: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    appleNotificationReceipt: {
      createMany: jest.fn(),
      update: jest.fn(),
    },
  };
  return { prisma };
});

const db = prisma as unknown as {
  $transaction: jest.Mock;
  $executeRaw: jest.Mock;
  user: { findUnique: jest.Mock; updateMany: jest.Mock };
  subscription: { findUnique: jest.Mock; upsert: jest.Mock };
  appleNotificationReceipt: { createMany: jest.Mock; update: jest.Mock };
};

const chain = createTestChain();
const stranger = createTestChain("Stranger");
const config: AppleIapConfig = {
  environment: "Sandbox",
  allowSandbox: false,
  bundleIds: ["app.needt.ios", "app.needt.mac"],
  appAppleId: null,
};
const verify = { config, rootCertificates: [chain.root] };

const TOKEN = "6f0a6c43-9d55-4a4b-8f39-1f8c1e5b1f00";
const OTHER_TOKEN = "0b6b0f0e-5c43-4c3c-9d7a-0d1f6b5e2a11";
const day = 24 * 3600 * 1000;
const summary = { plan: "PRO", source: "apple" };

function tx(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    transactionId: "2000000000000002",
    originalTransactionId: "2000000000000001",
    bundleId: "app.needt.ios",
    productId: "app.needt.pro.monthly",
    type: "Auto-Renewable Subscription",
    purchaseDate: now - day,
    expiresDate: now + 29 * day,
    signedDate: now,
    environment: "Sandbox",
    appAccountToken: TOKEN,
    ...overrides,
  };
}

function appleRow(overrides: Record<string, unknown> = {}) {
  return {
    provider: "APPLE",
    plan: "PRO",
    status: "ACTIVE",
    currentPeriodEnd: new Date(Date.now() + 29 * day),
    creemCustomerId: null,
    creemSubscriptionId: null,
    creemProductId: null,
    appleOriginalTransactionId: "2000000000000001",
    appleTransactionId: "2000000000000002",
    appleLastSignedAt: new Date(Date.now() - day),
    ...overrides,
  };
}

/** Subscription lookups: by original transaction id (owner) and by user. */
function subscriptions(
  byUser: Record<string, unknown> | null,
  owner: { userId: string } | null = byUser ? { userId: "user_1" } : null
) {
  db.subscription.findUnique.mockImplementation(
    ({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve("appleOriginalTransactionId" in where ? owner : byUser)
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  db.$transaction.mockImplementation((operation: (tx: unknown) => unknown) =>
    operation(prisma)
  );
  db.user.findUnique.mockResolvedValue({ appleAppAccountToken: TOKEN });
  db.subscription.upsert.mockResolvedValue({});
  db.appleNotificationReceipt.createMany.mockResolvedValue({ count: 1 });
  jest.mocked(getBillingSummary).mockResolvedValue(summary as never);
  jest.mocked(isSandboxUser).mockResolvedValue(false);
  jest.mocked(isFeatureEnabled).mockResolvedValue(true);
  jest.mocked(lifetimeAvailability).mockResolvedValue({
    available: true,
    left: 120,
  });
  subscriptions(null);
});

describe("POST /api/billing/apple/transactions", () => {
  it("applies a new purchase and answers with the billing summary", async () => {
    const result = await processAppleTransactionPost(
      "user_1",
      chain.sign(tx()),
      verify
    );

    expect(result).toEqual({ ok: true, summary });
    expect(db.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user_1" },
        create: expect.objectContaining({
          userId: "user_1",
          provider: "APPLE",
          plan: "PRO",
          status: "ACTIVE",
          interval: "month",
          appleOriginalTransactionId: "2000000000000001",
          appleTransactionId: "2000000000000002",
          appleProductId: "app.needt.pro.monthly",
          appleBundleId: "app.needt.ios",
          appleEnvironment: "Sandbox",
        }),
      })
    );
  });

  it("matches the account token whatever its case", async () => {
    const result = await processAppleTransactionPost(
      "user_1",
      chain.sign(tx({ appAccountToken: TOKEN.toUpperCase() })),
      verify
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a transaction bought under another account token", async () => {
    const result = await processAppleTransactionPost(
      "user_1",
      chain.sign(tx({ appAccountToken: OTHER_TOKEN })),
      verify
    );
    expect(result).toMatchObject({
      ok: false,
      status: 403,
      code: "APPLE_ACCOUNT_MISMATCH",
    });
    expect(db.subscription.upsert).not.toHaveBeenCalled();
  });

  it("rejects a transaction with no account token", async () => {
    const result = await processAppleTransactionPost(
      "user_1",
      chain.sign(tx({ appAccountToken: undefined })),
      verify
    );
    expect(result).toMatchObject({ status: 403 });
  });

  it("rejects a bad signature", async () => {
    const result = await processAppleTransactionPost(
      "user_1",
      stranger.sign(tx()),
      verify
    );
    expect(result).toMatchObject({
      ok: false,
      status: 400,
      code: "APPLE_INVALID_SIGNATURE",
    });
    expect(db.subscription.upsert).not.toHaveBeenCalled();
  });

  it("rejects another app's bundle", async () => {
    const result = await processAppleTransactionPost(
      "user_1",
      chain.sign(tx({ bundleId: "com.example.app" })),
      verify
    );
    expect(result).toMatchObject({ status: 400, code: "APPLE_WRONG_BUNDLE" });
  });

  it("rejects the other environment", async () => {
    const result = await processAppleTransactionPost(
      "user_1",
      chain.sign(tx({ environment: "Production" })),
      verify
    );
    expect(result).toMatchObject({
      status: 400,
      code: "APPLE_WRONG_ENVIRONMENT",
    });
  });

  it("rejects a missing body field", async () => {
    const result = await processAppleTransactionPost("user_1", undefined);
    expect(result).toMatchObject({ status: 400, code: "INVALID_BODY" });
  });

  it("is idempotent: the same transaction posted again writes nothing", async () => {
    subscriptions(appleRow());
    const result = await processAppleTransactionPost(
      "user_1",
      chain.sign(tx()),
      verify
    );
    expect(result).toEqual({ ok: true, summary });
    expect(db.subscription.upsert).not.toHaveBeenCalled();
  });

  it("does not undo an auto-renew-off state on a repost", async () => {
    subscriptions(appleRow({ status: "CANCELED" }));
    await processAppleTransactionPost("user_1", chain.sign(tx()), verify);
    expect(db.subscription.upsert).not.toHaveBeenCalled();
  });

  it("applies a renewal (a new transaction id under the same original)", async () => {
    subscriptions(appleRow());
    await processAppleTransactionPost(
      "user_1",
      chain.sign(tx({ transactionId: "2000000000000003" })),
      verify
    );
    expect(db.subscription.upsert).toHaveBeenCalledTimes(1);
  });

  it("ignores data older than what is stored", async () => {
    subscriptions(appleRow({ appleLastSignedAt: new Date(Date.now() + day) }));
    await processAppleTransactionPost(
      "user_1",
      chain.sign(tx({ transactionId: "2000000000000003" })),
      verify
    );
    expect(db.subscription.upsert).not.toHaveBeenCalled();
  });

  it("refuses to stack an Apple plan on a live Creem plan", async () => {
    subscriptions(
      {
        provider: "CREEM",
        plan: "PRO",
        status: "ACTIVE",
        currentPeriodEnd: null,
        creemCustomerId: "cust_1",
        creemSubscriptionId: "sub_1",
        creemProductId: "prod_1",
        appleOriginalTransactionId: null,
        appleTransactionId: null,
        appleLastSignedAt: null,
      },
      null
    );
    const result = await processAppleTransactionPost(
      "user_1",
      chain.sign(tx()),
      verify
    );
    expect(result).toMatchObject({
      ok: false,
      status: 409,
      code: "CREEM_ACTIVE",
    });
    expect(db.subscription.upsert).not.toHaveBeenCalled();
  });

  it("takes over a row whose Creem plan has ended", async () => {
    subscriptions(
      {
        provider: null,
        plan: "PRO",
        status: "CANCELED",
        currentPeriodEnd: new Date(Date.now() - day),
        creemCustomerId: "cust_1",
        creemSubscriptionId: "sub_1",
        creemProductId: "prod_1",
        appleOriginalTransactionId: null,
        appleTransactionId: null,
        appleLastSignedAt: null,
      },
      null
    );
    const result = await processAppleTransactionPost(
      "user_1",
      chain.sign(tx()),
      verify
    );
    expect(result.ok).toBe(true);
    expect(db.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ provider: "APPLE", plan: "PRO" }),
      })
    );
  });

  it("refuses a transaction already tied to another Needt account", async () => {
    subscriptions(null, { userId: "user_2" });
    const result = await processAppleTransactionPost(
      "user_1",
      chain.sign(tx()),
      verify
    );
    expect(result).toMatchObject({
      status: 409,
      code: "APPLE_TRANSACTION_IN_USE",
    });
  });

  it("grants Lifetime under the shared seat lock", async () => {
    await processAppleTransactionPost(
      "user_1",
      chain.sign(
        tx({
          transactionId: "3000000000000001",
          originalTransactionId: "3000000000000001",
          productId: "app.needt.lifetime",
          type: "Non-Consumable",
          expiresDate: undefined,
        })
      ),
      verify
    );
    // lockLifetimeCapacity: the same advisory lock the Creem seat count uses.
    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
    expect(db.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          plan: "LIFETIME",
          status: "ACTIVE",
          provider: "APPLE",
        }),
      })
    );
  });

  it("keeps an Apple Lifetime when an old subscription transaction arrives", async () => {
    subscriptions(
      appleRow({
        plan: "LIFETIME",
        currentPeriodEnd: null,
        appleOriginalTransactionId: "3000000000000001",
        appleTransactionId: "3000000000000001",
      }),
      null
    );
    const result = await processAppleTransactionPost(
      "user_1",
      chain.sign(tx()),
      verify
    );
    expect(result.ok).toBe(true);
    expect(db.subscription.upsert).not.toHaveBeenCalled();
  });
});

describe("POST /api/billing/apple/notifications", () => {
  let uuid = 0;
  function notification(
    notificationType: string,
    options: {
      subtype?: string;
      transaction?: Record<string, unknown>;
      renewal?: Record<string, unknown>;
      signer?: typeof chain;
    } = {}
  ) {
    uuid += 1;
    const signer = options.signer ?? chain;
    return signer.sign({
      notificationType,
      ...(options.subtype ? { subtype: options.subtype } : {}),
      notificationUUID: `00000000-0000-4000-8000-${String(uuid).padStart(12, "0")}`,
      version: "2.0",
      signedDate: Date.now(),
      data: {
        bundleId: "app.needt.ios",
        environment: "Sandbox",
        signedTransactionInfo: chain.sign(tx(options.transaction)),
        signedRenewalInfo: chain.sign({
          originalTransactionId: "2000000000000001",
          productId: "app.needt.pro.monthly",
          autoRenewStatus: 1,
          environment: "Sandbox",
          signedDate: Date.now(),
          ...options.renewal,
        }),
      },
    });
  }

  function mapToken(userId: string | null) {
    db.user.findUnique.mockImplementation(
      ({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          "appleAppAccountToken" in where
            ? userId
              ? { id: userId }
              : null
            : { appleAppAccountToken: TOKEN }
        )
    );
  }

  it("answers 400 to a bad signature and records nothing", async () => {
    const result = await processAppleNotification(
      notification("DID_RENEW", { signer: stranger }),
      verify
    );
    expect(result.status).toBe(400);
    expect(db.appleNotificationReceipt.createMany).not.toHaveBeenCalled();
  });

  it("answers 400 to a missing payload", async () => {
    expect((await processAppleNotification(undefined, verify)).status).toBe(
      400
    );
  });

  it("answers 200 to TEST", async () => {
    mapToken(null);
    const result = await processAppleNotification(notification("TEST"), verify);
    expect(result).toEqual({
      status: 200,
      body: { ok: true, outcome: "test" },
    });
    expect(db.subscription.upsert).not.toHaveBeenCalled();
  });

  it("answers 200 to a verified notification that maps to nobody", async () => {
    mapToken(null);
    const result = await processAppleNotification(
      notification("DID_RENEW"),
      verify
    );
    expect(result).toEqual({
      status: 200,
      body: { ok: true, outcome: "unmapped" },
    });
    expect(db.appleNotificationReceipt.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: null,
          notificationType: "DID_RENEW",
        }),
      ],
      skipDuplicates: true,
    });
    expect(db.subscription.upsert).not.toHaveBeenCalled();
  });

  it("answers a replayed notification without applying it twice", async () => {
    mapToken("user_1");
    db.appleNotificationReceipt.createMany.mockResolvedValue({ count: 0 });
    const result = await processAppleNotification(
      notification("DID_RENEW"),
      verify
    );
    expect(result.body.outcome).toBe("replayed");
    expect(db.subscription.upsert).not.toHaveBeenCalled();
  });

  it("maps by appAccountToken", async () => {
    mapToken("user_1");
    const result = await processAppleNotification(
      notification("SUBSCRIBED", { subtype: "INITIAL_BUY" }),
      verify
    );
    expect(result.body.outcome).toBe("applied");
    expect(db.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user_1" } })
    );
  });

  it("falls back to the stored original transaction id", async () => {
    mapToken(null);
    subscriptions(appleRow());
    const result = await processAppleNotification(
      notification("REFUND", {
        transaction: { appAccountToken: undefined, revocationDate: Date.now() },
      }),
      verify
    );
    expect(result.body.outcome).toBe("applied");
    expect(db.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          plan: "FREE",
          status: "CANCELED",
          currentPeriodEnd: null,
        }),
      })
    );
  });

  it.each([
    ["SUBSCRIBED", "RESUBSCRIBE", {}, { plan: "PRO", status: "ACTIVE" }],
    ["DID_RENEW", undefined, {}, { plan: "PRO", status: "ACTIVE" }],
    [
      "DID_CHANGE_RENEWAL_STATUS",
      "AUTO_RENEW_DISABLED",
      { autoRenewStatus: 0 },
      { plan: "PRO", status: "CANCELED", cancelAtPeriodEnd: true },
    ],
    [
      "DID_FAIL_TO_RENEW",
      "GRACE_PERIOD",
      { gracePeriodExpiresDate: Date.now() + 6 * day },
      { plan: "PRO", status: "PAST_DUE" },
    ],
    [
      "GRACE_PERIOD_EXPIRED",
      undefined,
      {},
      { plan: "PRO", status: "PAYMENT_FAILED", currentPeriodEnd: null },
    ],
    [
      "EXPIRED",
      "VOLUNTARY",
      {},
      { plan: "PRO", status: "CANCELED", currentPeriodEnd: null },
    ],
    ["REFUND", undefined, {}, { plan: "FREE", status: "CANCELED" }],
    ["REVOKE", undefined, {}, { plan: "FREE", status: "CANCELED" }],
  ])("%s %s is stored", async (type, subtype, renewal, expected) => {
    mapToken("user_1");
    // A newer transaction id, so the notification is never "the same post".
    subscriptions(appleRow({ appleTransactionId: "old" }));
    const result = await processAppleNotification(
      notification(type, { subtype, renewal }),
      verify
    );
    expect(result.status).toBe(200);
    expect(db.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining(expected) })
    );
  });

  it("an old subscription's EXPIRED does not end the newer one", async () => {
    mapToken("user_1");
    subscriptions(appleRow({ appleOriginalTransactionId: "9000000000000001" }));
    const result = await processAppleNotification(
      notification("EXPIRED"),
      verify
    );
    expect(result.body.outcome).toBe("other_subscription");
    expect(db.subscription.upsert).not.toHaveBeenCalled();
  });

  it("never touches a live Creem plan", async () => {
    mapToken("user_1");
    subscriptions(
      {
        provider: "CREEM",
        plan: "LIFETIME",
        status: "ACTIVE",
        currentPeriodEnd: null,
        creemCustomerId: "cust_1",
        creemSubscriptionId: null,
        creemProductId: "prod_l",
        appleOriginalTransactionId: null,
        appleTransactionId: null,
        appleLastSignedAt: null,
      },
      null
    );
    const result = await processAppleNotification(
      notification("REFUND"),
      verify
    );
    expect(result.body.outcome).toBe("creem_active");
    expect(db.subscription.upsert).not.toHaveBeenCalled();
  });
});

describe("GET /api/billing/apple/account-token", () => {
  it("creates the token once and lists the three products", async () => {
    db.user.findUnique
      .mockResolvedValueOnce({ appleAppAccountToken: null })
      .mockResolvedValueOnce({ appleAppAccountToken: TOKEN });
    db.user.updateMany.mockResolvedValue({ count: 1 });

    const result = await appleAccountToken("user_1");

    expect(db.user.updateMany).toHaveBeenCalledWith({
      where: { id: "user_1", appleAppAccountToken: null },
      data: {
        appleAppAccountToken: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
        ),
      },
    });
    expect(result).toEqual({
      appAccountToken: TOKEN,
      enabled: true,
      products: [
        "app.needt.pro.monthly",
        "app.needt.pro.yearly",
        "app.needt.lifetime",
      ],
    });
  });

  it("reuses a stored token", async () => {
    await appleAccountToken("user_1");
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it("offers nothing while the flag is off", async () => {
    jest.mocked(isFeatureEnabled).mockResolvedValue(false);
    expect(await appleAccountToken("user_1")).toMatchObject({
      enabled: false,
      products: [],
    });
  });

  it("drops Lifetime when the shared seat cap is reached", async () => {
    jest.mocked(lifetimeAvailability).mockResolvedValue({
      available: false,
      left: 0,
    });
    expect(await appleOfferedProducts("user_1")).toEqual([
      "app.needt.pro.monthly",
      "app.needt.pro.yearly",
    ]);
  });

  it("offers nothing to an account with a live Creem plan", async () => {
    subscriptions({
      provider: null,
      plan: "PRO",
      status: "ACTIVE",
      currentPeriodEnd: null,
      creemCustomerId: "cust_1",
      creemSubscriptionId: "sub_1",
      creemProductId: "prod_1",
    });
    expect(await appleOfferedProducts("user_1")).toEqual([]);
  });

  it("offers nothing to an Apple Lifetime owner", async () => {
    subscriptions(appleRow({ plan: "LIFETIME", currentPeriodEnd: null }));
    expect(await appleOfferedProducts("user_1")).toEqual([]);
  });

  it("offers the upgrade to an Apple Pro subscriber", async () => {
    subscriptions(appleRow());
    expect(await appleOfferedProducts("user_1")).toContain(
      "app.needt.lifetime"
    );
  });

  it("offers nothing to a sandbox account", async () => {
    jest.mocked(isSandboxUser).mockResolvedValue(true);
    expect(await appleOfferedProducts("user_1")).toEqual([]);
  });
});
