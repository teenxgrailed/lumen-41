import {
  BUDGET_PROMO_PREF,
  BUDGET_SIDEBAR_PREF,
  budgetFrameSrc,
  budgetNavItem,
  budgetView,
  isBudgetPath,
  promoSeenFrom,
} from "../budget";

describe("budgetNavItem", () => {
  it("is absent while the flag is off, whatever the plan", () => {
    expect(budgetNavItem({ enabled: false, pro: true, prefs: {} })).toBeNull();
    expect(budgetNavItem({ enabled: false, pro: false, prefs: {} })).toBeNull();
  });

  it("is locked on Free and cannot be hidden there", () => {
    expect(
      budgetNavItem({
        enabled: true,
        pro: false,
        prefs: { [BUDGET_SIDEBAR_PREF]: false },
      })
    ).toEqual({ href: "/budget", label: "Budget", locked: true });
  });

  it("follows the switch on Pro", () => {
    expect(budgetNavItem({ enabled: true, pro: true, prefs: {} })?.locked).toBe(
      false
    );
    expect(
      budgetNavItem({
        enabled: true,
        pro: true,
        prefs: { [BUDGET_SIDEBAR_PREF]: false },
      })
    ).toBeNull();
  });

  it("waits for the plan and the settings before showing anything", () => {
    expect(budgetNavItem({ enabled: true, pro: undefined, prefs: {} })).toBe(
      null
    );
    expect(budgetNavItem({ enabled: true, pro: true, prefs: null })).toBe(null);
    expect(
      budgetNavItem({ enabled: true, pro: false, prefs: null })?.locked
    ).toBe(true);
  });
});

describe("budgetView", () => {
  it("waits for the plan", () => {
    expect(budgetView({ pro: undefined, promoSeen: true })).toBe("loading");
  });
  it("shows Free the promo, seen or not", () => {
    expect(budgetView({ pro: false, promoSeen: undefined })).toBe("promo");
    expect(budgetView({ pro: false, promoSeen: true })).toBe("promo");
  });
  it("shows Pro the promo once, then Budget", () => {
    expect(budgetView({ pro: true, promoSeen: undefined })).toBe("loading");
    expect(budgetView({ pro: true, promoSeen: false })).toBe("intro");
    expect(budgetView({ pro: true, promoSeen: true })).toBe("app");
  });
});

describe("promoSeenFrom", () => {
  it("is unknown until settings load, then only a stored true counts", () => {
    expect(promoSeenFrom(undefined, false)).toBeUndefined();
    expect(promoSeenFrom({}, true)).toBe(false);
    expect(promoSeenFrom({ [BUDGET_PROMO_PREF]: "yes" }, true)).toBe(false);
    expect(promoSeenFrom({ [BUDGET_PROMO_PREF]: true }, true)).toBe(true);
  });
});

describe("paths and the frame", () => {
  it("knows the Budget screen", () => {
    expect(isBudgetPath("/budget")).toBe(true);
    expect(isBudgetPath("/budget/x")).toBe(true);
    expect(isBudgetPath("/budgets")).toBe(false);
  });
  it("opens Budget chromeless in Needt's theme", () => {
    expect(budgetFrameSrc("dark", "https://budget.example")).toBe(
      "https://budget.example/dashboard?embed=1&theme=dark"
    );
  });
});
