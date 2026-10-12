/* Copied from the v2 wordmark with axis.ts: v3 must not import src/components/needt/**, which the contract step deletes. */

/* The maths the wordmark is made of, proved without a DOM: the clamps at
 * both sizes, that breathe's per-letter phase offset really is 260ms, that
 * pulse runs opposite to breathe, and that busy resolves to exactly 55. */
import {
  EW_BREATHE,
  EW_BUSY_CEILING,
  EW_FULL_SIZE,
  EW_MAX,
  EW_MIN_SIZE,
  EW_PULSE,
  EW_RADIUS,
  EW_SPRING,
  type SpringState,
  axisRangeForSize,
  breatheAt,
  composeAxisValue,
  developInAt,
  ewClamp,
  ewEaseOutCubic,
  ewEaseOutExpo,
  ewLerp,
  ewSmoothstep,
  liftFor,
  pulseAt,
  springSettled,
  springStep,
  torchTargetAt,
} from "../axis";

describe("the shape helpers", () => {
  it("clamp holds a value inside its bounds and passes through otherwise", () => {
    expect(ewClamp(5, 0, 10)).toBe(5);
    expect(ewClamp(-5, 0, 10)).toBe(0);
    expect(ewClamp(15, 0, 10)).toBe(10);
  });

  it("lerp is exact at both ends and the midpoint", () => {
    expect(ewLerp(0, 55, 0)).toBe(0);
    expect(ewLerp(0, 55, 1)).toBe(55);
    expect(ewLerp(0, 100, 0.5)).toBe(50);
  });

  it("smoothstep is 0 and 1 at the ends and symmetric about the midpoint", () => {
    expect(ewSmoothstep(0)).toBe(0);
    expect(ewSmoothstep(1)).toBe(1);
    expect(ewSmoothstep(0.5)).toBeCloseTo(0.5, 5);
  });

  it("easeOutCubic and easeOutExpo both land exactly on 0 and 1", () => {
    expect(ewEaseOutCubic(0)).toBe(0);
    expect(ewEaseOutCubic(1)).toBe(1);
    expect(ewEaseOutExpo(0)).toBe(0);
    expect(ewEaseOutExpo(1)).toBe(1);
  });
});

describe("develop-in", () => {
  it("starts at the given floor and eases to 0 over 620ms", () => {
    expect(developInAt(0, 0, -100)).toBe(-100);
    expect(developInAt(620, 0, -100)).toBe(0);
    expect(developInAt(310, 0, -100)).toBeLessThan(0);
    expect(developInAt(310, 0, -100)).toBeGreaterThan(-100);
  });

  it("holds a letter at its resting floor during its own stagger delay", () => {
    // Letter 1 waits 85ms before its own animation begins; at t=0 it must
    // read as still at the floor, not partway through letter 0's curve.
    expect(developInAt(0, 1, -100)).toBe(-100);
    expect(developInAt(84, 1, -100)).toBe(-100);
    expect(developInAt(85, 1, -100)).toBe(-100);
  });

  it("respects the rail's shallower floor", () => {
    expect(developInAt(0, 0, -40)).toBe(-40);
    expect(developInAt(620, 0, -40)).toBe(0);
  });
});

describe("breathe", () => {
  it("starts and returns to 0 at the top and bottom of its 5200ms cycle", () => {
    expect(breatheAt(0, 0)).toBeCloseTo(0, 5);
    expect(breatheAt(EW_BREATHE.cycle, 0)).toBeCloseTo(0, 1);
  });

  it("reaches full depth at the middle of the cycle and never goes positive", () => {
    const mid = breatheAt(EW_BREATHE.cycle / 2, 0);
    expect(mid).toBeCloseTo(EW_BREATHE.depth, 1);
    for (let ms = 0; ms <= EW_BREATHE.cycle; ms += 137) {
      expect(breatheAt(ms, 0)).toBeLessThanOrEqual(0);
    }
  });

  it("offsets each later letter by exactly 260ms of phase", () => {
    expect(EW_BREATHE.offset).toBe(260);
    // Letter `index`'s value at time t is letter 0's value at t - index*260 —
    // that IS the travelling wave, so assert it directly rather than by eye.
    for (const t of [0, 500, 1300, 2600, 4000, 5100]) {
      expect(breatheAt(t, 1)).toBeCloseTo(
        breatheAt(t - EW_BREATHE.offset, 0),
        5
      );
      expect(breatheAt(t, 3)).toBeCloseTo(
        breatheAt(t - 3 * EW_BREATHE.offset, 0),
        5
      );
    }
  });

  it("is a travelling wave, not a synchronised throb: two letters disagree mid-cycle", () => {
    const a = breatheAt(650, 0);
    const b = breatheAt(650, 1);
    expect(a).not.toBeCloseTo(b, 1);
  });
});

