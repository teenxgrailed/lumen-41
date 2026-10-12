/**
 * The sidebar's plan pill (desktop AccountMenu, phone PhoneShell) says what
 * Settings → Plan says (owner decision 2026-10-12): Lifetime → "Lifetime".
 */
import { planInfo } from "../../settings/derive";
import { planLine, planPill } from "../AccountMenu";

jest.mock("next-auth/react", () => ({
  signOut: jest.fn(),
  useSession: () => ({ data: null }),
}));

describe("planPill", () => {
  it("Lifetime reads Lifetime, as Settings → Plan does", () => {
    expect(planPill("lifetime", null)).toEqual({
      text: "Lifetime",
      tone: "pro",
    });
    expect(planPill("lifetime", null).text).toBe(planInfo("lifetime").badge);
    expect(planLine("lifetime", null)).toBe("Pro · Lifetime");
  });

  it("Monthly and Yearly read Pro", () => {
    expect(planPill("monthly", null)).toEqual({ text: "Pro", tone: "pro" });
    expect(planPill("yearly", null)).toEqual({ text: "Pro", tone: "pro" });
  });

  it("a trial shows the trial state with the days left", () => {
    expect(planPill("trial", 9)).toEqual({ text: "Trial · 9d", tone: "trial" });
    expect(planPill("trial", null).text).toBe("Trial · 0d");
  });

  it("Free reads Free", () => {
    expect(planPill("free", null)).toEqual({ text: "Free", tone: "free" });
  });

  it("every kind agrees with Settings → Plan's badge (trial adds days)", () => {
    for (const k of ["free", "monthly", "yearly", "lifetime"] as const)
      expect(planPill(k, null).text).toBe(planInfo(k).badge);
    expect(planPill("trial", 3).text.startsWith(planInfo("trial").badge)).toBe(
      true
    );
  });
});
