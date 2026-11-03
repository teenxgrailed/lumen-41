import {
  type BillingProvider,
  SubscriptionPlan,
  SubscriptionStatus,
} from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { effectiveSubscriptionPlan } from "@/lib/entitlements";

import { APPLE_SANDBOX_GRANT_MS, applePlanForProduct } from "./config";

/**
 * Pure mapping from what Apple signed to the `Subscription` columns every
 * entitlement check already reads (`effectiveSubscriptionPlan`). No database.
 *
 * The status choices lean on how `effectiveSubscriptionPlan` already treats a
 * row: ACTIVE keeps the plan; CANCELED, PAST_DUE and PAYMENT_FAILED keep it
 * only until `currentPeriodEnd`. So an Apple subscription whose auto-renew is
 * off is stored CANCELED with the paid-through date, and ends on its own even
 * if the EXPIRED notification never arrives.
 */

export type AppleTransactionFields = {
  transactionId?: string;
  originalTransactionId?: string;
  productId?: string;
  bundleId?: string;
  expiresDate?: number;
  revocationDate?: number;
  signedDate?: number;
  appAccountToken?: string;
};

export type AppleRenewalFields = {
  autoRenewStatus?: number;
  gracePeriodExpiresDate?: number;
};

export type AppleEntitlementState = {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  interval: "month" | "year" | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  /** The App Store took the money back (refund) or the access (revoke). */
  revoked: boolean;
};

const AUTO_RENEW_OFF = 0;

function date(value: number | undefined): Date | null {
  return typeof value === "number" && Number.isFinite(value)
    ? newDate(value)
    : null;
}

function revokedState(): AppleEntitlementState {
  return {
    plan: SubscriptionPlan.FREE,
    status: SubscriptionStatus.CANCELED,
    interval: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    revoked: true,
  };
}

/** What a transaction alone says: the device post, or a notification's base. */
export function stateFromTransaction(
  transaction: AppleTransactionFields,
  now: Date = newDate()
): AppleEntitlementState | null {
  const product = transaction.productId
    ? applePlanForProduct(transaction.productId)
    : null;
  if (!product) return null;
  if (transaction.revocationDate) return revokedState();

  if (product.plan === SubscriptionPlan.LIFETIME) {
    return {
      plan: SubscriptionPlan.LIFETIME,
      status: SubscriptionStatus.ACTIVE,
      interval: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      revoked: false,
    };
  }

  const expires = date(transaction.expiresDate);
  const active = Boolean(expires && expires > now);
  return {
    plan: SubscriptionPlan.PRO,
    status: active ? SubscriptionStatus.ACTIVE : SubscriptionStatus.CANCELED,
    interval: product.interval,
    currentPeriodEnd: expires,
    cancelAtPeriodEnd: false,
    revoked: false,
  };
}

function withRenewalOff(state: AppleEntitlementState): AppleEntitlementState {
  if (state.plan !== SubscriptionPlan.PRO) return state;
  if (state.status !== SubscriptionStatus.ACTIVE) return state;
  return {
    ...state,
    status: SubscriptionStatus.CANCELED,
    cancelAtPeriodEnd: true,
  };
}

/** Notification types that only restate the transaction they carry. */
const TRANSACTION_TYPES = new Set([
  "SUBSCRIBED",
  "DID_RENEW",
  "DID_CHANGE_RENEWAL_PREF",
  "OFFER_REDEEMED",
  "ONE_TIME_CHARGE",
  "REFUND_REVERSED",
  "RENEWAL_EXTENDED",
]);

export const HANDLED_NOTIFICATION_TYPES: readonly string[] = [
  ...TRANSACTION_TYPES,
  "DID_CHANGE_RENEWAL_STATUS",
  "DID_FAIL_TO_RENEW",
  "GRACE_PERIOD_EXPIRED",
  "EXPIRED",
  "REFUND",
  "REVOKE",
];

