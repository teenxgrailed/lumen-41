import { studentAmountCents } from "@/lib/creem/config";
import type { ApiStudent } from "@/lib/needt3/hooks/plan";
import { paywallCta } from "@/lib/needt3/paywall";
import { priceStrings } from "@/lib/needt3/pricing";
import { showsStudentPrices } from "@/lib/needt3/student-prices";

const student: ApiStudent = {
  status: "verified",
  accountEmailQualifies: false,
  priceApplies: true,
  email: "ana@ethz.ch",
  source: "auto",
  percentOff: 40,
  supportEmail: "students@needt.app",
};

describe("student price display", () => {
  it("is 40% off: $35.40 a year and $4.20 a month", () => {
    expect(studentAmountCents(5_900)).toBe(3_540);
    expect(studentAmountCents(700)).toBe(420);
    const p = priceStrings(undefined, { student: true });
    expect(p.yearly).toBe("$35.40");
    expect(p.monthly).toBe("$4.20");
    expect(p.renewalYearly).toContain("$35.40 per year");
    expect(p.renewalMonthly).toContain("$4.20 per month");
    expect(p.studentLine).toBe("Student price · 40% off Pro");
  });

  it("leaves Lifetime at $149", () => {
    expect(priceStrings(undefined, { student: true }).lifetime).toBe("$149");
    expect(
      priceStrings(undefined, { student: true }).renewalLifetime
    ).toContain("$149 one-time");
  });

  it("the regular prices are unchanged without it", () => {
    const p = priceStrings();
    expect(p.yearly).toBe("$59");
    expect(p.monthly).toBe("$7");
    expect(p.lifetime).toBe("$149");
    expect(p.student).toBe(false);
  });

  it("shows the student price where checkout will apply it", () => {
    expect(showsStudentPrices({ kind: "free", student })).toBe(true);
    expect(showsStudentPrices({ kind: "trial", student })).toBe(true);
    expect(
      showsStudentPrices({
        kind: "free",
        student: { ...student, priceApplies: false },
      })
    ).toBe(false);
    // A plan bought before the student price keeps its own price on screen.
    expect(showsStudentPrices({ kind: "yearly", student })).toBe(false);
    expect(
      showsStudentPrices({ kind: "yearly", student, discountApplied: true })
    ).toBe(true);
    expect(showsStudentPrices({ kind: "lifetime", student })).toBe(false);
  });

  it("the paywall's buttons name the student price, never on Lifetime", () => {
    const plan = {
      kind: "free" as const,
      configured: true,
      lifetimeAvailable: true,
      checkoutEnabled: true,
      trialEligible: false,
      student,
    };
    expect(paywallCta("annual", plan).label).toBe("Choose Pro · $35.40 / year");
    expect(paywallCta("monthly", plan).label).toBe(
      "Choose Pro · $4.20 / month"
    );
    expect(paywallCta("lifetime", plan).label).toBe("Get Lifetime · $149");
    expect(paywallCta("annual", { ...plan, student: null }).label).toBe(
      "Choose Pro · $59 / year"
    );
  });
});
