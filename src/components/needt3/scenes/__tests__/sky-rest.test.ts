import {
  FULL_FRAME_MS,
  HOVER_FULL_FRAME_MS,
  HOVER_SMALL_FRAME_MS,
  REST_MS,
  RestMachine,
  SMALL_FRAME_MS,
  atRest,
  driftSpeed,
  easeDrift,
  framePeriod,
  mayAnimate,
} from "../sky-rest";

const running = {
  hidden: false,
  inView: true,
  reduced: false,
  covered: false,
  parked: false,
};

describe("when the sky may draw", () => {
  it("runs only when nothing parks it", () => {
    expect(mayAnimate(running)).toBe(true);
  });

  it.each([
    ["the tab is hidden", { hidden: true }],
    ["the canvas is off-screen", { inView: false }],
    ["reduced motion is on", { reduced: true }],
    ["an opaque layer covers it", { covered: true }],
    ["it is parked", { parked: true }],
  ])("stops when %s", (_name, patch) => {
    expect(mayAnimate({ ...running, ...patch })).toBe(false);
  });
});

describe("idle detector", () => {
  function setup() {
    let t = 0;
    const m = new RestMachine(() => t);
    const seen: boolean[] = [];
    m.subscribe((idle) => seen.push(idle));
    return {
      m,
      seen,
      advance: (ms: number) => {
        t += ms;
      },
    };
  }

  it("stays awake until 12 s without input", () => {
    const { m, advance, seen } = setup();
    advance(REST_MS - 1000);
    expect(m.check()).toBeGreaterThan(0);
    expect(m.idle).toBe(false);
    advance(1000);
    expect(m.check()).toBeNull();
    expect(m.idle).toBe(true);
    expect(seen).toEqual([true]);
  });

  it("input pushes the deadline back", () => {
    const { m, advance } = setup();
    advance(REST_MS - 100);
    m.touch();
    advance(REST_MS - 100);
    expect(m.check()).toBeGreaterThan(0);
    expect(m.idle).toBe(false);
  });

  it("wakes every sky on the first input after resting, once", () => {
    const { m, advance, seen } = setup();
    advance(REST_MS);
    m.check();
    m.touch();
    m.touch();
    expect(m.idle).toBe(false);
    expect(seen).toEqual([true, false]);
  });

  it("does not tell anyone twice that it is idle", () => {
    const { m, advance, seen } = setup();
    advance(REST_MS);
    m.check();
    m.check();
    expect(seen).toEqual([true]);
  });

  it("an unsubscribed sky hears nothing", () => {
    let t = 0;
    const m = new RestMachine(() => t);
    const heard: boolean[] = [];
    const off = m.subscribe((i) => heard.push(i));
    off();
    t += REST_MS;
    m.check();
    expect(heard).toEqual([]);
    expect(m.size).toBe(0);
  });
});

describe("drift while idle and on input", () => {
  it("eases to 0 over 1.5 s once idle", () => {
    let d = 1;
    for (let i = 0; i < 15; i++) d = easeDrift(d, 0.1, true);
    expect(d).toBeCloseTo(0, 5);
  });

  it("eases back up over 0.8 s on input", () => {
    let d = 0;
    for (let i = 0; i < 8; i++) d = easeDrift(d, 0.1, false);
    expect(d).toBeCloseTo(1, 5);
  });

  it("is smoothstepped, so the position never jumps", () => {
    expect(driftSpeed(0)).toBe(0);
    expect(driftSpeed(1)).toBe(1);
    expect(driftSpeed(0.5)).toBeCloseTo(0.5, 5);
    expect(driftSpeed(0.25)).toBeLessThan(0.25);
  });

  it("ignores a negative time step", () => {
    expect(easeDrift(0.5, -1, true)).toBe(0.5);
  });
});

describe("stopping at rest", () => {
  it("stops only when idle, fully eased out and settled", () => {
    expect(atRest({ idle: true, drift: 0, settled: true })).toBe(true);
    expect(atRest({ idle: false, drift: 0, settled: true })).toBe(false);
    expect(atRest({ idle: true, drift: 0.2, settled: true })).toBe(false);
    expect(atRest({ idle: true, drift: 0, settled: false })).toBe(false);
  });
});

describe("frame pacing", () => {
  it("20 fps on full skies, 24 on small ones", () => {
    expect(framePeriod({ big: true, hover: false })).toBe(FULL_FRAME_MS);
    expect(framePeriod({ big: false, hover: false })).toBe(SMALL_FRAME_MS);
  });

  it("speeds up under the pointer", () => {
    expect(framePeriod({ big: true, hover: true })).toBe(HOVER_FULL_FRAME_MS);
    expect(framePeriod({ big: false, hover: true })).toBe(HOVER_SMALL_FRAME_MS);
  });

  it("an accent sky may ask for fewer frames, never more", () => {
    expect(framePeriod({ big: false, hover: false, fps: 15 })).toBe(67);
    expect(framePeriod({ big: false, hover: false, fps: 60 })).toBe(
      SMALL_FRAME_MS
    );
  });
});