/**
 * What an App Store Server Notification V2 means for the plan. Null when the
 * notification changes nothing we store (TEST, PRICE_INCREASE, CONSUMPTION_
 * REQUEST, ...) or names a product we do not sell.
 */
export function stateFromNotification(
  input: {
    notificationType: string;
    subtype?: string | null;
    transaction: AppleTransactionFields | null;
    renewalInfo: AppleRenewalFields | null;
  },
  now: Date = newDate()
): AppleEntitlementState | null {
  const { notificationType, subtype, transaction, renewalInfo } = input;
  if (!transaction) return null;
  const base = stateFromTransaction(transaction, now);
  if (!base) return null;

  if (notificationType === "REFUND" || notificationType === "REVOKE") {
    return revokedState();
  }
  // A revoked transaction stays revoked whatever else the notification says.
  if (base.revoked) return base;

  const renewalOff = renewalInfo?.autoRenewStatus === AUTO_RENEW_OFF;

  if (TRANSACTION_TYPES.has(notificationType)) {
    return renewalOff ? withRenewalOff(base) : base;
  }

  switch (notificationType) {
    case "DID_CHANGE_RENEWAL_STATUS":
      if (subtype === "AUTO_RENEW_DISABLED") return withRenewalOff(base);
      if (subtype === "AUTO_RENEW_ENABLED") return base;
      return renewalOff ? withRenewalOff(base) : base;
    case "DID_FAIL_TO_RENEW": {
      if (base.plan !== SubscriptionPlan.PRO) return base;
      if (subtype === "GRACE_PERIOD") {
        return {
          ...base,
          status: SubscriptionStatus.PAST_DUE,
          currentPeriodEnd:
            date(renewalInfo?.gracePeriodExpiresDate) ?? base.currentPeriodEnd,
          cancelAtPeriodEnd: false,
        };
      }
      // Billing retry without a grace period: no access while Apple retries.
      return {
        ...base,
        status: SubscriptionStatus.PAYMENT_FAILED,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      };
    }
    case "GRACE_PERIOD_EXPIRED":
      if (base.plan !== SubscriptionPlan.PRO) return base;
      return {
        ...base,
        status: SubscriptionStatus.PAYMENT_FAILED,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      };
    case "EXPIRED":
      if (base.plan !== SubscriptionPlan.PRO) return base;
      return {
        ...base,
        status: SubscriptionStatus.CANCELED,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      };
    default:
      return null;
  }
}

/**
 * True when this row or state gives the person a paid plan right now: the
 * same rule as getPlan, including the period bound on App Store Pro.
 */
export function grantsAccess(
  state: Pick<AppleEntitlementState, "plan" | "status" | "currentPeriodEnd"> & {
    provider?: BillingProvider | null;
  },
  now: Date = newDate()
): boolean {
  return effectiveSubscriptionPlan(state, null, now) !== SubscriptionPlan.FREE;
}

/**
 * A Sandbox-signed purchase costs the buyer nothing, so it is never a real
 * plan: at most 24 hours of Pro, stored ending (CANCELED with the end date),
 * never Lifetime and never a Lifetime seat. Revocations and endings pass
 * through unchanged.
 */
export function timeBoxSandboxState(
  state: AppleEntitlementState,
  now: Date = newDate()
): AppleEntitlementState {
  if (state.revoked || state.plan === SubscriptionPlan.FREE) return state;
  const cap = newDate(now.getTime() + APPLE_SANDBOX_GRANT_MS);
  if (state.plan === SubscriptionPlan.PRO) {
    if (!state.currentPeriodEnd || state.currentPeriodEnd <= now) {
      return state;
    }
    return {
      ...state,
      status: SubscriptionStatus.CANCELED,
      currentPeriodEnd:
        state.currentPeriodEnd < cap ? state.currentPeriodEnd : cap,
    };
  }
  return {
    plan: SubscriptionPlan.PRO,
    status: SubscriptionStatus.CANCELED,
    interval: null,
    currentPeriodEnd: cap,
    cancelAtPeriodEnd: false,
    revoked: false,
  };
}
