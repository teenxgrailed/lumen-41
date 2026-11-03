import { getBillingSummary } from "@/services/billing/billing-summary";
import { SubscriptionPlan } from "@prisma/client";

import {
  APPLE_PRODUCTS,
  APPLE_PRODUCT_IDS,
  type AppleIapConfig,
  applePlanForProduct,
  getAppleIapConfig,
  isAppleIapConfigured,
  mayUseAppleSandbox,
} from "@/lib/apple-iap/config";
import {
  applyAppleEntitlement,
  billingSource,
  findUserIdByAppAccountToken,
  findUserIdByOriginalTransactionId,
  getOrCreateAppAccountToken,
} from "@/lib/apple-iap/entitlement";
import {
  grantsAccess,
  stateFromNotification,
  stateFromTransaction,
} from "@/lib/apple-iap/state";
import {
  AppleVerificationError,
  type AppleVerifyOptions,
  verifyAppleNotification,
  verifyAppleTransaction,
} from "@/lib/apple-iap/verifier";
import { lifetimeAvailability } from "@/lib/creem/lifetime-cap";
import { newDate } from "@/lib/date-utils";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { APPLE_IAP } from "@/lib/feature-flags-keys";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { sandboxLockedBody } from "@/lib/sandbox/policy";

const LOG_SOURCE = "AppleIap";

/**
 * Server side of Apple In-App Purchase (docs/billing/apple-iap.md). The
 * routes under /api/billing/apple are thin wrappers over these functions.
 *
 * Sandbox accounts: the App Review login (`sandboxKind = reviewer`) may buy,
 * but only with Sandbox-signed purchases, which are time-boxed Pro. Every
 * other sandbox kind is refused like any other billing call.
 */

type Account = { sandboxKind: string | null; email: string | null };

async function account(userId: string): Promise<Account | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { sandboxKind: true, email: true },
  });
}

/** What the native paywall may offer this account, in App Store product ids. */
export async function appleOfferedProducts(userId: string): Promise<string[]> {
  const [subscription, lifetime, user] = await Promise.all([
    prisma.subscription.findUnique({
      where: { userId },
      select: {
        provider: true,
        plan: true,
        status: true,
        currentPeriodEnd: true,
        creemCustomerId: true,
        creemSubscriptionId: true,
        creemProductId: true,
      },
    }),
    lifetimeAvailability(userId),
    account(userId),
  ]);
  // Only the reviewer sandbox kind may buy (Sandbox-signed, time-boxed).
  if (user?.sandboxKind && user.sandboxKind !== "reviewer") return [];
  const live = subscription ? grantsAccess(subscription) : false;
  const source = billingSource(subscription);
  // One seller at a time: a live Creem plan is managed on the web.
  if (live && source === "creem") return [];
  // Lifetime already owned (here, via Creem, or a comp): nothing left to buy.
  if (live && subscription?.plan === SubscriptionPlan.LIFETIME) return [];
  // While an App Store Pro renews, Lifetime is not offered: Apple would keep
  // billing the subscription after the upgrade and nothing would say so.
  const appleProLive =
    live && source === "apple" && subscription?.plan === SubscriptionPlan.PRO;
  // The 300 seats count Creem and Apple buyers together (Subscription rows at
  // LIFETIME, whoever sold them, plus open Creem checkout holds).
  return APPLE_PRODUCTS.filter(
    (id) =>
      id !== APPLE_PRODUCT_IDS.lifetime || (lifetime.available && !appleProLive)
  );
}

export async function appleAccountToken(
  userId: string,
  config: AppleIapConfig = getAppleIapConfig()
) {
  const [appAccountToken, flag] = await Promise.all([
    getOrCreateAppAccountToken(userId),
    isFeatureEnabled(APPLE_IAP, userId),
  ]);
  const enabled = flag && isAppleIapConfigured(config);
  return {
    appAccountToken,
    enabled,
    products: enabled ? await appleOfferedProducts(userId) : [],
  };
}

export type AppleTransactionPostResult =
  | {
      ok: true;
      summary: Awaited<ReturnType<typeof getBillingSummary>>;
    }
  | { ok: false; status: number; code: string; error: string };

function refused(
  status: number,
  code: string,
  error: string
): AppleTransactionPostResult {
  return { ok: false, status, code, error };
}

const VERIFICATION_MESSAGES: Record<AppleVerificationError["reason"], string> =
  {
    malformed: "That is not a StoreKit signed transaction.",
    invalid_signature: "The transaction signature could not be verified.",
    wrong_bundle: "The transaction is for another app.",
    wrong_environment: "The transaction is from another App Store environment.",
    not_configured: "App Store purchases are not configured.",
    retryable: "Could not reach the App Store to check the transaction.",
  };

/**
 * Whether this account may have a purchase from `environment` applied on
 * this server. Null when it may; the refusal otherwise.
 */
