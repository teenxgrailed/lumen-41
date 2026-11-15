import {
  EASED_CEILING,
  clampFill,
  easedFill,
  fillFor,
  fillInsetPct,
} from "../needtLoadingFill";

describe("the word fill", () => {
  it("maps real progress to the fill width", () => {
    expect(fillInsetPct(fillFor({ progress: 0, elapsedMs: 9e6 }))).toBe(100);
    expect(fillInsetPct(fillFor({ progress: 0.25, elapsedMs: 0 }))).toBe(75);
    expect(fillInsetPct(fillFor({ progress: 0.5, elapsedMs: 0 }))).toBe(50);
    expect(fillInsetPct(fillFor({ progress: 1, elapsedMs: 0 }))).toBe(0);
  });

  it("pulls out-of-range progress in", () => {
    expect(clampFill(-3)).toBe(0);
    expect(clampFill(7)).toBe(1);
    expect(clampFill(Number.NaN)).toBe(0);
  });

  it("eases toward about 90%, slows down, and never completes on its own", () => {
    let previous = -1;
    let previousStep = Infinity;
    for (const ms of [0, 500, 1000, 2000, 4000, 8000, 16000, 60_000, 3.6e6]) {
      const f = easedFill(ms);
      expect(f).toBeGreaterThanOrEqual(previous);
      expect(f).toBeLessThanOrEqual(EASED_CEILING);
      expect(f).toBeLessThan(1);
      previous = f;
    }
    // Each equal slice of time moves it less than the one before.
    for (let i = 0; i < 6; i++) {
      const step = easedFill((i + 1) * 1500) - easedFill(i * 1500);
      expect(step).toBeLessThan(previousStep);
      previousStep = step;
    }
    expect(easedFill(0)).toBe(0);
    expect(easedFill(3.6e6)).toBeGreaterThan(0.89);
  });

  it("completes only on real progress", () => {
    expect(fillFor({ progress: undefined, elapsedMs: 1e9 })).toBeLessThan(1);
    expect(fillFor({ progress: 1, elapsedMs: 0 })).toBe(1);
  });
});
