import {
  type DragFrame,
  type Token,
  candidates,
  isOut,
  lean,
  nearest,
  scrollSpeed,
  shiftOf,
} from "../geometry";

const H = 60;

/** A list of two sections: Today (a, b, c) and Tomorrow (d, e), 20 px heads, 60 px rows. */
function list(opts: { foldedTomorrow?: boolean; today?: Token["mode"] } = {}) {
  const tok = (
    kind: Token["kind"],
    zone: string,
    id: string | null,
    top: number,
    h: number,
    mode: Token["mode"] = "move",
    folded = false
  ): Token => ({ kind, zone, id, top, h, mode, folded });
  const mode = opts.today ?? "move";
  return [
    tok("head", "Today", null, 0, 20, mode),
    tok("row", "Today", "a", 20, H, mode),
    tok("row", "Today", "b", 80, H, mode),
    tok("row", "Today", "c", 140, H, mode),
    tok("head", "Tomorrow", null, 200, 20, "move", !!opts.foldedTomorrow),
    tok("row", "Tomorrow", "d", 220, H, "move", !!opts.foldedTomorrow),
    tok("row", "Tomorrow", "e", 280, H, "move", !!opts.foldedTomorrow),
  ];
}

/** Lift the row `id` out of `all`: the frame a drag works with. */
function frame(all: Token[], id: string): DragFrame {
  const si = all.findIndex((t) => t.id === id);
  const src = all[si];
  return {
    T: all.filter((t) => t !== src),
    si,
    H: src.h,
    srcTop: src.top,
    from: src.zone,
    fromMode: src.mode,
  };
}

describe("candidates", () => {
  it("opens a gap after every head and row of a zone that takes the row", () => {
    const c = candidates(frame(list(), "b"));
    // T = [headToday, a, c, headTomorrow, d, e]; gaps after each = q 1..6
    expect(c.map((x) => [x.q, x.zone, x.after])).toEqual([
      [1, "Today", null],
      [2, "Today", "a"],
      [3, "Today", "c"],
      [4, "Tomorrow", null],
      [5, "Tomorrow", "d"],
      [6, "Tomorrow", "e"],
    ]);
  });

  it("home is the gap where the row came from, at its own top", () => {
    const c = candidates(frame(list(), "b"));
    const home = c.filter((x) => x.home);
    expect(home).toHaveLength(1);
    expect(home[0]).toMatchObject({
      q: 2,
      gapTop: 80,
      anchor: 110,
      after: "a",
      before: "c",
    });
  });

  it("the gap after a row below home sits at that row's bottom less the row being moved", () => {
    const c = candidates(frame(list(), "a"));
    // after "c" (q=3): c.top + c.h − H = 140
    expect(c.find((x) => x.q === 3)).toMatchObject({
      gapTop: 140,
      after: "c",
      before: null,
    });
    // before the first row (after the head): its own place for a row above home
    const up = candidates(frame(list(), "c")).find((x) => x.q === 1);
    expect(up).toMatchObject({ gapTop: 20, after: null, before: "a" });
  });

  it("the row before the gap in the next section is not a neighbour across a zone", () => {
    // gap after "c" (end of Today) has no row after it in Today
    const c = candidates(frame(list(), "a"));
    expect(c.find((x) => x.after === "c")?.before).toBeNull();
  });

  it("a locked source zone offers only home, and other zones take it", () => {
    const c = candidates(frame(list({ today: "none" }), "b"));
    expect(c.filter((x) => x.zone === "Today").map((x) => x.home)).toEqual([
      true,
    ]);
    expect(c.filter((x) => x.zone === "Tomorrow")).toHaveLength(3);
  });

  it("a zone that does not take drops opens nothing", () => {
    const all = list();
    all.forEach((t) => {
      if (t.zone === "Tomorrow") t.mode = "reorder";
    });
    const c = candidates(frame(all, "b"));
    expect(c.some((x) => x.zone === "Tomorrow")).toBe(false);
  });

  it("a folded section takes the drop on its head and opens no gap", () => {
    const c = candidates(frame(list({ foldedTomorrow: true }), "b"));
    const folded = c.filter((x) => x.folded);
    expect(folded).toHaveLength(1);
    expect(folded[0]).toMatchObject({
      zone: "Tomorrow",
      after: null,
      before: null,
    });
    expect(folded[0].head?.kind).toBe("head");
  });

  it("the first row has no token before it, so home is added", () => {
    const all: Token[] = [
      {
        kind: "row",
        zone: "Z",
        id: "x",
        top: 0,
        h: H,
        mode: "move",
        folded: false,
      },
      {
        kind: "row",
        zone: "Z",
        id: "y",
        top: 60,
        h: H,
        mode: "move",
        folded: false,
      },
    ];
    const c = candidates(frame(all, "x"));
    expect(c.filter((x) => x.home)).toHaveLength(1);
    expect(c.find((x) => x.home)).toMatchObject({ q: 0, gapTop: 0 });
  });
});

describe("nearest", () => {
  const c = candidates(frame(list(), "b"));
  it("is the gap whose centre is closest to the finger", () => {
    expect(nearest(c, 110, false)?.home).toBe(true);
    expect(nearest(c, 265, false)).toMatchObject({
      zone: "Tomorrow",
      after: "d",
    });
    expect(nearest(c, -500, false)?.q).toBe(1);
  });
  it("is home whenever the finger is out of the list", () => {
    expect(nearest(c, 265, true)?.home).toBe(true);
  });
});

describe("shiftOf", () => {
  // source b was at index si = 2 (head, a, [b], c, …); T = [head, a, c, …]
  const shifts = (q: number) =>
    [0, 1, 2, 3, 4, 5].map((k) => shiftOf(k, 2, q, H));

  it("nothing moves while the gap is home", () => {
    expect(shifts(2)).toEqual([0, 0, 0, 0, 0, 0]);
  });
  it("rows between home and a gap below slide up by one row", () => {
    // gap after d (q=5): T[2]=c, T[3]=headTomorrow, T[4]=d move up
    expect(shifts(5)).toEqual([0, 0, -H, -H, -H, 0]);
  });
  it("rows between a gap above and home slide down by one row", () => {
    // gap after the head (q=1): T[1]=a moves down
    expect(shifts(1)).toEqual([0, H, 0, 0, 0, 0]);
  });
});

describe("the edge scroll", () => {
  it("is still in the middle, runs toward the edge the finger is in", () => {
    expect(scrollSpeed(400, 0, 800)).toBe(0);
    expect(scrollSpeed(0, 0, 800)).toBe(-12);
    expect(scrollSpeed(58, 0, 800)).toBeCloseTo(-6, 5);
    expect(scrollSpeed(800, 0, 800)).toBe(12);
    expect(scrollSpeed(730, 0, 800)).toBeCloseTo(6, 5);
  });
});

describe("isOut and lean", () => {
  const r = { left: 0, right: 390, top: 0, bottom: 800 };
  it("8 px of slack at the sides, none above and below", () => {
    expect(isOut(395, 100, r)).toBe(false);
    expect(isOut(399, 100, r)).toBe(true);
    expect(isOut(100, -1, r)).toBe(true);
    expect(isOut(100, 801, r)).toBe(true);
  });
  it("the lean follows the sideways travel, damped and clamped to 3 degrees", () => {
    expect(lean(0, 4)).toBeCloseTo(1.2, 5);
    expect(lean(2, 0)).toBeCloseTo(1.5, 5);
    expect(lean(0, 100)).toBe(3);
    expect(lean(0, -100)).toBe(-3);
  });
});
