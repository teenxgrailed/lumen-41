import {
  HOLD_SLOP,
  PULL_ARM,
  SWIPE_AT,
  axisOf,
  firstStop,
  footerPin,
  holdMoved,
  morphClip,
  pullOffset,
  pullSettle,
  pushSample,
  sheetOffset,
  sheetSettle,
  sheetStops,
  swipeArmed,
  swipeCommit,
  swipeOffset,
  swipeReveal,
  velocity,
} from "../gesture";
import { rubber, springStep } from "../spring";

describe("spring", () => {
  it("settles on the target and reports rest", () => {
    const s = { x: 0, v: 0 };
    let rest = false;
    for (let i = 0; i < 600 && !rest; i++)
      rest = springStep(s, 100, 1 / 60, 420, 0.86);
    expect(rest).toBe(true);
    expect(s.x).toBeCloseTo(100, 2);
  });
  it("a long frame does not blow it up", () => {
    const s = { x: 0, v: 0 };
    springStep(s, 100, 5, 420, 0.86);
    expect(Number.isFinite(s.x)).toBe(true);
    expect(Math.abs(s.x)).toBeLessThan(500);
  });
  it("rubber slows but never reaches its limit", () => {
    expect(rubber(0, 40)).toBe(0);
    expect(rubber(50, 40)).toBeLessThan(40);
    expect(rubber(500, 40)).toBeLessThan(40);
    expect(rubber(200, 40)).toBeGreaterThan(rubber(100, 40));
  });
});

describe("samples", () => {
  it("keeps the last 90 ms and measures speed", () => {
    const s: [number, number][] = [];
    pushSample(s, 0, 0);
    pushSample(s, 50, 20);
    pushSample(s, 100, 60);
    expect(s[0][0]).toBe(50);
    expect(velocity(s)).toBeCloseTo(0.8);
    expect(velocity([])).toBe(0);
    expect(velocity([[0, 0]])).toBe(0);
  });
  it("axis waits for the slop, then picks", () => {
    expect(axisOf(3, 4)).toBeNull();
    expect(axisOf(20, 4)).toBe("x");
    expect(axisOf(10, 10)).toBe("y");
    expect(axisOf(-30, 5)).toBe("x");
  });
});

describe("row swipe", () => {
  const both = { canDone: true, canLater: true };
  it("follows the finger 1:1 to the threshold, then a rubber band", () => {
    expect(swipeOffset(40, both)).toBe(40);
    expect(swipeOffset(SWIPE_AT, both)).toBe(SWIPE_AT);
    expect(swipeOffset(300, both)).toBeGreaterThan(SWIPE_AT);
    expect(swipeOffset(300, both)).toBeLessThan(SWIPE_AT + 56);
    expect(swipeOffset(-40, both)).toBe(-40);
  });
  it("a side that cannot act only gives a short rubber", () => {
    expect(swipeOffset(200, { canLater: true })).toBeLessThan(18);
    expect(swipeReveal(200, { canLater: true })).toBe(0);
    expect(swipeReveal(46, both)).toBeCloseTo(0.5);
    expect(swipeArmed(100, { canLater: true })).toBeNull();
  });
  it("arms past the threshold", () => {
    expect(swipeArmed(91, both)).toBeNull();
    expect(swipeArmed(92, both)).toBe("done");
    expect(swipeArmed(-120, both)).toBe("later");
  });
  it("commits on distance or on a flick", () => {
    expect(swipeCommit(100, 0, both)).toBe("done");
    expect(swipeCommit(-100, 0, both)).toBe("later");
    expect(swipeCommit(50, 0.3, both)).toBeNull();
    expect(swipeCommit(50, 0.8, both)).toBe("done");
    expect(swipeCommit(-50, -0.8, both)).toBe("later");
    expect(swipeCommit(50, -0.8, both)).toBeNull();
    expect(swipeCommit(30, 2, both)).toBeNull();
    expect(swipeCommit(200, 0, { canLater: true })).toBeNull();
  });
});

