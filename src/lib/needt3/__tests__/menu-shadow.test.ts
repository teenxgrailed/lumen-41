import { nvaGeom, nvaShape } from "../menu-a";
import {
  NVA_SH_R,
  nvaBoxShadow,
  nvaChainShadow,
  nvaParseShadow,
  nvaPhi,
  nvaSetWeight,
  nvaShadowEdges,
  nvaShadowPieces,
  nvaShadowPlacement,
} from "../menu-shadow";

// themes.css --nva-shadow, light and dark
const LIGHT =
  "drop-shadow(0 18px 28px rgba(18, 16, 40, 0.28)) drop-shadow(0 3px 6px rgba(18, 16, 40, 0.16))";
const DARK =
  "drop-shadow(0 22px 34px rgba(0, 0, 0, 0.6)) drop-shadow(0 0 1px rgba(255, 255, 255, 0.35))";

describe("nvaParseShadow", () => {
  it("reads each drop-shadow's offsets, blur and colour", () => {
    const [a, b] = nvaParseShadow(DARK);
    expect(a).toMatchObject({ x: 0, y: 22, sd: 34, rgb: "0,0,0", alpha: 0.6 });
    expect(b).toMatchObject({
      x: 0,
      y: 0,
      sd: 1,
      rgb: "255,255,255",
      alpha: 0.35,
    });
  });

  it("reads hex colours and falls back for none", () => {
    const [h] = nvaParseShadow("drop-shadow(1px 2px 3px #ff000080)");
    expect(h.rgb).toBe("255,0,0");
    expect(h.alpha).toBeCloseTo(128 / 255, 6);
    expect(nvaParseShadow("")).toEqual([]);
    expect(nvaParseShadow(null)).toEqual([]);
    expect(nvaParseShadow("none")).toEqual([]);
  });
});

describe("nvaChainShadow / nvaBoxShadow", () => {
  it("each drop-shadow also shadows the ones before it", () => {
    const flat = nvaChainShadow(nvaParseShadow(DARK));
    // big shadow, rim, and the rim's shadow of the big one
    expect(flat).toHaveLength(3);
    expect(flat[0]).toMatchObject({ y: 22, sd: 34 });
    expect(flat[2].alpha).toBeCloseTo(0.6 * 0.35, 6);
    expect(flat[2].sd).toBeCloseTo(Math.sqrt(34 * 34 + 1), 6);
  });

  it("drops what cannot be seen", () => {
    expect(
      nvaChainShadow(nvaParseShadow("drop-shadow(0 0 4px rgba(0,0,0,0.001))"))
    ).toEqual([]);
  });

  it("box-shadow doubles the blur (a drop-shadow's is a standard deviation)", () => {
    const css = nvaBoxShadow(nvaChainShadow(nvaParseShadow(LIGHT)));
    expect(css.startsWith("0px 18px 56.00px rgba(18,16,40,0.2800)")).toBe(true);
    expect(nvaBoxShadow([])).toBe("none");
  });
});

describe("nvaPhi / nvaShadowEdges", () => {
  it("is the normal CDF", () => {
    expect(nvaPhi(0)).toBeCloseTo(0.5, 6);
    expect(nvaPhi(1.96)).toBeCloseTo(0.975, 3);
    expect(nvaPhi(-1.96)).toBeCloseTo(0.025, 3);
  });

  it("draws each straight edge as stacked gradients, one per shadow", () => {
    const flat = nvaChainShadow(nvaParseShadow(LIGHT));
    const ed = nvaShadowEdges(flat);
    expect(ed.t.startsWith("linear-gradient(to top,")).toBe(true);
    expect(ed.b.startsWith("linear-gradient(to bottom,")).toBe(true);
    expect(ed.l.startsWith("linear-gradient(to left,")).toBe(true);
    expect(ed.r.startsWith("linear-gradient(to right,")).toBe(true);
    expect(ed.b.match(/linear-gradient\(/g)).toHaveLength(flat.length);
    // the shadow sits lower than the shape: more of it below than above
    const alphaAt0 = (css: string) =>
      parseFloat(css.match(/rgba\([^)]*,([\d.]+)\) 0\.00px/)?.[1] ?? "0");
    expect(alphaAt0(ed.b)).toBeGreaterThan(alphaAt0(ed.t));
  });

  it("nothing outputs 'none' for an empty list", () => {
    expect(nvaShadowEdges([])).toEqual({
      t: "none",
      b: "none",
      l: "none",
      r: "none",
    });
  });
});

