import { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

import { effectiveSubscriptionPlan } from "@/lib/entitlements";

import {
  type AppleTransactionFields,
  stateFromNotification,
  stateFromTransaction,
  timeBoxSandboxState,
} from "../state";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));

const now = new Date("2026-11-03T12:00:00Z");
const day = 24 * 3600 * 1000;
const future = now.getTime() + 20 * day;
const past = now.getTime() - 2 * day;

const monthly: AppleTransactionFields = {
  transactionId: "t2",
  originalTransactionId: "t1",
  productId: "app.needt.pro.monthly",
  expiresDate: future,
};

function plan(state: ReturnType<typeof stateFromNotification>) {
  return state ? effectiveSubscriptionPlan(state, null, now) : "none";
}

function notify(
  notificationType: string,
  subtype: string | null = null,
  transaction: AppleTransactionFields = monthly,
  renewalInfo: { autoRenewStatus?: number; gracePeriodExpiresDate?: number } = {
    autoRenewStatus: 1,
  }
) {
  return stateFromNotification(
    { notificationType, subtype, transaction, renewalInfo },
    now
  );
}

describe("stateFromTransaction", () => {
  it("maps the three products", () => {
    expect(stateFromTransaction(monthly, now)).toMatchObject({
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.ACTIVE,
      interval: "month",
      currentPeriodEnd: new Date(future),
    });
    expect(
      stateFromTransaction(
        { ...monthly, productId: "app.needt.pro.yearly" },
        now
      )
    ).toMatchObject({ plan: SubscriptionPlan.PRO, interval: "year" });
    expect(
      stateFromTransaction(
        { productId: "app.needt.lifetime", expiresDate: undefined },
        now
      )
    ).toMatchObject({
      plan: SubscriptionPlan.LIFETIME,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: null,
    });
  });

  it("ignores products we do not sell", () => {
    expect(stateFromTransaction({ productId: "com.other" }, now)).toBeNull();
  });

  it("an expired subscription gives no access", () => {
    const state = stateFromTransaction({ ...monthly, expiresDate: past }, now);
    expect(state?.status).toBe(SubscriptionStatus.CANCELED);
    expect(plan(state)).toBe(SubscriptionPlan.FREE);
  });

  it("a revoked transaction removes the plan, Lifetime included", () => {
    const state = stateFromTransaction(
      { productId: "app.needt.lifetime", revocationDate: past },
      now
    );
    expect(state).toMatchObject({ plan: SubscriptionPlan.FREE, revoked: true });
  });
});

describe("stateFromNotification", () => {
  it("SUBSCRIBED grants Pro", () => {
    expect(plan(notify("SUBSCRIBED", "INITIAL_BUY"))).toBe(
      SubscriptionPlan.PRO
    );
    expect(notify("SUBSCRIBED")?.status).toBe(SubscriptionStatus.ACTIVE);
  });

  it("DID_RENEW moves the paid-through date", () => {
    expect(notify("DID_RENEW", "BILLING_RECOVERY")).toMatchObject({
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: new Date(future),
    });
  });

  it("DID_CHANGE_RENEWAL_STATUS off keeps Pro to the period end, then ends", () => {
    const off = notify("DID_CHANGE_RENEWAL_STATUS", "AUTO_RENEW_DISABLED");
    expect(off).toMatchObject({
      status: SubscriptionStatus.CANCELED,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date(future),
    });
    expect(plan(off)).toBe(SubscriptionPlan.PRO);
    expect(
      off && effectiveSubscriptionPlan(off, null, new Date(future + day))
    ).toBe(SubscriptionPlan.FREE);
  });

  it("DID_CHANGE_RENEWAL_STATUS on is active again", () => {
    expect(
      notify("DID_CHANGE_RENEWAL_STATUS", "AUTO_RENEW_ENABLED")
    ).toMatchObject({
      status: SubscriptionStatus.ACTIVE,
      cancelAtPeriodEnd: false,
    });
  });

  it("DID_FAIL_TO_RENEW in a grace period keeps Pro until the grace end", () => {
    const graceEnd = now.getTime() + 6 * day;
    const state = notify(
      "DID_FAIL_TO_RENEW",
      "GRACE_PERIOD",
      { ...monthly, expiresDate: past },
      { autoRenewStatus: 1, gracePeriodExpiresDate: graceEnd }
    );
    expect(state).toMatchObject({
      status: SubscriptionStatus.PAST_DUE,
      currentPeriodEnd: new Date(graceEnd),
    });
    expect(plan(state)).toBe(SubscriptionPlan.PRO);
  });

  it("DID_FAIL_TO_RENEW without grace ends Pro", () => {
    const state = notify("DID_FAIL_TO_RENEW", null, {
      ...monthly,
      expiresDate: past,
    });
    expect(state?.status).toBe(SubscriptionStatus.PAYMENT_FAILED);
    expect(plan(state)).toBe(SubscriptionPlan.FREE);
  });

  it("GRACE_PERIOD_EXPIRED ends Pro now", () => {
    const state = notify("GRACE_PERIOD_EXPIRED");
    expect(state).toMatchObject({
      status: SubscriptionStatus.PAYMENT_FAILED,
      currentPeriodEnd: null,
    });
    expect(plan(state)).toBe(SubscriptionPlan.FREE);
  });

  it("EXPIRED ends Pro now", () => {
    const state = notify("EXPIRED", "VOLUNTARY");
    expect(state).toMatchObject({
      status: SubscriptionStatus.CANCELED,
      currentPeriodEnd: null,
    });
    expect(plan(state)).toBe(SubscriptionPlan.FREE);
  });

  it.each(["REFUND", "REVOKE"])("%s removes the plan immediately", (type) => {
    const pro = notify(type);
    expect(pro).toMatchObject({ plan: SubscriptionPlan.FREE, revoked: true });
    expect(plan(pro)).toBe(SubscriptionPlan.FREE);
    const lifetime = notify(type, null, {
      transactionId: "l1",
      originalTransactionId: "l1",
      productId: "app.needt.lifetime",
    });
    expect(plan(lifetime)).toBe(SubscriptionPlan.FREE);
  });

  it("a renewal with auto-renew already off is stored as ending", () => {
    expect(
      notify("DID_RENEW", null, monthly, { autoRenewStatus: 0 })
    ).toMatchObject({
      status: SubscriptionStatus.CANCELED,
      cancelAtPeriodEnd: true,
    });
  });

  it("ONE_TIME_CHARGE grants Lifetime", () => {
    expect(
      plan(
        notify(
          "ONE_TIME_CHARGE",
          null,
          { transactionId: "l1", productId: "app.needt.lifetime" },
          {}
        )
      )
    ).toBe(SubscriptionPlan.LIFETIME);
  });

  it.each(["TEST", "PRICE_INCREASE", "CONSUMPTION_REQUEST", "REFUND_DECLINED"])(
    "%s changes nothing",
    (type) => {
      expect(notify(type)).toBeNull();
    }
  );

  it("a notification without a transaction changes nothing", () => {
    expect(
      stateFromNotification(
        { notificationType: "EXPIRED", transaction: null, renewalInfo: null },
        now
      )
    ).toBeNull();
  });
});

