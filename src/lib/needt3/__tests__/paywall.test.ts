import {
  checkoutSelection,
  freeIncludes,
  isPro,
  lifetimeLeftPct,
  paywallCta,
  paywallPick,
  planLine,
  proIncludes,
  proLimitFull,
  proLimitText,
} from "@/lib/needt3/paywall";
import { priceStrings } from "@/lib/needt3/pricing";
import { PLAN_LIMITS } from "@/lib/plan-limits";

const PRICE = priceStrings();
const open = {
  configured: true,
  lifetimeAvailable: true,
  checkoutEnabled: true,
} as const;

describe("Lifetime meter", () => {
  it("is empty until the server has counted", () => {
    expect(lifetimeLeftPct(undefined)).toBeNull();
    expect(lifetimeLeftPct(null)).toBeNull();
  });

  it("fills from the server count, clamped to the cap", () => {
    expect(lifetimeLeftPct(150)).toBe(50);
    expect(lifetimeLeftPct(999)).toBe(100);
    expect(lifetimeLeftPct(-4)).toBe(0);
  });
});

describe("checkout", () => {
  it("maps a pick to the checkout body", () => {
    expect(checkoutSelection("monthly")).toEqual({
      plan: "pro",
      interval: "month",
    });
    expect(checkoutSelection("annual")).toEqual({
      plan: "pro",
      interval: "year",
    });
    expect(checkoutSelection("lifetime")).toEqual({ plan: "lifetime" });
  });

  it("falls back to yearly for an unknown cycle", () => {
    expect(paywallPick("monthly")).toBe("monthly");
    expect(paywallPick("lifetime")).toBe("lifetime");
    expect(paywallPick("weekly")).toBe("annual");
    expect(paywallPick(undefined)).toBe("annual");
  });
});

describe("paywall call to action", () => {
  it("sends a free person to checkout and describes the trial", () => {
    const cta = paywallCta("annual", { kind: "free", ...open });
    expect(cta.label).toBe("Choose Pro · $59 / year");
    expect(cta.sub).toBe(PRICE.trialShort);
    expect(cta.blocked).toBeNull();
  });

  it("explains what happens when the trial ends, to someone in one", () => {
    const cta = paywallCta("monthly", { kind: "trial", ...open });
    expect(cta.label).toBe("Choose Pro · $7 / month");
    expect(cta.sub).toBe(
      "When the trial ends you go back to Free unless you choose a plan — we’ll remind you 3 days before."
    );
  });

  it("turns the button off, with a reason, while checkout is not configured", () => {
    const cta = paywallCta("annual", {
      kind: "free",
      configured: false,
      lifetimeAvailable: true,
    });
    expect(cta.blocked).toMatch(/opens soon/i);
  });

  it("closes Lifetime when the seats are gone", () => {
    const cta = paywallCta("lifetime", {
      kind: "free",
      configured: true,
      lifetimeAvailable: false,
      checkoutEnabled: true,
    });
    expect(cta.label).toBe("Lifetime is closed");
    expect(cta.blocked).toContain("300");
  });

  it("never sells a plan the person already has", () => {
    expect(paywallCta("annual", { kind: "yearly", ...open }).label).toBe(
      "Current plan"
    );
    expect(
      paywallCta("lifetime", { kind: "lifetime", ...open }).blocked
    ).toMatch(/thank you/i);
    expect(paywallCta("monthly", { kind: "lifetime", ...open }).label).toBe(
      "Lifetime is yours"
    );
  });

  it("still sells Lifetime to a Pro subscriber", () => {
    const cta = paywallCta("lifetime", { kind: "yearly", ...open });
    expect(cta.label).toBe("Get Lifetime · $149");
    expect(cta.blocked).toBeNull();
  });

  it("works before the plan has loaded", () => {
    expect(paywallCta("lifetime", null).blocked).toBeNull();
  });
});