describe("nvaShadowPieces", () => {
  it("is four corners then four edges", () => {
    const pcs = nvaShadowPieces(32);
    expect(pcs).toHaveLength(8);
    expect(pcs.slice(0, 4).every((p) => p.edge === null)).toBe(true);
    expect(pcs.slice(4).map((p) => p.edge)).toEqual(["t", "b", "l", "r"]);
    expect(pcs[0].w).toBe(100 + 32);
  });
});

describe("nvaSetWeight", () => {
  it("a set is full at its own radius and gone at its neighbours'", () => {
    expect(nvaSetWeight(1, 32)).toBe(1);
    expect(nvaSetWeight(0, 32)).toBe(0);
    expect(nvaSetWeight(2, 32)).toBe(0);
    expect(nvaSetWeight(0, 11)).toBe(1);
    expect(nvaSetWeight(2, 38)).toBe(1);
  });

  it("two neighbours cross-fade between their radii", () => {
    expect(nvaSetWeight(1, 35)).toBeCloseTo(0.5, 6);
    expect(nvaSetWeight(2, 35)).toBeCloseTo(0.5, 6);
    expect(nvaSetWeight(0, 21.5)).toBeCloseTo(0.5, 6);
  });

  it("the end sets stay full beyond their ends", () => {
    expect(nvaSetWeight(0, 5)).toBe(1);
    expect(nvaSetWeight(2, 50)).toBe(1);
  });
});

describe("nvaShadowPlacement", () => {
  const g = nvaGeom(390, 844);

  it("at the pill only the 32 set shows, and it is moved, never resized", () => {
    const sets = nvaShadowPlacement(nvaShape(g, 0, 0));
    expect(sets).toHaveLength(NVA_SH_R.length);
    expect(sets.map((s) => s.hidden)).toEqual([true, false, true]);
    const pcs = sets[1].pieces;
    expect(pcs).toHaveLength(8);
    // top-left corner: translate to the shape's corner minus the shadow room
    expect(pcs[0].transform).toBe(
      "translate(-33.00px,594.00px) scale(1.0000,1.0000)"
    );
    expect(pcs[0].opacity).toBe("1.000");
    // the pill is as tall as its two corners: its side edges have no length
    expect(pcs.map((p) => p.hidden)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      true,
    ]);
  });

  it("only transform and opacity are ever produced", () => {
    for (const set of nvaShadowPlacement(nvaShape(g, 0.6, 0.2)))
      for (const pc of set.pieces) {
        expect(pc.transform).toMatch(/^translate\(.+\) scale\(.+\)$/);
        expect(pc.opacity).toMatch(/^[\d.]+$/);
      }
  });

  it("a shape narrower than its set scales the set down whole", () => {
    // the handle: 64 x 22, radius 11
    const handle = nvaShape(g, -1, 0);
    const [first] = nvaShadowPlacement(handle);
    expect(first.hidden).toBe(false);
    const sx = parseFloat(
      first.pieces[0].transform.match(/scale\(([\d.]+)/)?.[1] ?? "0"
    );
    expect(sx).toBeLessThanOrEqual(1);
    // a shape too short for the 32 set shrinks it
    const [, mid] = nvaShadowPlacement({ x: 0, y: 0, w: 64, h: 22, r: 32 });
    const k = parseFloat(
      mid.pieces[0].transform.match(/scale\(([\d.]+)/)?.[1] ?? "0"
    );
    expect(k).toBeCloseTo(22 / 64, 3);
  });

  it("hides an edge piece that would have no length", () => {
    const [, mid] = nvaShadowPlacement({ x: 0, y: 0, w: 64, h: 64, r: 32 });
    // top and bottom edges have ex = 64 - 64 = 0
    expect(mid.pieces[4].hidden).toBe(true);
    expect(mid.pieces[5].hidden).toBe(true);
  });
});