describe("timeBoxSandboxState", () => {
  const cap = new Date(now.getTime() + day);

  it("caps Pro at 24 hours and stores it as ending", () => {
    const state = timeBoxSandboxState(stateFromTransaction(monthly, now)!, now);
    expect(state).toMatchObject({
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.CANCELED,
      currentPeriodEnd: cap,
    });
  });

  it("keeps a shorter Sandbox period (a 5-minute renewal)", () => {
    const soon = now.getTime() + 5 * 60 * 1000;
    const state = timeBoxSandboxState(
      stateFromTransaction({ ...monthly, expiresDate: soon }, now)!,
      now
    );
    expect(state.currentPeriodEnd).toEqual(new Date(soon));
  });

  it("turns a Sandbox Lifetime into a day of Pro, never LIFETIME", () => {
    const state = timeBoxSandboxState(
      stateFromTransaction({ productId: "app.needt.lifetime" }, now)!,
      now
    );
    expect(state).toMatchObject({
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.CANCELED,
      currentPeriodEnd: cap,
    });
  });

  it("passes refunds and endings through", () => {
    const refunded = notify("REFUND")!;
    expect(timeBoxSandboxState(refunded, now)).toBe(refunded);
    const expired = notify("EXPIRED")!;
    expect(timeBoxSandboxState(expired, now)).toBe(expired);
  });
});

describe("App Store Pro is bounded by its period", () => {
  const row = (currentPeriodEnd: Date | null, status = "ACTIVE") => ({
    plan: SubscriptionPlan.PRO,
    status: status as SubscriptionStatus,
    currentPeriodEnd,
    provider: "APPLE" as const,
  });

  it("an ACTIVE Apple Pro whose renewal was never heard of ends 6 h after its period", () => {
    const recent = new Date(now.getTime() - 5 * 3600 * 1000);
    expect(effectiveSubscriptionPlan(row(recent), null, now)).toBe(
      SubscriptionPlan.PRO
    );
    const longAgo = new Date(now.getTime() - 7 * 3600 * 1000);
    expect(effectiveSubscriptionPlan(row(longAgo), null, now)).toBe(
      SubscriptionPlan.FREE
    );
  });

  it("an ACTIVE Apple Pro with no period is Free", () => {
    expect(effectiveSubscriptionPlan(row(null), null, now)).toBe(
      SubscriptionPlan.FREE
    );
  });

  it("the bound applies whatever the status", () => {
    const later = new Date(now.getTime() + day);
    expect(effectiveSubscriptionPlan(row(later, "PAST_DUE"), null, now)).toBe(
      SubscriptionPlan.PRO
    );
  });

  it("a Creem ACTIVE Pro keeps its old rule (Creem webhooks own it)", () => {
    expect(
      effectiveSubscriptionPlan(
        { ...row(null), provider: "CREEM" as const },
        null,
        now
      )
    ).toBe(SubscriptionPlan.PRO);
  });
});
