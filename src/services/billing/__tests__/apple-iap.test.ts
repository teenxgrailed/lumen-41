import { randomUUID } from "node:crypto";

import { createTestChain } from "@/lib/apple-iap/__tests__/test-chain";
import type { AppleIapConfig } from "@/lib/apple-iap/config";
import { lifetimeAvailability } from "@/lib/creem/lifetime-cap";
import { settlePendingCreemCancel } from "@/lib/creem/pending-cancel";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

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
jest.mock("@/lib/creem/pending-cancel", () => ({
  settlePendingCreemCancel: jest.fn(),
}));
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
      update: jest.fn(),
      upsert: jest.fn(),
    },
    creemSubscriptionCursor: { upsert: jest.fn() },
    appleNotificationReceipt: {
      createMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  return { prisma };
});

const db = prisma as unknown as {
  $transaction: jest.Mock;
  $executeRaw: jest.Mock;
  user: { findUnique: jest.Mock; updateMany: jest.Mock };
  subscription: {
    findUnique: jest.Mock;
    update: jest.Mock;
    upsert: jest.Mock;
  };
  creemSubscriptionCursor: { upsert: jest.Mock };
  appleNotificationReceipt: {
    createMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
};

const chain = createTestChain();
const stranger = createTestChain("Stranger");
const APP_APPLE_ID = 6400000000;
const TESTER = "owner@example.test";
const VERIFIED = new Date("2026-10-01T00:00:00Z");
/** A Production server, like use.needt.app. */
const config: AppleIapConfig = {
  environment: "Production",
  bundleIds: ["app.needt.ios", "app.needt.mac"],
  appAppleId: APP_APPLE_ID,
  sandboxTesters: [TESTER],
};
const verify = { config, rootCertificates: [chain.root] };

// Made per run: a UUID literal named "token" reads as a secret to gitleaks.
const TOKEN = randomUUID();
const OTHER_TOKEN = randomUUID();
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
    environment: "Production",
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
    appleEnvironment: "Production",
    ...overrides,
  };
}

const sandboxTx = (overrides: Record<string, unknown> = {}) =>
  tx({ environment: "Sandbox", ...overrides });

