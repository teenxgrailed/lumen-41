import { NEEDT_PRICING } from "@/lib/creem/config";
import {
  freeIncludes,
  lifetimeLeftPct,
  paywallCta,
  proIncludes,
} from "@/lib/needt3/paywall";
import { lifetimeLeftLine, money, priceStrings } from "@/lib/needt3/pricing";
import { PLAN_LIMITS } from "@/lib/plan-limits";

import {
  type PwPlan,
  checkoutBody,
  freeSummary,
  pickOf,
  pwDisabled,
  pwView,
} from "../paywallModel";

const p = priceStrings();
const CAP = p.lifetimeCap;

/** A plan as `GET /api/billing` returns it, with checkout open. */
const open = {
  configured: true,
  checkoutEnabled: true,
  lifetimeAvailable: true,
  lifetimeLeft: 212,
} as const;
const plan = (over: Partial<PwPlan> & Pick<PwPlan, "kind">): PwPlan => ({
  ...open,
  ...over,
});

const online = { online: true, busy: false };

describe("the strings come from the one pricing module", () => {
  it("reads the prices, the trial and the cap from NEEDT_PRICING, never typed", () => {
    expect(p.monthly).toBe(money(NEEDT_PRICING.pro.month.amountCents));
    expect(p.yearly).toBe(money(NEEDT_PRICING.pro.year.amountCents));
    expect(p.lifetime).toBe(money(NEEDT_PRICING.lifetime.amountCents));
    expect(p.trialDays).toBe(NEEDT_PRICING.trialDays);
    expect(p.lifetimeCap).toBe(NEEDT_PRICING.lifetime.cap);
  });
});

describe("the call to action is the desktop paywall's", () => {
  it("is exactly paywallCta for every plan state", () => {
    const states: Array<PwPlan | null | undefined> = [
      plan({ kind: "free" }),
      plan({ kind: "trial" }),
      plan({ kind: "monthly" }),
      plan({ kind: "yearly" }),
      plan({ kind: "lifetime" }),
      plan({ kind: "free", checkoutEnabled: false }),
      plan({ kind: "free", lifetimeAvailable: false }),
      null,
      undefined,
    ];
    for (const s of states)
      for (const pick of ["monthly", "annual", "lifetime"] as const)
        expect(pwView(pick, s).cta).toEqual(paywallCta(pick, s ?? null));
  });

  it("free: a Pro pick says Choose Pro and the button works", () => {
    const v = pwView("annual", plan({ kind: "free" }));
    expect(v.cta.label).toBe(`Choose Pro · ${p.yearly} / year`);
    expect(v.cta.blocked).toBeNull();
    expect(v.cta.sub).toBe(p.trialShort);
    expect(pwDisabled(v, online)).toBe(false);
    expect(pwView("monthly", plan({ kind: "free" })).cta.label).toBe(
      `Choose Pro · ${p.monthly} / month`
    );
    expect(pwView("lifetime", plan({ kind: "free" })).cta.label).toBe(
      `Get Lifetime · ${p.lifetime}`
    );
  });

  it("never sells the free trial on a paid checkout", () => {
    for (const kind of ["free", "trial", "monthly", "yearly"] as const)
      for (const pick of ["monthly", "annual", "lifetime"] as const) {
        const { cta } = pwView(pick, plan({ kind }));
        expect(cta.label).not.toMatch(/free trial/i);
        expect(cta.label).not.toMatch(/start .*trial/i);
      }
  });

  it("trial: the trial is described, Pro goes to checkout", () => {
    const v = pwView("annual", plan({ kind: "trial" }));
    expect(v.cta.label).toBe(`Choose Pro · ${p.yearly} / year`);
    expect(v.cta.sub).toMatch(/go back to Free unless you choose a plan/);
    expect(v.cta.blocked).toBeNull();
    expect(v.freeTag).toBe("Included");
  });

  it("monthly: the monthly card is the current plan, the others are not", () => {
    const m = pwView("monthly", plan({ kind: "monthly" }));
    expect(m.cta.label).toBe("Current plan");
    expect(m.cta.blocked).toBe("This is the plan you are on.");
    expect(pwDisabled(m, online)).toBe(true);
    const l = pwView("lifetime", plan({ kind: "monthly" }));
    expect(l.cta.label).toBe(`Get Lifetime · ${p.lifetime}`);
    expect(pwDisabled(l, online)).toBe(false);
  });

  it("yearly: current plan", () => {
    const v = pwView("annual", plan({ kind: "yearly" }));
    expect(v.cta.label).toBe("Current plan");
    expect(pwDisabled(v, online)).toBe(true);
    expect(v.freeTag).toBe("Included");
  });

  it("lifetime: every pick reads 'Lifetime is yours' and is off", () => {
    for (const pick of ["monthly", "annual", "lifetime"] as const) {
      const v = pwView(pick, plan({ kind: "lifetime" }));
      expect(v.cta.label).toBe("Lifetime is yours");
      expect(v.cta.blocked).toBe("Thank you — Pro for good.");
      expect(pwDisabled(v, online)).toBe(true);
    }
  });

  it("plan still loading (null): the button is off, the free tag is Current plan", () => {
    for (const s of [null, undefined]) {
      const v = pwView("annual", s);
      expect(v.loading).toBe(true);
      expect(pwDisabled(v, online)).toBe(true);
      expect(v.freeTag).toBe("Current plan");
      expect(v.lifetimeLine).toBe(`First ${CAP} buyers`);
      expect(v.lifetimePct).toBeNull();
    }
    // paywallCta alone has no "blocked" for null; the model adds the loading gate.
    expect(paywallCta("annual", null).blocked).toBeNull();
  });

  it("checkout disabled (billing_checkout off or absent): blocked, with the reason", () => {
    const off = pwView(
      "annual",
      plan({ kind: "free", checkoutEnabled: false })
    );
    expect(off.cta.blocked).toMatch(/Checkout opens soon/);
    expect(pwDisabled(off, online)).toBe(true);
    const absent = pwView("monthly", {
      kind: "free",
      configured: true,
      lifetimeAvailable: true,
    });
    expect(absent.cta.blocked).toMatch(/Checkout opens soon/);
    expect(pwDisabled(absent, online)).toBe(true);
    const unconfigured = pwView(
      "lifetime",
      plan({ kind: "free", configured: false })
    );
    expect(unconfigured.cta.blocked).toMatch(/Checkout opens soon/);
  });

  it("Lifetime sold out: the lifetime pick is closed, Pro still works", () => {
    const l = pwView(
      "lifetime",
      plan({ kind: "free", lifetimeAvailable: false })
    );
    expect(l.cta.label).toBe("Lifetime is closed");
    expect(l.cta.blocked).toBe(`All ${CAP} Lifetime plans are taken.`);
    expect(pwDisabled(l, online)).toBe(true);
    const pro = pwView(
      "annual",
      plan({ kind: "free", lifetimeAvailable: false })
    );
    expect(pro.cta.blocked).toBeNull();
    expect(pwDisabled(pro, online)).toBe(false);
  });

  it("offline or already opening: off even when the plan allows it", () => {
    const v = pwView("annual", plan({ kind: "free" }));
    expect(pwDisabled(v, { online: false, busy: false })).toBe(true);
    expect(pwDisabled(v, { online: true, busy: true })).toBe(true);
  });
});