describe("pulse", () => {
  it("is silent before it starts and after it ends", () => {
    expect(pulseAt(0, 0)).toBe(0);
    expect(pulseAt(-10, 0)).toBe(0);
    expect(pulseAt(EW_PULSE.dur, 0)).toBe(0);
    expect(pulseAt(EW_PULSE.dur + 50, 0)).toBe(0);
  });

  it("peaks at +70, at 35% of its 1300ms duration", () => {
    expect(EW_PULSE.peak).toBe(70);
    expect(EW_PULSE.at).toBe(0.35);
    const peakAt = EW_PULSE.dur * EW_PULSE.at;
    expect(pulseAt(peakAt, 0)).toBeCloseTo(70, 0);
  });

  it("staggers 80ms per letter, same direction as develop-in's stagger idea", () => {
    expect(EW_PULSE.stagger).toBe(80);
    const peakAt = EW_PULSE.dur * EW_PULSE.at;
    // Letter 1 is 80ms behind letter 0 throughout: still rising at the
    // moment letter 0 peaks, and it reaches its own peak 80ms later.
    expect(pulseAt(peakAt, 1)).toBeLessThan(pulseAt(peakAt, 0));
    expect(pulseAt(peakAt + EW_PULSE.stagger, 1)).toBeCloseTo(70, 0);
  });

  it("runs opposite to breathe: pulse is never negative, breathe is never positive", () => {
    for (let ms = 0; ms <= EW_PULSE.dur; ms += 47) {
      expect(pulseAt(ms, 0)).toBeGreaterThanOrEqual(0);
    }
    for (let ms = 0; ms <= EW_BREATHE.cycle; ms += 91) {
      expect(breatheAt(ms, 0)).toBeLessThanOrEqual(0);
    }
  });
});

describe("torch target", () => {
  it("is the full ceiling directly under the cursor", () => {
    expect(torchTargetAt(0, EW_RADIUS, EW_MAX)).toBeCloseTo(EW_MAX, 5);
  });

  it("falls to 0 at and beyond the radius", () => {
    expect(torchTargetAt(EW_RADIUS, EW_RADIUS, EW_MAX)).toBeCloseTo(0, 5);
    expect(torchTargetAt(EW_RADIUS * 3, EW_RADIUS, EW_MAX)).toBe(0);
  });

  it("is a smoothstep falloff, not linear: it moves less near d=0 than near d=0.5", () => {
    const near0 =
      torchTargetAt(1, EW_RADIUS, EW_MAX) -
      torchTargetAt(21, EW_RADIUS, EW_MAX);
    const nearMid =
      torchTargetAt(EW_RADIUS * 0.4, EW_RADIUS, EW_MAX) -
      torchTargetAt(EW_RADIUS * 0.6, EW_RADIUS, EW_MAX);
    expect(Math.abs(nearMid)).toBeGreaterThan(Math.abs(near0));
  });

  it("scales with ceiling: at the rail (ceiling 0) the target is always 0", () => {
    expect(torchTargetAt(0, EW_RADIUS, 0)).toBe(0);
  });
});