function environmentRefusal(
  user: Account | null,
  environment: "Production" | "Sandbox",
  config: AppleIapConfig
): AppleTransactionPostResult | null {
  if (user?.sandboxKind === "reviewer" && environment !== "Sandbox") {
    return refused(
      403,
      "APPLE_SANDBOX_ONLY",
      "This review account can only make App Store Sandbox purchases."
    );
  }
  if (
    environment === "Sandbox" &&
    config.environment === "Production" &&
    !(user && mayUseAppleSandbox(user, config))
  ) {
    return refused(
      400,
      "APPLE_WRONG_ENVIRONMENT",
      VERIFICATION_MESSAGES.wrong_environment
    );
  }
  return null;
}

/**
 * A StoreKit 2 transaction the app posts after a purchase, a restore or a
 * `Transaction.updates` event. Verified, tied to the caller through the
 * appAccountToken, then applied. Posting the same transaction again changes
 * nothing (idempotent on originalTransactionId + transactionId).
 */
export async function processAppleTransactionPost(
  userId: string,
  signedTransaction: unknown,
  verifyOptions: AppleVerifyOptions = {}
): Promise<AppleTransactionPostResult> {
  const config = verifyOptions.config ?? getAppleIapConfig();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { appleAppAccountToken: true, sandboxKind: true, email: true },
  });
  if (user?.sandboxKind && user.sandboxKind !== "reviewer") {
    const body = sandboxLockedBody("billing");
    return refused(403, body.code, body.error);
  }

  if (typeof signedTransaction !== "string" || !signedTransaction.trim()) {
    return refused(400, "INVALID_BODY", "signedTransaction is required.");
  }

  let verified;
  try {
    verified = await verifyAppleTransaction(signedTransaction.trim(), {
      ...verifyOptions,
      config,
    });
  } catch (error) {
    const reason =
      error instanceof AppleVerificationError
        ? error.reason
        : "invalid_signature";
    await logger.warn(
      "Rejected an Apple transaction",
      { userId, reason },
      LOG_SOURCE
    );
    const status =
      reason === "retryable" || reason === "not_configured" ? 503 : 400;
    return refused(
      status,
      `APPLE_${reason.toUpperCase()}`,
      VERIFICATION_MESSAGES[reason]
    );
  }

  const { transaction, environment } = verified;
  const environmentRefused = environmentRefusal(user, environment, config);
  if (environmentRefused) {
    await logger.warn(
      "Refused an Apple transaction from this environment",
      { userId, environment },
      LOG_SOURCE
    );
    return environmentRefused;
  }

  const expected = user?.appleAppAccountToken?.toLowerCase() ?? null;
  const presented = transaction.appAccountToken?.toLowerCase() ?? null;
  if (!expected || presented !== expected) {
    await logger.warn(
      "Apple transaction belongs to another account token",
      {
        userId,
        originalTransactionId: transaction.originalTransactionId ?? null,
        hasToken: Boolean(presented),
      },
      LOG_SOURCE
    );
    return refused(
      403,
      "APPLE_ACCOUNT_MISMATCH",
      "This purchase was made from another Needt account."
    );
  }

  const state = stateFromTransaction(transaction);
  if (
    !state ||
    !transaction.originalTransactionId ||
    !transaction.transactionId ||
    !transaction.productId ||
    !transaction.bundleId
  ) {
    return refused(400, "APPLE_UNKNOWN_PRODUCT", "Unknown App Store product.");
  }

  const { outcome } = await applyAppleEntitlement({
    userId,
    originalTransactionId: transaction.originalTransactionId,
    transactionId: transaction.transactionId,
    productId: transaction.productId,
    bundleId: transaction.bundleId,
    environment,
    signedAt: newDate(transaction.signedDate ?? newDate().getTime()),
    state,
    origin: "device",
  });

  if (outcome === "creem_active") {
    // Not offered (account-token lists no products), so this is a race or a
    // purchase made outside the app's paywall. The owner refunds it.
    await logger.warn(
      "Apple purchase on an account with a live Creem plan",
      {
        userId,
        originalTransactionId: transaction.originalTransactionId,
        productId: transaction.productId,
      },
      LOG_SOURCE
    );
    return refused(
      409,
      "CREEM_ACTIVE",
      "This account already pays on the web. Ask Apple for a refund of the App Store purchase."
    );
  }
  if (outcome === "transaction_in_use") {
    return refused(
      409,
      "APPLE_TRANSACTION_IN_USE",
      "This App Store purchase is linked to another Needt account."
    );
  }

  if (outcome === "applied") {
    await logger.info(
      "Applied an Apple transaction",
      {
        userId,
        originalTransactionId: transaction.originalTransactionId,
        productId: transaction.productId,
        environment,
      },
      LOG_SOURCE
    );
  }
  return { ok: true, summary: await getBillingSummary(userId) };
}

export type AppleNotificationResult = {
  status: 200 | 400 | 503;
  body: { ok: boolean; outcome: string };
};

