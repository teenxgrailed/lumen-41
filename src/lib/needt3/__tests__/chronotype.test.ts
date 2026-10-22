import { chronotypeCurve, chronotypeEnergy, isChronotype } from "../chronotype";

describe("chronotype curves", () => {
  it("peaks early for larks and late for owls", () => {
    expect(chronotypeEnergy(7, "lark")).toBe("high");
    expect(chronotypeEnergy(7, "owl")).toBeNull();
    expect(chronotypeEnergy(17, "owl")).toBe("high");
    expect(chronotypeEnergy(17, "lark")).toBe("low");
  });

  it("dips after lunch for everyone", () => {
    for (const c of ["lark", "neutral", "owl"] as const) {
      expect(chronotypeEnergy(13, c)).toBe("low");
    }
  });

  it("has no overlapping or empty bands", () => {
    for (const c of ["lark", "neutral", "owl"] as const) {
      const bands = chronotypeCurve(c);
      bands.forEach((b, i) => {
        expect(b.end).toBeGreaterThan(b.start);
        if (i > 0) expect(b.start).toBeGreaterThanOrEqual(bands[i - 1].end);
      });
    }
  });

  it("knows its own names only", () => {
    expect(isChronotype("owl")).toBe(true);
    expect(isChronotype("bear")).toBe(false);
    expect(isChronotype(null)).toBe(false);
  });
});
