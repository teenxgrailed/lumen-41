import {
  NVA_ADD,
  nvaClipPath,
  nvaDragKind,
  nvaDragSprings,
  nvaFogK,
  nvaFrame,
  nvaGeom,
  nvaHeadK,
  nvaHint,
  nvaPillSlot,
  nvaRelease,
  nvaRowK,
  nvaRubber,
  nvaShape,
  nvaSpringsToTrack,
  nvaStopOf,
  nvaTall,
  nvaTargets,
  nvaTileSlot,
  nvaTrackToSprings,
  nvaTransform,
} from "../menu-a";

// A 390 x 844 phone: menu 370 wide, 776 tall at full, 478 at the card stop.
const g = nvaGeom(390, 844);

describe("nvaGeom", () => {
  it("lays the menu out in the frame's box", () => {
    expect(g.M).toBe(10);
    expect(g.W).toBe(370);
    expect(g.fullH).toBe(776);
    expect(g.cardH).toBe(478);
    expect(g.range).toBe(414);
    expect(nvaTall(g)).toBe(298);
    expect(g.tileW).toBeCloseTo((370 - 28 - 16) / 3, 6);
  });

  it("never lets the card be taller than the frame allows", () => {
    const short = nvaGeom(390, 500);
    expect(short.fullH).toBe(432);
    expect(short.cardH).toBe(432);
  });
});

describe("nvaShape", () => {
  it("the pill: 236 x 64, centred, radius is half its height", () => {
    const s = nvaShape(g, 0, 0);
    expect(s).toEqual({ x: 67, y: 694, w: 236, h: 64, r: 32 });
  });

  it("the card: the full width, 478 tall, sitting on the bottom margin", () => {
    const s = nvaShape(g, 1, 0);
    expect(s.x).toBe(0);
    expect(s.w).toBe(370);
    expect(s.h).toBe(478);
    expect(s.y).toBe(298);
    expect(s.r).toBe(38);
  });

  it("full: nearly the whole screen, a little less round", () => {
    const s = nvaShape(g, 1, 1);
    expect(s.h).toBe(776);
    expect(s.y).toBe(0);
    expect(s.r).toBe(32);
  });

  it("the handle: 64 x 22 tucked under the pill's place", () => {
    const s = nvaShape(g, -1, 0);
    expect(s.w).toBe(64);
    expect(s.h).toBe(22);
    expect(s.r).toBe(11);
    expect(s.y).toBe(746);
  });

  it("the width leads and the height follows on the way to the card", () => {
    const half = nvaShape(g, 0.5, 0);
    const wFrac = (half.w - 236) / (370 - 236);
    const hFrac = (half.h - 64) / (478 - 64);
    expect(wFrac).toBeGreaterThan(hFrac);
  });

  it("past the card the shape stretches taller (the rubber band)", () => {
    expect(nvaShape(g, 1.1, 1).h).toBeCloseTo(776 + 0.1 * 140, 6);
  });
});

describe("nvaClipPath", () => {
  it("is an inset with the radius, the only thing that resizes", () => {
    expect(nvaClipPath(g, nvaShape(g, 0, 0))).toBe(
      "inset(694.00px 67.00px 18.00px 67.00px round 32.00px)"
    );
    expect(nvaClipPath(g, nvaShape(g, 1, 1))).toBe(
      "inset(0.00px 0.00px 0.00px 0.00px round 32.00px)"
    );
  });
});

describe("slots", () => {
  it("pill slots are 54 apart, tile slots a tile and a gap", () => {
    expect(nvaPillSlot(g, 1).x - nvaPillSlot(g, 0).x).toBe(54);
    expect(nvaTileSlot(g, 1).x - nvaTileSlot(g, 0).x).toBeCloseTo(
      g.tileW + 8,
      6
    );
    expect(nvaTileSlot(g, 0).dy).toBe(54);
  });

  it("transform strings keep fixed digits", () => {
    expect(nvaTransform(1.234, 5)).toBe("translate(1.23px,5.00px)");
    expect(nvaTransform(0, 0, 1.36)).toBe(
      "translate(0.00px,0.00px) scale(1.360)"
    );
  });
});