describe("plan state", () => {
  it("names the plan in one line", () => {
    expect(planLine({ kind: "free", trialDaysLeft: null })).toBe("Free");
    expect(planLine({ kind: "trial", trialDaysLeft: 9 })).toBe(
      "Pro trial · 9 days left"
    );
    expect(planLine({ kind: "trial", trialDaysLeft: 1 })).toBe(
      "Pro trial · 1 day left"
    );
    expect(planLine({ kind: "yearly", trialDaysLeft: null })).toBe(
      "Pro · $59 / year"
    );
    expect(planLine({ kind: "lifetime", trialDaysLeft: null })).toBe(
      "Lifetime · thank you"
    );
  });

  it("treats the trial and every paid plan as Pro", () => {
    expect(isPro("free")).toBe(false);
    expect(isPro(undefined)).toBe(false);
    for (const kind of ["trial", "monthly", "yearly", "lifetime"] as const) {
      expect(isPro(kind)).toBe(true);
    }
  });

  it("words a Free allowance and flags when it is used up", () => {
    expect(proLimitText({ used: 1, max: 1, noun: "mail accounts" })).toBe(
      "1 of 1 mail accounts"
    );
    expect(proLimitText({ used: 3, max: 1, noun: "boards" })).toBe(
      "3 boards · Free includes 1"
    );
    expect(proLimitFull({ used: 0, max: 1, noun: "x" })).toBe(false);
    expect(proLimitFull({ used: 1, max: 1, noun: "x" })).toBe(true);
  });
});

describe("checkout switch (billing_checkout)", () => {
  const configured = {
    kind: "free",
    configured: true,
    lifetimeAvailable: true,
  } as const;

  it("keeps the button off while the switch is off", () => {
    const cta = paywallCta("annual", { ...configured, checkoutEnabled: false });
    expect(cta.blocked).toMatch(/opens soon/i);
  });

  it("treats a response without the field as off", () => {
    expect(paywallCta("monthly", configured).blocked).toMatch(/opens soon/i);
    expect(paywallCta("lifetime", configured).blocked).toMatch(/opens soon/i);
  });

  it("opens checkout only when the switch is on", () => {
    expect(
      paywallCta("annual", { ...configured, checkoutEnabled: true }).blocked
    ).toBeNull();
  });
});

describe("what each plan includes", () => {
  it("prints the Free limits the server enforces", () => {
    const free = PLAN_LIMITS.FREE;
    const lines = freeIncludes();
    expect(lines).toContain(`${free.calendars} calendar`);
    expect(lines).toContain(
      `${free.autoScheduledTasks} auto-scheduled tasks a month`
    );
    expect(lines).toContain(`${free.boards} board`);
    expect(lines.some((l) => /mail account/.test(l))).toBe(free.mailboxes > 0);
  });

  it("prints the Pro limits the server enforces, AI without counts", () => {
    const pro = PLAN_LIMITS.PRO;
    const titles = proIncludes().map(([t]) => t);
    expect(titles[0]).toBe("AI included");
    expect(titles).toContain("Unlimited calendars");
    expect(titles).toContain("Unlimited auto-scheduled tasks");
    expect(titles).toContain("Unlimited boards");
    expect(titles).toContain(`${pro.mailboxes} mail accounts`);
    for (const t of titles) expect(t).not.toMatch(/AI.*\d/);
  });

  it("follows a change in the limits", () => {
    const lines = freeIncludes({
      ...PLAN_LIMITS.FREE,
      boards: 2,
      mailboxes: 1,
    });
    expect(lines).toContain("2 boards");
    expect(lines).toContain("1 mail account");
  });

  it("drops lines no entitlement backs", () => {
    const all = [...freeIncludes(), ...proIncludes().map(([t]) => t)].join(" ");
    for (const gone of [
      "Priority sync",
      "Document themes",
      "moodboards",
      "Every connection",
    ])
      expect(all).not.toContain(gone);
  });
});
