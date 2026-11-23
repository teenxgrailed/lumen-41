import {
  DOCK_CLEAR_MARGIN_PX,
  DOCK_CLEAR_MAX_EXTRA_PX,
  type DockReading,
  lastRowAtEnd,
  tailExtra,
} from "../dock-clearance";

/**
 * The numbers phone-ground.css builds: lift = max(20, sab - 6); the dock
 * stands lift + 10 above the layout viewport's bottom and is 60 tall; the tail
 * is max(dockTop + 42, fog + 16) with fog = max(128, 94 + sab).
 */
function css(sab: number, gap = 0) {
  const lift = Math.max(20, sab - 6);
  const dockTopFromBottom = lift + 10 + 60;
  const fog = Math.max(128, 94 + sab);
  const tail = Math.max(dockTopFromBottom + 42, fog + 16) + gap;
  return { lift, dockTopFromBottom, fog, tail };
}

/**
 * A page scrolled to its end. `layoutBottom` is where `position: fixed; bottom`
 * hangs from (innerHeight), `visible` is the height of the area the document
 * scrolls against; the content before the tail is `rows` px.
 */
function atEnd(opts: {
  sab: number;
  layoutBottom: number;
  visible: number;
  rows: number;
  gap?: number;
  extra?: number;
}): DockReading & { tail: number } {
  const { tail } = css(opts.sab, opts.gap ?? 0);
  const t = tail + (opts.extra ?? 0);
  const scrollHeight = opts.rows + t;
  const scrollY = scrollHeight - opts.visible;
  const dockTop = opts.layoutBottom - css(opts.sab).dockTopFromBottom;
  return {
    dockTop,
    tailTop: opts.rows - scrollY,
    scrollY,
    scrollHeight,
    visibleHeight: opts.visible,
    extra: opts.extra ?? 0,
    tail: t,
  };
}

const MARGIN = DOCK_CLEAR_MARGIN_PX;

describe("the CSS tail, by itself", () => {
  // the numbers the first reading relied on, for each inset
  it.each([
    ["sab 0 (a Safari tab or the installed app without an inset)", 0, 144],
    ["sab 34 (home indicator)", 34, 144],
  ])(
    "%s: the tail is %i px and clears the dock by 12 px and more",
    (_n, sab, tail) => {
      const c = css(sab);
      expect(c.tail).toBe(tail);
      expect(c.tail).toBeGreaterThanOrEqual(c.dockTopFromBottom + MARGIN);
    }
  );

  it("with Safari's tab bar at the bottom (lift 74) the tail still clears the dock", () => {
    const lift = 74;
    const dockTop = lift + 10 + 60;
    const fog = 170;
    expect(Math.max(dockTop + 42, fog + 16)).toBe(186);
    expect(Math.max(dockTop + 42, fog + 16)).toBeGreaterThanOrEqual(
      dockTop + MARGIN
    );
  });
});

describe("tailExtra: layout viewport and visible area agree", () => {
  it.each([
    ["sab 0, standalone", 0],
    ["sab 34, standalone", 34],
  ])("%s: no extra is asked for", (_n, sab) => {
    const r = atEnd({ sab, layoutBottom: 874, visible: 874, rows: 1500 });
    expect(r.tailTop + r.scrollY).toBeCloseTo(1500, 5);
    expect(tailExtra(r)).toBe(0);
  });

  it("a Safari tab (bars out, layout = visible = 714) asks for nothing", () => {
    const r = atEnd({ sab: 0, layoutBottom: 714, visible: 714, rows: 1500 });
    expect(tailExtra(r)).toBe(0);
  });

  it("a short page (the tail is far from the end of the document) asks for nothing", () => {
    // the document is its 100lvh minimum: rows end well above the dock
    const sab = 34;
    const tail = css(sab).tail;
    const scrollHeight = 874;
    const rows = 400;
    const r: DockReading = {
      dockTop: 874 - css(sab).dockTopFromBottom,
      tailTop: rows - 62, // scrolled by its 62 px of overflow
      scrollY: 62,
      scrollHeight,
      visibleHeight: 812,
      extra: 0,
    };
    expect(lastRowAtEnd(r)).toBe(rows - 62 + 62 - (874 - 812));
    expect(tail).toBeGreaterThan(0);
    expect(tailExtra(r)).toBe(0);
  });
});

describe("tailExtra: the dock hangs from a shorter viewport than the page scrolls against", () => {
  // iOS installed app, iPhone 17 Pro: layout viewport 812, screen 874
  it.each([
    ["sab 0", 0],
    ["sab 34", 34],
  ])("%s: asks for the missing height", (_n, sab) => {
    const r = atEnd({ sab, layoutBottom: 812, visible: 874, rows: 1500 });
    // the last row ends tail px above the end (874) and the dock is at 812 - 70..
    const clear = r.dockTop - MARGIN - lastRowAtEnd(r);
    expect(clear).toBeLessThan(0); // it WOULD be under the dock
    const extra = tailExtra(r);
    expect(extra).toBe(Math.ceil(-clear));
    // applied, the last row ends at least 12 px above the dock
    const after = atEnd({
      sab,
      layoutBottom: 812,
      visible: 874,
      rows: 1500,
      extra,
    });
    expect(after.dockTop - lastRowAtEnd(after)).toBeGreaterThanOrEqual(MARGIN);
    // and asking again changes nothing
    expect(tailExtra(after)).toBe(extra);
  });

  it("the CSS gap term (100lvh - 100dvh = 62) alone is enough on the iPhone 17 Pro", () => {
    for (const sab of [0, 34]) {
      const r = atEnd({
        sab,
        layoutBottom: 812,
        visible: 874,
        rows: 1500,
        gap: 874 - 812,
      });
      expect(tailExtra(r)).toBe(0);
      expect(r.dockTop - lastRowAtEnd(r)).toBeGreaterThanOrEqual(MARGIN);
    }
  });

  it("gives the extra back once the viewports agree again", () => {
    const stuck = atEnd({
      sab: 34,
      layoutBottom: 812,
      visible: 874,
      rows: 1500,
    });
    const extra = tailExtra(stuck);
    expect(extra).toBeGreaterThan(0);
    const fixed = atEnd({
      sab: 34,
      layoutBottom: 874,
      visible: 874,
      rows: 1500,
      extra,
    });
    expect(tailExtra(fixed)).toBe(0);
  });

  it("is capped: a wild reading never makes a page a screen taller", () => {
    const r = atEnd({ sab: 34, layoutBottom: 300, visible: 874, rows: 1500 });
    expect(tailExtra(r)).toBe(DOCK_CLEAR_MAX_EXTRA_PX);
  });

  it("ignores moves of a pixel (no layout for noise)", () => {
    const base = atEnd({
      sab: 34,
      layoutBottom: 874,
      visible: 874,
      rows: 1500,
    });
    // the last row is 1 px short of its 12 px: not worth a layout
    const one = { ...base, dockTop: lastRowAtEnd(base) + MARGIN - 1 };
    expect(tailExtra(one)).toBe(0);
    // 2 px short is
    const two = { ...base, dockTop: lastRowAtEnd(base) + MARGIN - 2 };
    expect(tailExtra(two)).toBe(2);
  });
});
