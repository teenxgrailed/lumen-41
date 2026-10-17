import { NEEDT_PRICING, formatBillingPrice } from "../config";

describe("Needt pricing catalog", () => {
  it("keeps the approved public prices", () => {
    expect(NEEDT_PRICING.pro.month.amountCents).toBe(700);
    expect(NEEDT_PRICING.pro.year.amountCents).toBe(5_900);
    expect(NEEDT_PRICING.lifetime.amountCents).toBe(14_900);
    expect(formatBillingPrice(NEEDT_PRICING.pro.month.amountCents)).toBe("$7");
    expect(formatBillingPrice(NEEDT_PRICING.pro.year.amountCents)).toBe("$59");
    expect(formatBillingPrice(NEEDT_PRICING.lifetime.amountCents)).toBe("$149");
  });
});
