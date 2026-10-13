import { pillRectFromDom } from "../pillRect";

const rect = (left: number, top: number, width: number, height: number) =>
  ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  }) as DOMRect;

interface Fake {
  rect: DOMRect;
  offsetWidth?: number;
}

/** The slice of the DOM pillRectFromDom touches, so no browser is needed. */
function dom(opts: {
  layer: Fake;
  pill?: Fake | null;
  radius?: string;
  frame?: boolean;
  elsewhere?: Fake | null;
}) {
  const el = (f: Fake) => ({
    getBoundingClientRect: () => f.rect,
    offsetWidth: f.offsetWidth ?? f.rect.width,
  });
  const pill = opts.pill ? el(opts.pill) : null;
  const root = {
    querySelector: (sel: string) => (sel === "[data-nva-pill]" ? pill : null),
  };
  const elsewhere = opts.elsewhere ? el(opts.elsewhere) : null;
  const document = {
    querySelector: (sel: string) =>
      sel === "[data-nva-pill]" ? elsewhere : null,
    defaultView: {
      getComputedStyle: () => ({ borderTopLeftRadius: opts.radius ?? "" }),
    },
  };
  return {
    ...el(opts.layer),
    ownerDocument: document,
    closest: (sel: string) =>
      sel === "[data-v2p-frame]" && opts.frame !== false ? root : null,
  } as unknown as HTMLElement;
}

const layer = { rect: rect(100, 50, 390, 844) };

describe("pillRectFromDom", () => {
  it("is the pill's box in the layer's own px, with its parsed radius", () => {
    const r = pillRectFromDom(
      dom({
        layer,
        pill: { rect: rect(180, 780, 230, 52) },
        radius: "26px",
      })
    );
    expect(r).toEqual({ x: 80, y: 730, w: 230, h: 52, r: 26 });
  });

  it("half the height when the radius is not a length", () => {
    const pill = { rect: rect(180, 780, 230, 52) };
    for (const radius of ["", "50%", "auto"]) {
      expect(pillRectFromDom(dom({ layer, pill, radius }))?.r).toBe(26);
    }
  });

  it("a huge radius (a 999px pill) is held to half the height", () => {
    expect(
      pillRectFromDom(
        dom({ layer, pill: { rect: rect(0, 0, 100, 40) }, radius: "999px" })
      )?.r
    ).toBe(20);
  });

  it("null when there is no pill, or it is not drawn", () => {
    expect(pillRectFromDom(dom({ layer, pill: null }))).toBeNull();
    expect(
      pillRectFromDom(dom({ layer, pill: { rect: rect(0, 0, 0, 0) } }))
    ).toBeNull();
    expect(pillRectFromDom(null)).toBeNull();
  });

  it("looks in its own frame first, and the document only when there is none", () => {
    const other = { rect: rect(0, 0, 80, 40) };
    // the layer's frame has no pill; another frame on the page does
    expect(
      pillRectFromDom(dom({ layer, pill: null, elsewhere: other }))
    ).toBeNull();
    // no frame at all: the document is searched
    expect(
      pillRectFromDom(
        dom({ layer, frame: false, elsewhere: other, radius: "20px" })
      )
    ).toEqual({ x: -100, y: -50, w: 80, h: 40, r: 20 });
  });

  it("divides a scaled frame's rects back into the sheet's px", () => {
    // drawn at half size: 195 wide on screen, 390 in its own px
    const r = pillRectFromDom(
      dom({
        layer: { rect: rect(0, 0, 195, 422), offsetWidth: 390 },
        pill: { rect: rect(40, 390, 115, 26) },
        radius: "13px",
      })
    );
    expect(r).toEqual({ x: 80, y: 780, w: 230, h: 52, r: 13 });
  });
});