describe("sheet", () => {
  it("drags 1:1 down and meets a rubber band up", () => {
    expect(sheetOffset(120)).toBe(120);
    expect(sheetOffset(0)).toBe(0);
    expect(sheetOffset(-100)).toBeLessThan(0);
    expect(sheetOffset(-100)).toBeGreaterThan(-40);
  });
  it("stops: highest first, shut last", () => {
    expect(sheetStops(500, 800, null)).toEqual([0, 524]);
    const st = sheetStops(736, 800, [0.5, 0.92]);
    expect(st).toHaveLength(3);
    expect(st[0]).toBe(0);
    expect(st[1]).toBeCloseTo(336, 6);
    expect(st[2]).toBe(760);
    expect(firstStop(800, [0.5, 0.92])).toBeCloseTo(336, 6);
    expect(firstStop(800, null)).toBe(0);
  });
  it("settles on the nearest stop, projecting the finger's speed", () => {
    const stops = [0, 336, 760];
    expect(sheetSettle(20, 0, stops)).toEqual({ stop: 0, closes: false });
    expect(sheetSettle(300, 0, stops).stop).toBe(336);
    expect(sheetSettle(150, 1.2, stops).stop).toBe(336);
    expect(sheetSettle(420, 0.2, stops).stop).toBe(336);
  });
  it("a clear flick down from the lowest detent closes", () => {
    const stops = [0, 336, 760];
    expect(sheetSettle(340, 1.2, stops)).toEqual({ stop: 760, closes: true });
    expect(sheetSettle(340, 0.3, stops).closes).toBe(false);
    expect(sheetSettle(10, 0, [0, 524])).toEqual({ stop: 0, closes: false });
    expect(sheetSettle(400, 0, [0, 524]).closes).toBe(true);
  });
  it("the footer rides up with the visible part, to the lowest detent", () => {
    expect(footerPin(100, 800, [0.5, 0.92])).toBe(100);
    expect(footerPin(500, 800, [0.5, 0.92])).toBeCloseTo(336, 6);
    expect(footerPin(100, 800, null)).toBe(0);
    expect(footerPin(100, 800, [0.9])).toBe(0);
  });
  it("morph: the sheet's own box at k = 1, the rect at k = 0", () => {
    const r = { x: 100, y: 700, w: 190, h: 56, r: 28 };
    expect(morphClip(1, r, 600, 844, 390)).toBe(
      "inset(0.0px 0.0px 0.0px 0.0px round 34.0px 34.0px 0.0px 0.0px)"
    );
    expect(morphClip(0, r, 600, 844, 390)).toBe(
      "inset(456.0px 100.0px 88.0px 100.0px round 28.0px 28.0px 28.0px 28.0px)"
    );
    expect(morphClip(5, r, 600, 844, 390)).toBe(
      morphClip(1.06, r, 600, 844, 390)
    );
  });
});

describe("pull-down", () => {
  it("1:1 to its height, then a rubber band", () => {
    expect(pullOffset(-10, 220)).toBe(0);
    expect(pullOffset(100, 220)).toBe(100);
    expect(pullOffset(400, 220)).toBeGreaterThan(220);
    expect(pullOffset(400, 220)).toBeLessThan(290);
  });
  it("opens past the arm distance or on a flick; an open plate shuts when pushed up", () => {
    expect(pullSettle(false, PULL_ARM, 0, 220)).toBe(true);
    expect(pullSettle(false, PULL_ARM - 1, 0, 220)).toBe(false);
    expect(pullSettle(false, 50, 0.6, 220)).toBe(true);
    expect(pullSettle(false, 20, 0.6, 220)).toBe(false);
    expect(pullSettle(true, 220, 0, 220)).toBe(true);
    expect(pullSettle(true, 100, 0, 220)).toBe(false);
    expect(pullSettle(true, 215, -0.6, 220)).toBe(false);
  });
});

describe("hold", () => {
  it("is cancelled once the finger travels", () => {
    expect(holdMoved(HOLD_SLOP, 0)).toBe(false);
    expect(holdMoved(6, 6)).toBe(true);
  });
});
