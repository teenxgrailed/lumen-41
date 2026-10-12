import { NEEDT_PRICING } from "@/lib/creem/config";

import { lifetimeLeftLine, money, priceStrings } from "../pricing";

describe("priceStrings", () => {
  it("reads Pro $7 / $59, Lifetime $149 and the 14-day trial from NEEDT_PRICING", () => {
    const p = priceStrings();
    expect(p.monthly).toBe("$7");
    expect(p.yearly).toBe("$59");
    expect(p.lifetime).toBe("$149");
    expect(p.trialDays).toBe(14);
    expect(p.lifetimeCap).toBe(300);
    expect(p.trialCta).toBe("Start 14-day free trial");
    expect(p.trialShort).toBe("14 days free · no card needed");
  });
  it("derives the yearly equivalent and the saving", () => {
    const p = priceStrings();
    expect(p.yearlyPerMonth).toBe("$4.92");
    expect(p.saveAmount).toBe("$25");
    expect(p.savePct).toBe(30);
  });
  it("follows the module, not a copy of it", () => {
    const p = priceStrings({
      ...NEEDT_PRICING,
      trialDays: 7,
      pro: {
        ...NEEDT_PRICING.pro,
        month: { ...NEEDT_PRICING.pro.month, amountCents: 1000 },
      },
    });
    expect(p.monthly).toBe("$10");
    expect(p.trialCta).toBe("Start 7-day free trial");
  });
});

describe("money / lifetimeLeftLine", () => {
  it("drops cents when whole", () => {
    expect(money(700)).toBe("$7");
    expect(money(492)).toBe("$4.92");
  });
  it("shows the server's count, never an invented one", () => {
    expect(lifetimeLeftLine(212, 300)).toBe("212 of 300 left");
    expect(lifetimeLeftLine(0, 300)).toBe("0 of 300 left");
    expect(lifetimeLeftLine(null, 300)).toBe("First 300 buyers");
    expect(lifetimeLeftLine(undefined, 300)).toBe("First 300 buyers");
  });
});
