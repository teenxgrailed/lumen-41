import { getBillingSummary } from "@/services/billing/billing-summary";
import { SubscriptionPlan } from "@prisma/client";

import {
  APPLE_PRODUCTS,
  APPLE_PRODUCT_IDS,
  applePlanForProduct,
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
import { isSandboxUser } from "@/lib/sandbox/guard";

const LOG_SOURCE = "AppleIap";

/**
 * Server side of Apple In-App Purchase (docs/billing/apple-iap.md). The
 * routes under /api/billing/apple are thin wrappers over these functions.
 */

/** What the native paywall may offer this account, in App Store product ids. */
export async function appleOfferedProducts(userId: string): Promise<string[]> {
  const [subscription, lifetime, sandbox] = await Promise.all([
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
    isSandboxUser(userId),
  ]);
  // A reviewer sandbox account cannot buy (refuseSandbox "billing").
  if (sandbox) return [];
  const live = subscription ? grantsAccess(subscription) : false;
  // One seller at a time: a live Creem plan is managed on the web.
  if (live && billingSource(subscription) === "creem") return [];
  // Lifetime already owned (here or via Creem): nothing left to buy.
  if (live && subscription?.plan === SubscriptionPlan.LIFETIME) return [];
  // The 300 seats count Creem and Apple buyers together (Subscription rows at
  // LIFETIME, whoever sold them, plus open Creem checkout holds).
  return APPLE_PRODUCTS.filter(
    (id) => id !== APPLE_PRODUCT_IDS.lifetime || lifetime.available
  );
}

export async function appleAccountToken(userId: string) {
  const [appAccountToken, enabled] = await Promise.all([
    getOrCreateAppAccountToken(userId),
    isFeatureEnabled(APPLE_IAP, userId),
  ]);
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
  if (typeof signedTransaction !== "string" || !signedTransaction.trim()) {
    return refused(400, "INVALID_BODY", "signedTransaction is required.");
  }

  let verified;
  try {
    verified = await verifyAppleTransaction(
      signedTransaction.trim(),
      verifyOptions
    );
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
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { appleAppAccountToken: true },
  });
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
    signedAt: newDate(transaction.signedDate ?? Date.now()),
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
 */
export async function processAppleNotification(
  signedPayload: unknown,
  verifyOptions: AppleVerifyOptions = {}
): Promise<AppleNotificationResult> {
  if (typeof signedPayload !== "string" || !signedPayload.trim()) {
    return { status: 400, body: { ok: false, outcome: "invalid_body" } };
  }

  let verified;
  try {
    verified = await verifyAppleNotification(
      signedPayload.trim(),
      verifyOptions
    );
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
  const signedAt = newDate(notification.signedDate ?? Date.now());
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
    return { status: 200, body: { ok: true, outcome: "replayed" } };
  }

  const finish = async (outcome: string) => {
    await prisma.appleNotificationReceipt.update({
      where: { notificationUUID },
      data: { outcome },
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