/**
 * App Store Server Notifications V2. A bad signature is a 400; anything that
 * verified is a 200 even when it maps to nobody (logged and kept as a
 * receipt), so Apple does not retry what will never apply.
 *
 * The receipt is written first with outcome "received" and settled last. A
 * failure in between (the route answers 500, Apple retries) leaves it at
 * "received", and the retry processes it again instead of calling it a
 * replay: applying is idempotent, losing a REFUND is not.
 */
export async function processAppleNotification(
  signedPayload: unknown,
  verifyOptions: AppleVerifyOptions = {}
): Promise<AppleNotificationResult> {
  if (typeof signedPayload !== "string" || !signedPayload.trim()) {
    return { status: 400, body: { ok: false, outcome: "invalid_body" } };
  }
  const config = verifyOptions.config ?? getAppleIapConfig();

  let verified;
  try {
    verified = await verifyAppleNotification(signedPayload.trim(), {
      ...verifyOptions,
      config,
    });
  } catch (error) {
    const reason =
      error instanceof AppleVerificationError
        ? error.reason
        : "invalid_signature";
    await logger.warn(
      "Rejected an App Store Server Notification",
      { reason },
      LOG_SOURCE
    );
    // Apple retries a non-200; only worth it when the failure was transient.
    const status =
      reason === "retryable" || reason === "not_configured" ? 503 : 400;
    return { status, body: { ok: false, outcome: reason } };
  }

  const { notification, transaction, renewalInfo, environment } = verified;
  const notificationType = String(notification.notificationType ?? "");
  const subtype = notification.subtype ? String(notification.subtype) : null;
  const notificationUUID = notification.notificationUUID;
  const signedAt = newDate(notification.signedDate ?? newDate().getTime());
  const originalTransactionId = transaction?.originalTransactionId ?? null;

  if (!notificationUUID) {
    return { status: 400, body: { ok: false, outcome: "invalid_body" } };
  }

  const userId =
    (transaction?.appAccountToken
      ? await findUserIdByAppAccountToken(transaction.appAccountToken)
      : null) ??
    (originalTransactionId
      ? await findUserIdByOriginalTransactionId(originalTransactionId)
      : null);

  const receipt = await prisma.appleNotificationReceipt.createMany({
    data: [
      {
        notificationUUID,
        userId,
        notificationType,
        subtype,
        originalTransactionId,
        environment,
        signedAt,
        outcome: "received",
      },
    ],
    skipDuplicates: true,
  });
  if (receipt.count === 0) {
    const stored = await prisma.appleNotificationReceipt.findUnique({
      where: { notificationUUID },
      select: { outcome: true },
    });
    if (stored && stored.outcome !== "received") {
      return { status: 200, body: { ok: true, outcome: "replayed" } };
    }
    await logger.info(
      "Reprocessing an App Store notification that never settled",
      { notificationUUID, notificationType },
      LOG_SOURCE
    );
  }

  const finish = async (outcome: string) => {
    await prisma.appleNotificationReceipt.update({
      where: { notificationUUID },
      data: { outcome, userId },
    });
    return { status: 200 as const, body: { ok: true, outcome } };
  };

  if (notificationType === "TEST") {
    await logger.info(
      "App Store test notification received",
      { notificationUUID, environment },
      LOG_SOURCE
    );
    return finish("test");
  }

  const state = stateFromNotification({
    notificationType,
    subtype,
    transaction,
    renewalInfo: renewalInfo
      ? {
          autoRenewStatus:
            typeof renewalInfo.autoRenewStatus === "number"
              ? renewalInfo.autoRenewStatus
              : undefined,
          gracePeriodExpiresDate: renewalInfo.gracePeriodExpiresDate,
        }
      : null,
  });
  if (!state) return finish("ignored");

  if (!userId || !transaction?.productId || !originalTransactionId) {
    await logger.warn(
      "App Store notification maps to no Needt account",
      { notificationUUID, notificationType, subtype, originalTransactionId },
      LOG_SOURCE
    );
    return finish("unmapped");
  }
  if (!applePlanForProduct(transaction.productId)) return finish("ignored");

  const user = await account(userId);
  if (environmentRefusal(user, environment, config)) {
    await logger.warn(
      "App Store notification from an environment this account may not use",
      { notificationUUID, notificationType, userId, environment },
      LOG_SOURCE
    );
    return finish("sandbox_ignored");
  }

  const { outcome } = await applyAppleEntitlement({
    userId,
    originalTransactionId,
    transactionId: transaction.transactionId ?? originalTransactionId,
    productId: transaction.productId,
    bundleId: transaction.bundleId ?? verified.bundleId,
    environment,
    signedAt,
    state,
    origin: "notification",
  });
  if (outcome !== "applied") {
    await logger.warn(
      "App Store notification not applied",
      { notificationUUID, notificationType, subtype, userId, outcome },
      LOG_SOURCE
    );
  } else if (state.revoked) {
    await logger.warn(
      "App Store refund or revoke removed a plan",
      { notificationUUID, notificationType, userId, originalTransactionId },
      LOG_SOURCE
    );
  }
  return finish(outcome);
}