describe("the track", () => {
  it("round-trips every stop and the bands either side", () => {
    for (const px of [-120, -50, 0, 100, 414, 500, 712]) {
      const sp = nvaTrackToSprings(g, px);
      expect(nvaSpringsToTrack(g, sp.p, sp.t)).toBeCloseTo(px, 4);
    }
  });

  it("the first range px open the card, the next grow it to full", () => {
    expect(nvaTrackToSprings(g, 207)).toEqual({ p: 0.5, t: 0 });
    expect(nvaTrackToSprings(g, 414 + 149)).toEqual({ p: 1, t: 0.5 });
    expect(nvaTrackToSprings(g, 414 + 298)).toEqual({ p: 1, t: 1 });
  });

  it("past full a rubber band stretches by at most 24 px of travel", () => {
    const sp = nvaTrackToSprings(g, 414 + 298 + 10_000);
    expect(sp.t).toBe(1);
    expect(sp.p).toBeGreaterThan(1);
    expect(sp.p).toBeLessThan(1 + 24 / 140);
    expect(nvaRubber(0, 24)).toBe(0);
    expect(nvaRubber(100, 24)).toBeLessThan(24);
  });

  it("below the pill the band is stiff: ~150 px of pull reaches the handle", () => {
    expect(nvaTrackToSprings(g, -150).p).toBeCloseTo(
      -1.22 * (1 - Math.exp(-1)),
      6
    );
    expect(nvaTrackToSprings(g, -1000).p).toBeGreaterThan(-1.23);
  });

  it("stop counts: -1 handle, 0 pill, 1 card, 2 full", () => {
    expect(nvaStopOf(g, 0)).toBe(0);
    expect(nvaStopOf(g, 414)).toBe(1);
    expect(nvaStopOf(g, 414 + 298)).toBe(2);
  });
});

describe("nvaDragSprings", () => {
  it("from the pill, pulling up moves the springs by the finger", () => {
    // finger 207 px up (fy = -207) from the pill
    expect(nvaDragSprings(g, "pill", 0, -207)).toEqual({ p: 0.5, t: 0 });
  });

  it("from the handle, 90 px per unit bring it out to the pill", () => {
    expect(nvaDragSprings(g, "hidden", 0, 0).p).toBe(-1);
    expect(nvaDragSprings(g, "hidden", 0, -90).p).toBe(0);
    expect(nvaDragSprings(g, "hidden", 0, -45).p).toBe(-0.5);
  });

  it("from the handle, pushing further down stops at -1.15", () => {
    expect(nvaDragSprings(g, "hidden", 0, 100).p).toBe(-1.15);
  });
});

describe("nvaRelease", () => {
  const at = (
    from: Parameters<typeof nvaRelease>[1]["from"],
    px: number,
    vy = 0
  ) => {
    const sp = nvaTrackToSprings(g, px);
    return nvaRelease(g, { from, p: sp.p, t: sp.t, vy });
  };

  it("a short pull from the pill opens the card; a tiny one stays", () => {
    expect(at("pill", 207).mode).toBe("card");
    expect(at("pill", 60).mode).toBe("pill");
    expect(at("pill", 0).mode).toBe("pill");
  });

  it("a hard flick up skips the card and lands on full", () => {
    // 3 px/ms up: the projection reaches past 1.5 stops
    expect(at("pill", 207, -3).mode).toBe("full");
  });

  it("a card closes past 40 % of the way back, and stays otherwise", () => {
    expect(at("card", 414 - 100).mode).toBe("card");
    expect(at("card", 100).mode).toBe("pill");
  });

  it("a card grows to full when released high enough or flicked", () => {
    expect(at("card", 414 + 280).mode).toBe("full");
    expect(at("card", 414, -2).mode).toBe("full");
  });

  it("full falls back to the card on a pull down", () => {
    expect(at("full", 414 + 298).mode).toBe("full");
    expect(at("full", 414 + 100).mode).toBe("card");
  });

  it("the pill tucks away only on a deliberate pull below it", () => {
    expect(at("pill", -30).mode).toBe("pill");
    expect(at("pill", -150).mode).toBe("hidden");
  });

  it("the handle needs a pull up to come back", () => {
    const sp = { p: -0.05, t: 0 };
    expect(
      nvaRelease(g, { from: "hidden", p: sp.p, t: sp.t, vy: 0 }).mode
    ).toBe("pill");
    expect(nvaRelease(g, { from: "hidden", p: -1, t: 0, vy: 0 }).mode).toBe(
      "hidden"
    );
  });

  it("hands the finger's speed to the springs, clamped", () => {
    const r = at("pill", 207, -3);
    expect(r.vp).toBeGreaterThanOrEqual(-9);
    expect(r.vp).toBeLessThanOrEqual(9);
    const huge = nvaRelease(g, { from: "pill", p: 0.5, t: 0, vy: -999 });
    expect(huge.vp).toBe(9);
  });

  it("targets of each stop", () => {
    expect(nvaTargets("hidden")).toEqual({ p: -1, t: 0 });
    expect(nvaTargets("pill")).toEqual({ p: 0, t: 0 });
    expect(nvaTargets("card")).toEqual({ p: 1, t: 0 });
    expect(nvaTargets("full")).toEqual({ p: 1, t: 1 });
  });
});

