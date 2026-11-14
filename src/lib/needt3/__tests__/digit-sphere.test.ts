import {
  SPHERE_ALPHAS_FULL,
  SPHERE_ALPHAS_QUIET,
  depthAlpha,
  depthStep,
  fibonacciSphere,
  glyphRange,
  glyphSize,
  projectPoint,
  sizeBucket,
  sphereCount,
  sphereDigits,
} from "../digit-sphere";

// PORT.md section 0 rule 1: text 100/85/70/55/40/25, fills 2/3/4/6/8/12.
const LADDER = [
  0.02, 0.03, 0.04, 0.06, 0.08, 0.12, 0.25, 0.4, 0.55, 0.7, 0.85, 1,
];

describe("fibonacciSphere", () => {
  it("puts every point on the unit sphere", () => {
    const p = fibonacciSphere(400);
    for (let i = 0; i < 400; i++) {
      const len = Math.hypot(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
      expect(len).toBeCloseTo(1, 5);
    }
  });

  it("spreads evenly: balanced about the centre, y spans the poles", () => {
    const n = 400;
    const p = fibonacciSphere(n);
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (let i = 0; i < n; i++) {
      sx += p[i * 3];
      sy += p[i * 3 + 1];
      sz += p[i * 3 + 2];
    }
    expect(Math.abs(sx / n)).toBeLessThan(0.02);
    expect(Math.abs(sy / n)).toBeLessThan(0.001);
    expect(Math.abs(sz / n)).toBeLessThan(0.02);
    expect(p[1]).toBeGreaterThan(0.99);
    expect(p[(n - 1) * 3 + 1]).toBeLessThan(-0.99);
  });
});

describe("sphereDigits / sphereCount", () => {
  it("is deterministic and only 0 to 9, all ten used", () => {
    const a = sphereDigits(300);
    expect(Array.from(a)).toEqual(Array.from(sphereDigits(300)));
    expect(new Set(a).size).toBe(10);
    expect(Math.max(...Array.from(a))).toBeLessThanOrEqual(9);
  });

  it("draws fewer digits on small screens, within 300 to 500", () => {
    expect(sphereCount(390)).toBe(300);
    expect(sphereCount(900)).toBe(400);
    expect(sphereCount(1440)).toBe(480);
  });
});

describe("projectPoint", () => {
  it("keeps the near pole near and scaled up, the far one small", () => {
    const near = projectPoint(0, 0, 1, 0, 0);
    const far = projectPoint(0, 0, -1, 0, 0);
    expect(near.z).toBeCloseTo(1);
    expect(near.scale).toBeCloseTo(1.5);
    expect(far.z).toBeCloseTo(-1);
    expect(far.scale).toBeCloseTo(0.75);
  });

  it("a half yaw turn sends the +x point to x -1, a quarter to the far side", () => {
    const quarter = projectPoint(1, 0, 0, Math.PI / 2, 0);
    expect(quarter.z).toBeCloseTo(-1);
    expect(quarter.x).toBeCloseTo(0);
  });

  it("one full yaw turn returns to the start", () => {
    const z = Math.sqrt(1 - 0.34);
    const a = projectPoint(0.3, 0.5, z, 0, 0.28);
    const b = projectPoint(0.3, 0.5, z, Math.PI * 2, 0.28);
    expect(b.x).toBeCloseTo(a.x, 6);
    expect(b.y).toBeCloseTo(a.y, 6);
    expect(b.z).toBeCloseTo(a.z, 6);
  });

  it("writes into the object it is given (no per-frame allocation)", () => {
    const out = { x: 0, y: 0, z: 0, scale: 1 };
    expect(projectPoint(0, 0, 1, 0, 0, out)).toBe(out);
  });
});

describe("depth to alpha and size", () => {
  it("steps rise monotonically with depth and stay in range", () => {
    let prev = -1;
    for (let z = -1; z <= 1; z += 0.01) {
      const s = depthStep(z, 6);
      expect(s).toBeGreaterThanOrEqual(prev);
      expect(s).toBeLessThanOrEqual(5);
      prev = s;
    }
    expect(depthStep(-1, 6)).toBe(0);
    expect(depthStep(1, 6)).toBe(5);
    expect(depthStep(9, 6)).toBe(5);
  });

  it("far is the faintest rung, near the strongest", () => {
    expect(depthAlpha(-1, SPHERE_ALPHAS_FULL)).toBe(0.12);
    expect(depthAlpha(1, SPHERE_ALPHAS_FULL)).toBe(0.85);
  });

  it("every alpha is a rung of the PORT ladder", () => {
    for (const a of [...SPHERE_ALPHAS_FULL, ...SPHERE_ALPHAS_QUIET]) {
      expect(LADDER).toContain(a);
    }
  });

  it("the quiet ladder is never stronger than the full one", () => {
    SPHERE_ALPHAS_QUIET.forEach((a, i) =>
      expect(a).toBeLessThanOrEqual(SPHERE_ALPHAS_FULL[i])
    );
  });

  it("near glyphs are over 3x far ones and buckets cover the range", () => {
    const [lo, hi] = glyphRange(400);
    expect(hi / lo).toBeGreaterThan(3);
    expect(glyphSize(1.5, 400)).toBeCloseTo(hi);
    expect(sizeBucket(lo, lo, hi, 8)).toBe(0);
    expect(sizeBucket(hi, lo, hi, 8)).toBe(7);
    expect(sizeBucket((lo + hi) / 2, lo, hi, 8)).toBeGreaterThan(0);
  });
});
