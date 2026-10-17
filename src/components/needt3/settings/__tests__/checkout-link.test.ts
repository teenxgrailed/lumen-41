import {
  checkoutFromSearch,
  settingsRedirectTarget,
  withoutCheckoutParam,
} from "../derive";

describe("checkout deep links", () => {
  it.each([
    ["pro-year", { plan: "pro", interval: "year" }],
    ["pro-month", { plan: "pro", interval: "month" }],
    ["lifetime", { plan: "lifetime" }],
    ["PRO-YEAR", { plan: "pro", interval: "year" }],
  ])("?checkout=%s starts %j", (value, choice) => {
    expect(checkoutFromSearch(`?section=billing&checkout=${value}`)).toEqual(
      choice
    );
  });

  it("ignores no param and unknown values", () => {
    expect(checkoutFromSearch("?section=billing")).toBeNull();
    expect(checkoutFromSearch("?checkout=enterprise")).toBeNull();
    expect(checkoutFromSearch("?checkout=constructor")).toBeNull();
    expect(checkoutFromSearch("")).toBeNull();
    expect(checkoutFromSearch(null)).toBeNull();
  });

  it("strips only the checkout param", () => {
    expect(
      withoutCheckoutParam("/settings?section=billing&checkout=pro-year#plan")
    ).toBe("/settings?section=billing#plan");
    expect(withoutCheckoutParam("/settings?checkout=lifetime")).toBe(
      "/settings"
    );
  });

  it("opens Plan for ?section=billing, the hash winning when both are set", () => {
    expect(settingsRedirectTarget("", "?section=billing")).toEqual({
      kind: "sheet",
      section: "plan",
    });
    expect(settingsRedirectTarget("#appearance", "?section=billing")).toEqual({
      kind: "sheet",
      section: "appearance",
    });
    expect(settingsRedirectTarget("", "?section=nope")).toEqual({
      kind: "sheet",
      section: null,
    });
  });
});