describe("hint and drag kind", () => {
  it("the hint says 'more' just below the pill and 'tuck' past half way", () => {
    expect(nvaHint(0)).toBeNull();
    expect(nvaHint(-0.04)).toBeNull();
    expect(nvaHint(-0.2)).toBe("more");
    expect(nvaHint(-0.7)).toBe("tuck");
  });

  it("down scrolls the list back to its top first, up grows the card first", () => {
    const base = { canScroll: true, dy: 10, scrollTop: 40, t: 0 };
    expect(nvaDragKind(base)).toBe("scroll");
    expect(nvaDragKind({ ...base, scrollTop: 0 })).toBe("drag");
    expect(nvaDragKind({ ...base, dy: -10, t: 0.5 })).toBe("drag");
    expect(nvaDragKind({ ...base, dy: -10, t: 1 })).toBe("scroll");
    expect(nvaDragKind({ ...base, canScroll: false })).toBe("drag");
  });
});

describe("nvaFrame", () => {
  const pill = { w: g.PW, h: g.PH };

  it("at the pill: icons in their slots, the glass is the pill, the plus is out", () => {
    const f = nvaFrame(g, 0, 0, pill);
    expect(f.icons).toHaveLength(3);
    expect(f.icons[0].x).toBeCloseTo(nvaPillSlot(g, 0).x - 26, 6);
    expect(f.icons[0].scale).toBe(1);
    expect(f.glass).toEqual({
      x: 10 + 67,
      y: 844 - 10 - 776 + 694,
      sx: 1,
      sy: 1,
      opacity: 1,
    });
    expect(f.add.opacity).toBe(1);
    expect(f.add.x).toBe(10 + 67 + 236 + 8);
    expect(f.add.y).toBe(844 - 10 - 776 + 694 + (64 - NVA_ADD) / 2);
    expect(f.tiles.opacity).toBe(0);
    expect(f.rowsVisible).toBe(false);
    expect(f.pillbits.opacity).toBe(1);
    expect(f.scrimOpacity).toBe(0);
  });

  it("at the card: tiles in, pill parts and glass out, scrim on", () => {
    const f = nvaFrame(g, 1, 0, pill);
    expect(f.tiles.opacity).toBe(1);
    expect(f.pillbits.opacity).toBe(0);
    expect(f.add.opacity).toBe(0);
    expect(f.glass.opacity).toBe(0);
    expect(f.rowsVisible).toBe(true);
    expect(f.icons[0].scale).toBeCloseTo(1.36, 6);
    expect(f.scrimOpacity).toBe(1);
    expect(f.visH).toBe(478);
  });

  it("at full the scrim darkens a little more and the list window is the full height", () => {
    const f = nvaFrame(g, 1, 1, pill);
    expect(f.scrimOpacity).toBe(1.25);
    expect(f.visH).toBe(776);
  });

  it("at the handle: the glass is sized to the handle and the handle shows", () => {
    const f = nvaFrame(g, -1, 0, { w: g.HW, h: g.HH });
    expect(f.handle.opacity).toBeCloseTo(1, 6);
    expect(f.glass.sx).toBe(1);
    expect(f.glass.sy).toBe(1);
    expect(f.icons[0].opacity).toBe(0);
    expect(f.dotsOpacity).toBe(0);
    expect(f.add.opacity).toBe(0);
  });

  it("while moving, every value stays in range", () => {
    for (const p of [-1.2, -0.6, -0.1, 0, 0.2, 0.5, 0.9, 1, 1.1]) {
      for (const t of [0, 0.5, 1]) {
        const f = nvaFrame(g, p, t, pill);
        for (const o of [
          f.tiles.opacity,
          f.pillbits.opacity,
          f.glass.opacity,
          f.add.opacity,
          f.handle.opacity,
          f.grabOpacity,
          f.dotsOpacity,
          ...f.icons.map((i) => i.opacity),
        ]) {
          expect(o).toBeGreaterThanOrEqual(0);
          expect(o).toBeLessThanOrEqual(1);
        }
        expect(f.shape.w).toBeGreaterThan(0);
        expect(f.shape.h).toBeGreaterThan(0);
      }
    }
  });
});

describe("staggers", () => {
  it("rows arrive one after another and are all in by the time the card is open", () => {
    expect(nvaRowK(1, 0)).toBe(1);
    expect(nvaRowK(1, 12)).toBe(1);
    expect(nvaRowK(0.5, 0)).toBeGreaterThan(nvaRowK(0.5, 3));
    expect(nvaRowK(0.3, 0)).toBe(0);
  });

  it("the fog shows only near the open card and only while there is more", () => {
    expect(nvaFogK(1, 200)).toBeCloseTo(1, 6);
    expect(nvaFogK(1, 0)).toBe(0);
    expect(nvaFogK(0.5, 200)).toBe(0);
    expect(nvaFogK(1, 30)).toBeCloseTo(0.5, 6);
  });

  it("the head's soft edge appears once the list is scrolled under the tiles", () => {
    expect(nvaHeadK(0, 1)).toBe(0);
    expect(nvaHeadK(12, 1)).toBe(0.5);
    expect(nvaHeadK(100, 0.4)).toBe(0.4);
  });
});
