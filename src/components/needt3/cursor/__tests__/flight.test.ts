import {
  acEase,
  planReach,
  reachAt,
  reachMs,
} from "@/components/needt/cursor/motion";

import {
  CORNER_GUTTER,
  CORNER_PILL,
  cornerHome,
} from "@/lib/assistant-position";

import { placeHand } from "../AgentCursor";

/* The owner-locked flight (PORT.md §5), checked against the formulas as
   written, not against the implementation's own constants. */
const minimumJerk = (t: number) => 10 * t ** 3 - 15 * t ** 4 + 6 * t ** 5;
const fitts = (d: number) =>
  Math.min(760, Math.max(300, 210 + 190 * Math.log2(d / 90 + 1)));

describe("v3 agent cursor flight", () => {
  it("eases by minimum jerk 10t³ − 15t⁴ + 6t⁵", () => {
    for (let i = 0; i <= 20; i += 1) {
      const t = i / 20;
      expect(acEase(t)).toBeCloseTo(minimumJerk(t), 12);
    }
    expect(acEase(-1)).toBe(0);
    expect(acEase(2)).toBe(1);
  });

  it("takes clamp(210 + 190·log2(d/90 + 1), 300, 760) ms", () => {
    for (const d of [0, 10, 45, 90, 180, 400, 900, 2000, 8000]) {
      expect(reachMs(d)).toBeCloseTo(fitts(d), 10);
    }
    expect(reachMs(0)).toBe(300);
    expect(reachMs(100000)).toBe(760);
  });

  it("fixes one quadratic bezier before the first frame", () => {
    const from = { x: 1200, y: 860 };
    const to = { x: 400, y: 300 };
    const plan = planReach(from, to, 1);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.control)).toBe(true);

    const len = Math.hypot(to.x - from.x, to.y - from.y);
    const bow = Math.min(len * 0.11, 52);
    expect(plan.control.x).toBeCloseTo(
      from.x + (to.x - from.x) / 2 + (-(to.y - from.y) / len) * bow,
      10
    );
    expect(plan.control.y).toBeCloseTo(
      from.y + (to.y - from.y) / 2 + ((to.x - from.x) / len) * bow,
      10
    );

    // Every frame is the same bezier evaluated at the eased time.
    for (const ms of [0, 50, plan.ms / 2, plan.ms - 1, plan.ms]) {
      const e = minimumJerk(Math.min(ms / plan.ms, 1));
      const u = 1 - e;
      const p = reachAt(plan, ms);
      expect(p.x).toBeCloseTo(
        u * u * from.x + 2 * u * e * plan.control.x + e * e * to.x,
        9
      );
      expect(p.y).toBeCloseTo(
        u * u * from.y + 2 * u * e * plan.control.y + e * e * to.y,
        9
      );
    }
    expect(reachAt(plan, plan.ms)).toEqual({ x: to.x, y: to.y });
  });

  it("emerges from and returns to the corner's pill", () => {
    expect(cornerHome({ right: 1440, bottom: 900 })).toEqual({
      x: 1440 - CORNER_GUTTER - CORNER_PILL.w / 2,
      y: 900 - CORNER_GUTTER - CORNER_PILL.h / 2,
    });
  });

  it("writes translate3d straight to the elements", () => {
    const el = () => ({ style: { transform: "" } }) as unknown as HTMLElement;
    const arrow = el();
    const load = el();
    const bubble = el();
    placeHand({ arrow, load, bubble }, 12.5, 40);
    expect(arrow.style.transform).toBe("translate3d(12.5px, 40px, 0)");
    expect(load.style.transform).toBe(
      "translate3d(27.5px, 59px, 0) rotate(-1.5deg)"
    );
    expect(bubble.style.transform).toBe("translate3d(34.5px, 31px, 0)");
  });
});
