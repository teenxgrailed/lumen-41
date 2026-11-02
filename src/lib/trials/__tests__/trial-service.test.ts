import { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { effectiveSubscriptionPlan } from "@/lib/entitlements";
import { normalizeTrialEmail } from "@/lib/trials/trial-service";

describe("trial email normalization", () => {
  it.each([
    [" Person@Example.COM ", "person@example.com"],
    ["first.last+promo@gmail.com", "firstlast@gmail.com"],
    ["f.i.r.s.t.l.a.s.t@googlemail.com", "firstlast@gmail.com"],
    ["first.last+promo@outlook.com", "first.last@outlook.com"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeTrialEmail(input)).toBe(expected);
  });
});

describe("trial plan resolution", () => {
  const now = newDate("2026-09-16T12:00:00.000Z");
  const free = {
    plan: SubscriptionPlan.FREE,
    status: SubscriptionStatus.ACTIVE,
    currentPeriodEnd: null,
  };

  it("returns Pro only before the exact trial boundary", () => {
    expect(
      effectiveSubscriptionPlan(
        free,
        { endsAt: newDate("2026-09-16T12:00:00.001Z") },
        now
      )
    ).toBe(SubscriptionPlan.PRO);
    expect(
      effectiveSubscriptionPlan(
        free,
        { endsAt: newDate("2026-09-16T12:00:00.000Z") },
        now
      )
    ).toBe(SubscriptionPlan.FREE);
  });

  it("keeps paid access authoritative over a trial", () => {
    expect(
      effectiveSubscriptionPlan(
        {
          plan: SubscriptionPlan.LIFETIME,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodEnd: null,
        },
        { endsAt: newDate("2020-01-01T00:00:00.000Z") },
        now
      )
    ).toBe(SubscriptionPlan.LIFETIME);
  });
});
