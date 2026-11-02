import type { ApiStudent } from "@/lib/needt3/hooks/plan";

import { studentPanel } from "../student-derive";

const base: ApiStudent = {
  status: "none",
  accountEmailQualifies: false,
  priceApplies: false,
  email: null,
  source: null,
  percentOff: 40,
  supportEmail: "students@needt.app",
};

describe("Settings, Plan: student price", () => {
  it("from needt.app/students without a university email, points to students@needt.app", () => {
    const panel = studentPanel({ kind: "free", student: base }, true)!;
    expect(panel.line).toContain("isn't from a school we recognise");
    expect(panel.note).toContain("students@needt.app");
    expect(panel.canAdd).toBe(true);
  });

  it("a university sign-in address is on without a form", () => {
    const panel = studentPanel({
      kind: "free",
      student: { ...base, accountEmailQualifies: true, priceApplies: true },
    })!;
    expect(panel.verified).toBe(true);
    expect(panel.canAdd).toBe(false);
  });

  it("an existing subscriber is told plainly the running plan keeps its price", () => {
    const panel = studentPanel({
      kind: "yearly",
      discountApplied: false,
      student: {
        ...base,
        status: "verified",
        priceApplies: true,
        email: "ana@ethz.ch",
      },
    })!;
    expect(panel.line).toBe("ana@ethz.ch · 40% off Pro monthly and yearly");
    expect(panel.note).toContain(
      "can't add a discount to a running subscription"
    );
  });

  it("is not shown on Lifetime", () => {
    expect(studentPanel({ kind: "lifetime", student: base })).toBeNull();
  });
});