describe("the lifetime counter is the server's count", () => {
  it("shows plan.lifetimeLeft and fills the meter from it", () => {
    const v = pwView("lifetime", plan({ kind: "free", lifetimeLeft: 212 }));
    expect(v.lifetimeLine).toBe(lifetimeLeftLine(212, CAP));
    expect(v.lifetimeLine).toBe(`212 of ${CAP} left`);
    expect(v.lifetimePct).toBe(lifetimeLeftPct(212));
  });
  it("sold out reads 0 of the cap, with an empty meter", () => {
    const v = pwView(
      "lifetime",
      plan({ kind: "free", lifetimeAvailable: false, lifetimeLeft: 0 })
    );
    expect(v.lifetimeLine).toBe(`0 of ${CAP} left`);
    expect(v.lifetimePct).toBe(0);
  });
  it("is the cap alone while the server has sent no count", () => {
    for (const lifetimeLeft of [null, undefined]) {
      const v = pwView("lifetime", plan({ kind: "free", lifetimeLeft }));
      expect(v.lifetimeLine).toBe(`First ${CAP} buyers`);
      expect(v.lifetimePct).toBeNull();
    }
  });
});

describe("the feature lists are built from PLAN_LIMITS", () => {
  it("the Free line is freeIncludes() and carries no hard-coded feature", () => {
    expect(freeSummary()).toBe(
      freeIncludes()
        .join(", ")
        .toLowerCase()
        .replace(/^./, (c) => c.toUpperCase())
    );
    expect(freeSummary()).toContain(`${PLAN_LIMITS.FREE.calendars} calendar`);
    expect(freeSummary()).not.toMatch(/moodboard|priority sync/i);
  });
  it("Pro lists come from proIncludes()", () => {
    const titles = proIncludes().map(([t]) => t);
    expect(titles.length).toBeGreaterThan(0);
    expect(titles).not.toContain("Priority sync");
    expect(titles).not.toContain("Unlimited moodboards");
  });
});

describe("checkout", () => {
  it("sends the plan the server's schema takes", () => {
    expect(checkoutBody("monthly")).toEqual({ plan: "pro", interval: "month" });
    expect(checkoutBody("annual")).toEqual({ plan: "pro", interval: "year" });
    expect(checkoutBody("lifetime")).toEqual({ plan: "lifetime" });
  });
  it("pickOf: yearly is the default card", () => {
    expect(pickOf(undefined)).toBe("annual");
    expect(pickOf("yearly")).toBe("annual");
    expect(pickOf("monthly")).toBe("monthly");
    expect(pickOf("lifetime")).toBe("lifetime");
  });
});