/** Who is posting: a real person by default. */
function caller(overrides: Record<string, unknown> = {}) {
  db.user.findUnique.mockResolvedValue({
    appleAppAccountToken: TOKEN,
    sandboxKind: null,
    email: "person@example.test",
    ...overrides,
  });
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
  caller();
  db.subscription.upsert.mockResolvedValue({});
  db.appleNotificationReceipt.createMany.mockResolvedValue({ count: 1 });
  db.appleNotificationReceipt.findUnique.mockResolvedValue(null);
  jest.mocked(getBillingSummary).mockResolvedValue(summary as never);
  jest.mocked(settlePendingCreemCancel).mockResolvedValue(true);
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
          appleEnvironment: "Production",
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

  it("refuses a Sandbox purchase from a person who is not a tester", async () => {
    const result = await processAppleTransactionPost(
      "user_1",
      chain.sign(sandboxTx()),
      verify
    );
    expect(result).toMatchObject({
      status: 400,
      code: "APPLE_WRONG_ENVIRONMENT",
    });
    expect(db.subscription.upsert).not.toHaveBeenCalled();
  });

  it("answers 503 while the server environment is not configured", async () => {
    const result = await processAppleTransactionPost(
      "user_1",
      chain.sign(tx()),
      { ...verify, config: { ...config, environment: null } }
    );
    expect(result).toMatchObject({
      status: 503,
      code: "APPLE_NOT_CONFIGURED",
    });
  });

  describe("Sandbox purchases on a Production server", () => {
    it("the App Review login gets time-boxed Pro, never more than a day", async () => {
      caller({ sandboxKind: "reviewer", email: "reviewer@needt.test" });
      const result = await processAppleTransactionPost(
        "user_1",
        chain.sign(sandboxTx()),
        verify
      );
      expect(result.ok).toBe(true);
      const data = db.subscription.upsert.mock.calls[0][0].create;
      expect(data).toMatchObject({
        plan: "PRO",
        status: "CANCELED",
        appleEnvironment: "Sandbox",
      });
      const end = (data.currentPeriodEnd as Date).getTime();
      expect(end).toBeLessThanOrEqual(Date.now() + day);
      expect(end).toBeGreaterThan(Date.now() + day - 60_000);
    });

    it("the App Review login may never post a Production purchase", async () => {
      caller({ sandboxKind: "reviewer", email: "reviewer@needt.test" });
      const result = await processAppleTransactionPost(
        "user_1",
        chain.sign(tx()),
        verify
      );
      expect(result).toMatchObject({ status: 403, code: "APPLE_SANDBOX_ONLY" });
      expect(db.subscription.upsert).not.toHaveBeenCalled();
    });

    it("another sandbox kind is refused like any billing call", async () => {
      caller({ sandboxKind: "publicDemo" });
      const result = await processAppleTransactionPost(
        "user_1",
        chain.sign(sandboxTx()),
        verify
      );
      expect(result).toMatchObject({ status: 403, code: "SANDBOX_LOCKED" });
    });

    it("an allowlisted tester gets time-boxed Pro", async () => {
      caller({ email: "Owner@Example.test", emailVerified: VERIFIED });
      const result = await processAppleTransactionPost(
        "user_1",
        chain.sign(sandboxTx()),
        verify
      );
      expect(result.ok).toBe(true);
      expect(db.subscription.upsert.mock.calls[0][0].create).toMatchObject({
        plan: "PRO",
        status: "CANCELED",
      });
    });

    it("a tester address that was never confirmed gets nothing", async () => {
      caller({ email: TESTER, emailVerified: null });
      const result = await processAppleTransactionPost(
        "user_1",
        chain.sign(sandboxTx()),
        verify
      );
      expect(result).toMatchObject({
        status: 400,
        code: "APPLE_WRONG_ENVIRONMENT",
      });
      expect(db.subscription.upsert).not.toHaveBeenCalled();
    });

    it("a Sandbox Lifetime is a day of Pro and takes no seat", async () => {
      caller({ email: TESTER, emailVerified: VERIFIED });
      await processAppleTransactionPost(
        "user_1",
        chain.sign(
          sandboxTx({
            transactionId: "3000000000000001",
            originalTransactionId: "3000000000000001",
            productId: "app.needt.lifetime",
            type: "Non-Consumable",
            expiresDate: undefined,
          })
        ),
        verify
      );
      // No Lifetime seat lock: nothing is counted toward the 300.
      expect(db.$executeRaw).not.toHaveBeenCalled();
      expect(db.subscription.upsert.mock.calls[0][0].create).toMatchObject({
        plan: "PRO",
        status: "CANCELED",
        interval: null,
      });
    });

    it("a tester's Sandbox purchase never displaces a paid App Store plan", async () => {
      caller({ email: TESTER, emailVerified: VERIFIED });
      subscriptions(
        appleRow({ appleOriginalTransactionId: "9000000000000001" }),
        null
      );
      await processAppleTransactionPost(
        "user_1",
        chain.sign(sandboxTx()),
        verify
      );
      expect(db.subscription.upsert).not.toHaveBeenCalled();
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
    // The old Creem subscription is closed for good; it no longer bills.
    expect(db.creemSubscriptionCursor.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ restrictionLevel: 5 }),
      })
    );
    expect(settlePendingCreemCancel).not.toHaveBeenCalled();
  });

  it("cancels a Creem subscription still in dunning when Apple takes over", async () => {
    subscriptions(
      {
        provider: "CREEM",
        plan: "PRO",
        status: "PAST_DUE",
        currentPeriodEnd: new Date(Date.now() - day),
        creemCustomerId: "cust_1",
        creemSubscriptionId: "sub_dunning",
        creemProductId: "prod_1",
        appleOriginalTransactionId: null,
        appleTransactionId: null,
        appleLastSignedAt: null,
      },
      null
    );
    jest
      .mocked(settlePendingCreemCancel)
      .mockRejectedValueOnce(new Error("Creem down"));

    const result = await processAppleTransactionPost(
      "user_1",
      chain.sign(tx()),
      verify
    );

    expect(result.ok).toBe(true);
    expect(db.creemSubscriptionCursor.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_creemSubscriptionId: {
            userId: "user_1",
            creemSubscriptionId: "sub_dunning",
          },
        },
        update: expect.objectContaining({ restrictionLevel: 5 }),
      })
    );
    // The marker is committed with the grant, so the worker retries it.
    expect(db.subscription.upsert.mock.calls[0][0].update).toMatchObject({
      provider: "APPLE",
      pendingCreemCancelId: "sub_dunning",
    });
    expect(settlePendingCreemCancel).toHaveBeenCalledWith(
      "user_1",
      "sub_dunning"
    );
  });

  it("never overwrites a comp Lifetime", async () => {
    subscriptions(
      {
        provider: null,
        plan: "LIFETIME",
        status: "ACTIVE",
        currentPeriodEnd: null,
        creemCustomerId: null,
        creemSubscriptionId: null,
        creemProductId: null,
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
    expect(db.subscription.upsert).not.toHaveBeenCalled();
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
      environment?: "Production" | "Sandbox";
      uuid?: string;
    } = {}
  ) {
    uuid += 1;
    const signer = options.signer ?? chain;
    const environment = options.environment ?? "Production";
    return signer.sign({
      notificationType,
      ...(options.subtype ? { subtype: options.subtype } : {}),
      notificationUUID:
        options.uuid ??
        `00000000-0000-4000-8000-${String(uuid).padStart(12, "0")}`,
      version: "2.0",
      signedDate: Date.now(),
      data: {
        bundleId: "app.needt.ios",
        environment,
        // Apple puts the App Apple ID in Production payloads only.
        ...(environment === "Production" ? { appAppleId: APP_APPLE_ID } : {}),
        signedTransactionInfo: chain.sign(
          tx({ environment, ...options.transaction })
        ),
        signedRenewalInfo: chain.sign({
          originalTransactionId: "2000000000000001",
          productId: "app.needt.pro.monthly",
          autoRenewStatus: 1,
          environment,
          signedDate: Date.now(),
          ...options.renewal,
        }),
      },
    });
  }

  function mapToken(
    userId: string | null,
    account: Record<string, unknown> = { sandboxKind: null, email: null }
  ) {
    db.user.findUnique.mockImplementation(
      ({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          "appleAppAccountToken" in where
            ? userId
              ? { id: userId }
              : null
            : { appleAppAccountToken: TOKEN, ...account }
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
    db.appleNotificationReceipt.findUnique.mockResolvedValue({
      outcome: "applied",
    });
    const result = await processAppleNotification(
      notification("DID_RENEW"),
      verify
    );
    expect(result.body.outcome).toBe("replayed");
    expect(db.subscription.upsert).not.toHaveBeenCalled();
  });

  it("a delivery that failed half way is applied on Apple's retry", async () => {
    mapToken("user_1");
    subscriptions(appleRow({ appleTransactionId: "old" }));
    const payload = notification("REFUND", {
      uuid: "11111111-1111-4111-8111-111111111111",
    });

    // First delivery: the receipt lands, then the apply throws (route 500).
    db.subscription.upsert.mockRejectedValueOnce(new Error("db hiccup"));
    await expect(processAppleNotification(payload, verify)).rejects.toThrow(
      "db hiccup"
    );
    expect(db.appleNotificationReceipt.update).not.toHaveBeenCalled();

    // Apple retries: the receipt exists but never settled.
    db.appleNotificationReceipt.createMany.mockResolvedValue({ count: 0 });
    db.appleNotificationReceipt.findUnique.mockResolvedValue({
      outcome: "received",
    });
    const retry = await processAppleNotification(payload, verify);

    expect(retry.body.outcome).toBe("applied");
    expect(db.subscription.upsert).toHaveBeenCalledTimes(2);
    expect(db.subscription.upsert.mock.calls[1][0].update).toMatchObject({
      plan: "FREE",
    });
    expect(db.appleNotificationReceipt.update).toHaveBeenCalledWith({
      where: { notificationUUID: "11111111-1111-4111-8111-111111111111" },
      data: { outcome: "applied", userId: "user_1" },
    });
  });

  describe("Sandbox notifications on a Production server", () => {
    it("are applied, time-boxed, for the App Review login", async () => {
      mapToken("user_1", { sandboxKind: "reviewer", email: null });
      subscriptions(
        appleRow({ appleTransactionId: "old", appleEnvironment: "Sandbox" })
      );
      const result = await processAppleNotification(
        notification("DID_RENEW", { environment: "Sandbox" }),
        verify
      );
      expect(result.body.outcome).toBe("applied");
      expect(db.subscription.upsert.mock.calls[0][0].update).toMatchObject({
        plan: "PRO",
        status: "CANCELED",
        appleEnvironment: "Sandbox",
      });
    });

    it("EXPIRED reaches a tester's Sandbox plan", async () => {
      mapToken("user_1", {
        sandboxKind: null,
        email: TESTER,
        emailVerified: VERIFIED,
      });
      subscriptions(
        appleRow({ appleTransactionId: "old", appleEnvironment: "Sandbox" })
      );
      const result = await processAppleNotification(
        notification("EXPIRED", { environment: "Sandbox" }),
        verify
      );
      expect(result.body.outcome).toBe("applied");
      expect(db.subscription.upsert.mock.calls[0][0].update).toMatchObject({
        status: "CANCELED",
        currentPeriodEnd: null,
      });
    });

    it("are ignored (200) for anyone else", async () => {
      mapToken("user_1", { sandboxKind: null, email: "person@example.test" });
      const result = await processAppleNotification(
        notification("SUBSCRIBED", { environment: "Sandbox" }),
        verify
      );
      expect(result).toEqual({
        status: 200,
        body: { ok: true, outcome: "sandbox_ignored" },
      });
      expect(db.subscription.upsert).not.toHaveBeenCalled();
    });
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

  it("clears the double-billing flag once the replaced App Store subscription stops", async () => {
    mapToken("user_1");
    const creemRow = {
      provider: "CREEM",
      plan: "PRO",
      status: "ACTIVE",
      currentPeriodEnd: null,
      creemCustomerId: "cust_1",
      creemSubscriptionId: "sub_web",
      creemProductId: "prod_1",
      appleOriginalTransactionId: "2000000000000001",
      appleTransactionId: "2000000000000002",
      appleLastSignedAt: null,
      appleConflictSince: new Date(Date.now() - day),
    };
    subscriptions(creemRow, { userId: "user_1" });

    // Still renewing: the flag stays.
    await processAppleNotification(notification("DID_RENEW"), verify);
    expect(db.subscription.update).not.toHaveBeenCalled();

    // Auto-renew turned off in the App Store: the double billing ends.
    const result = await processAppleNotification(
      notification("DID_CHANGE_RENEWAL_STATUS", {
        subtype: "AUTO_RENEW_DISABLED",
        renewal: { autoRenewStatus: 0 },
      }),
      verify
    );
    expect(result.body.outcome).toBe("creem_active");
    expect(db.subscription.update).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      data: { appleConflictSince: null },
    });
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

  it("is not enabled while the server environment is not configured", async () => {
    expect(
      await appleAccountToken("user_1", { ...config, environment: null })
    ).toMatchObject({ enabled: false, products: [] });
    expect(
      await appleAccountToken("user_1", { ...config, appAppleId: null })
    ).toMatchObject({ enabled: false, products: [] });
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

  it("does not offer Lifetime while an App Store Pro renews", async () => {
    subscriptions(appleRow());
    expect(await appleOfferedProducts("user_1")).toEqual([
      "app.needt.pro.monthly",
      "app.needt.pro.yearly",
    ]);
  });

  it("offers everything to the App Review login", async () => {
    caller({ sandboxKind: "reviewer" });
    expect(await appleOfferedProducts("user_1")).toHaveLength(3);
  });

  it("offers nothing to another sandbox kind", async () => {
    caller({ sandboxKind: "publicDemo" });
    expect(await appleOfferedProducts("user_1")).toEqual([]);
  });
});