describe("the spring", () => {
  it("moves toward its target and eventually settles there", () => {
    let s: SpringState = { v: 0, vel: 0, target: 55 };
    let steps = 0;
    while (!springSettled(s) && steps < 2000) {
      s = springStep(s, 16, EW_SPRING);
      steps += 1;
    }
    expect(springSettled(s)).toBe(true);
    expect(s.v).toBeCloseTo(55, 0);
    // The lag is the point: it must not snap there in a single 16ms frame.
    expect(steps).toBeGreaterThan(3);
  });

  it("does nothing when it is already at rest on its target", () => {
    const s: SpringState = { v: 20, vel: 0, target: 20 };
    expect(springSettled(s)).toBe(true);
    const next = springStep(s, 16, EW_SPRING);
    expect(next.v).toBeCloseTo(20, 5);
    expect(next.vel).toBeCloseTo(0, 5);
  });
});

describe("size clamps", () => {
  it("the rail (28px) is restricted to −40…0, disabling positive room", () => {
    const rail = axisRangeForSize(EW_MIN_SIZE);
    expect(rail.floor).toBe(-40);
    expect(rail.roof).toBe(0);
    expect(rail.ceiling).toBe(0);
  });

  it("44px and above get the full ±100 range and ceiling 55", () => {
    const full = axisRangeForSize(EW_FULL_SIZE);
    expect(full.floor).toBe(-100);
    expect(full.roof).toBe(100);
    expect(full.ceiling).toBe(EW_MAX);
    expect(axisRangeForSize(112).ceiling).toBe(55);
    expect(axisRangeForSize(64).ceiling).toBe(55);
  });

  it("one px below the full threshold still gets the rail's shallower range", () => {
    const justUnder = axisRangeForSize(EW_FULL_SIZE - 1);
    expect(justUnder.floor).toBe(-40);
    expect(justUnder.ceiling).toBe(0);
  });
});

describe("composing one value per letter per frame", () => {
  it("busy resolves to exactly 55, overriding breathe, pulse and torch", () => {
    const value = composeAxisValue({
      breathe: -80,
      pulse: 60,
      torch: 40,
      floor: -100,
      roof: 100,
      busy: EW_BUSY_CEILING,
    });
    expect(value).toBe(55);
  });

  it("a busy value at or below the settle epsilon does not override", () => {
    const value = composeAxisValue({
      breathe: -10,
      pulse: 0,
      torch: 0,
      floor: -100,
      roof: 100,
      busy: 0,
    });
    expect(value).toBe(-10);
  });

  it("a develop value overrides everything, busy included", () => {
    const value = composeAxisValue({
      breathe: -80,
      pulse: 60,
      torch: 40,
      floor: -100,
      roof: 100,
      busy: 55,
      developValue: -63.2,
    });
    expect(value).toBe(-63.2);
  });

  it("stays inside the composed range even for out-of-range inputs", () => {
    const high = composeAxisValue({
      breathe: 0,
      pulse: 1000,
      torch: 1000,
      floor: -100,
      roof: 100,
    });
    expect(high).toBe(100);
    const low = composeAxisValue({
      breathe: -1000,
      pulse: 0,
      torch: 0,
      floor: -100,
      roof: 100,
    });
    expect(low).toBe(-100);
  });

  it("clamps to the rail's shallower range when that is what is passed in", () => {
    // Sum is -30, which already sits inside -40..0, so it passes through
    // unclamped; a sum that overshoots the roof is what gets pulled back.
    expect(
      composeAxisValue({
        breathe: -80,
        pulse: 30,
        torch: 20,
        floor: -40,
        roof: 0,
      })
    ).toBe(-30);
    expect(
      composeAxisValue({
        breathe: -10,
        pulse: 30,
        torch: 20,
        floor: -40,
        roof: 0,
      })
    ).toBe(0);
  });

  it("a realistic full-range frame sums breathe, pulse and torch before clamping", () => {
    const value = composeAxisValue({
      breathe: -30,
      pulse: 12,
      torch: 8,
      floor: -100,
      roof: 100,
    });
    expect(value).toBeCloseTo(-10, 5);
  });
});

describe("the sculpt lift", () => {
  it("is 1 at rest, above 1 when inked, below 1 when burned", () => {
    expect(liftFor(0)).toBe(1);
    expect(liftFor(-100)).toBeCloseTo(1.351, 3);
    expect(liftFor(55)).toBeCloseTo(0.807, 3);
  });
});
