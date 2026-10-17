import { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

import { addCalendarDays, newDate } from "@/lib/date-utils";
import { effectiveSubscriptionPlan } from "@/lib/entitlements";

import {
  BillingGrantError,
  grantManualPlan,
  isManualSubscription,
  revokeManualPlan,
} from "../manual-grant";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));

const NOW = newDate("2026-10-16T12:00:00.000Z");

const none = {
  creemCustomerId: null,
  creemSubscriptionId: null,
  creemProductId: null,
  stripeCustomerId: null,
  stripePaymentIntentId: null,
};

function txWith(existing: Record<string, unknown> | null) {
  const upsert = jest.fn().mockResolvedValue({});
  const update = jest.fn().mockResolvedValue({});
  const tx = {
    subscription: {
      findUnique: jest.fn().mockResolvedValue(existing),
      upsert,
      update,
    },
  };
  return { tx: tx as never, upsert, update };
}

describe("isManualSubscription", () => {
  it("is false as soon as any payment id is present", () => {
    expect(isManualSubscription(none)).toBe(true);
    expect(isManualSubscription({ ...none, creemProductId: "prod_1" })).toBe(
      false
    );
    expect(isManualSubscription({ ...none, stripeCustomerId: "cus_1" })).toBe(
      false
    );
  });
});

describe("grantManualPlan", () => {
  it("stores Pro days as a cancelled period so it expires on its own", async () => {
    const { tx, upsert } = txWith(null);
    const result = await grantManualPlan(tx, {
      userId: "u1",
      kind: "pro_days",
      days: 30,
      now: NOW,
    });
    expect(result.currentPeriodEnd).toEqual(addCalendarDays(NOW, 30));
    const created = upsert.mock.calls[0][0].create;
    expect(created).toMatchObject({
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.CANCELED,
      cancelAtPeriodEnd: true,
    });
    // The entitlement the app reads: Pro now, Free after the end date.
    const row = { ...created, currentPeriodEnd: result.currentPeriodEnd };
    expect(effectiveSubscriptionPlan(row, null, NOW)).toBe(
      SubscriptionPlan.PRO
    );
    expect(effectiveSubscriptionPlan(row, null, addCalendarDays(NOW, 31))).toBe(
      SubscriptionPlan.FREE
    );
  });

  it("stacks days onto a comp that is still running", async () => {
    const { tx } = txWith({
      ...none,
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.CANCELED,
      currentPeriodEnd: newDate("2026-10-20T12:00:00.000Z"),
    });
    const result = await grantManualPlan(tx, {
      userId: "u1",
      kind: "pro_days",
      days: 10,
      now: NOW,
    });
    expect(result.currentPeriodEnd).toEqual(
      addCalendarDays(newDate("2026-10-20T12:00:00.000Z"), 10)
    );
  });

  it("grants Lifetime with no end date", async () => {
    const { tx, upsert } = txWith(null);
    const result = await grantManualPlan(tx, {
      userId: "u1",
      kind: "lifetime",
    });
    expect(result).toEqual({
      plan: SubscriptionPlan.LIFETIME,
      currentPeriodEnd: null,
    });
    expect(upsert.mock.calls[0][0].create).toMatchObject({
      plan: SubscriptionPlan.LIFETIME,
      status: SubscriptionStatus.ACTIVE,
    });
  });

  it("never touches a row somebody paid for", async () => {
    const { tx, upsert } = txWith({
      ...none,
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: null,
      creemSubscriptionId: "sub_1",
    });
    await expect(
      grantManualPlan(tx, { userId: "u1", kind: "lifetime" })
    ).rejects.toMatchObject({ code: "PAID_SUBSCRIPTION" });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("does not turn Lifetime into a shorter plan", async () => {
    const { tx } = txWith({
      ...none,
      plan: SubscriptionPlan.LIFETIME,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: null,
    });
    await expect(
      grantManualPlan(tx, { userId: "u1", kind: "pro_days", days: 5 })
    ).rejects.toMatchObject({ code: "ALREADY_LIFETIME" });
  });

  it("rejects days that are not a whole number in range", async () => {
    for (const days of [0, -3, 1.5, 4000, undefined]) {
      const { tx } = txWith(null);
      await expect(
        grantManualPlan(tx, { userId: "u1", kind: "pro_days", days })
      ).rejects.toBeInstanceOf(BillingGrantError);
    }
  });
});

describe("revokeManualPlan", () => {
  it("returns a comp to Free", async () => {
    const { tx, update } = txWith({
      ...none,
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.CANCELED,
      currentPeriodEnd: newDate("2026-12-01T00:00:00Z"),
    });
    await expect(revokeManualPlan(tx, { userId: "u1" })).resolves.toEqual({
      revoked: SubscriptionPlan.PRO,
    });
    expect(update.mock.calls[0][0].data).toMatchObject({
      plan: SubscriptionPlan.FREE,
      currentPeriodEnd: null,
    });
  });

  it("refuses a bought plan and an empty account", async () => {
    const bought = txWith({
      ...none,
      plan: SubscriptionPlan.LIFETIME,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: null,
      creemProductId: "prod_life",
    });
    await expect(
      revokeManualPlan(bought.tx, { userId: "u1" })
    ).rejects.toMatchObject({ code: "NOT_A_COMP" });
    const free = txWith(null);
    await expect(
      revokeManualPlan(free.tx, { userId: "u1" })
    ).rejects.toMatchObject({ code: "NOTHING_TO_REVOKE" });
    expect(bought.update).not.toHaveBeenCalled();
  });
});
