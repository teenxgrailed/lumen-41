/**
 * Tooltip timing (owner feedback 2026-10-13, Craft-style): a tip waits before
 * it appears, and the next one opens at once if it follows closely.
 */
import {
  TIP_GROUP_MS,
  TIP_SHOW_MS,
  noteTipHidden,
  resetTipClock,
  tipDelay,
} from "../tip-timing";

describe("tip timing", () => {
  beforeEach(resetTipClock);

  it("waits 500-700ms before the first tip", () => {
    expect(TIP_SHOW_MS).toBeGreaterThanOrEqual(500);
    expect(TIP_SHOW_MS).toBeLessThanOrEqual(700);
    expect(tipDelay(10_000)).toBe(TIP_SHOW_MS);
  });

  it("opens at once when a tip closed within 300ms", () => {
    expect(TIP_GROUP_MS).toBe(300);
    noteTipHidden(1_000);
    expect(tipDelay(1_000)).toBe(0);
    expect(tipDelay(1_000 + TIP_GROUP_MS)).toBe(0);
  });

  it("waits again once the neighbour window has passed", () => {
    noteTipHidden(1_000);
    expect(tipDelay(1_000 + TIP_GROUP_MS + 1)).toBe(TIP_SHOW_MS);
  });
});
