/**
 * @jest-environment jsdom
 */
import {
  BLOCK_MENU,
  type CaretFacts,
  FLOATING_ACCESSORY_PX,
  KEYBOARD_MIN,
  KEYBOARD_STAY,
  NO_KEYBOARD,
  accessoryRoom,
  barInset,
  barLift,
  barMode,
  barOffset,
  barTransform,
  blockLabel,
  blockTypeOf,
  caretLead,
  caretScrollDelta,
  hasFloatingAccessory,
  trackKeyboard,
} from "../bar-logic";

describe("what the bar does about the keyboard", () => {
  it("lifts by the keyboard's height, never below the bottom", () => {
    expect(barTransform(336)).toBe("translate3d(0, -336px, 0)");
    expect(barTransform(0)).toBe("translate3d(0, 0px, 0)");
    expect(barTransform(-5)).toBe("translate3d(0, 0px, 0)");
  });

  it("pads the scroll area by the keyboard plus the bar", () => {
    expect(barInset(336, 48)).toBe(394);
    expect(barInset(0, 0)).toBe(58);
    expect(barInset(336, 300)).toBe(646); // a panel open above the row
  });

  it("scrolls a caret out from under the bar, and back from under the top", () => {
    const base = { viewTop: 100, viewBottom: 500, margin: 20 };
    expect(caretScrollDelta({ ...base, caretTop: 300, caretBottom: 320 })).toBe(
      0
    );
    expect(caretScrollDelta({ ...base, caretTop: 480, caretBottom: 500 })).toBe(
      20
    );
    expect(caretScrollDelta({ ...base, caretTop: 90, caretBottom: 110 })).toBe(
      -30
    );
  });
});

const facts = (over: Partial<CaretFacts> = {}): CaretFacts => ({
  heading: null,
  bullet: false,
  ordered: false,
  taskItem: false,
  isTask: false,
  toggle: false,
  callout: false,
  quote: false,
  code: false,
  ...over,
});

describe("barOffset", () => {
  const at = (vvHeight: number, vvOffsetTop = 0, scale = 1) => ({
    innerHeight: 844,
    vvHeight,
    vvOffsetTop,
    scale,
  });

  it("is the part of the bottom the keyboard covers", () => {
    expect(barOffset(at(544))).toEqual({ lift: 300, open: true });
    expect(barOffset(at(844))).toEqual(NO_KEYBOARD);
  });

  it("the browser's own bars are not a keyboard", () => {
    expect(barOffset(at(844 - (KEYBOARD_MIN - 1)))).toEqual(NO_KEYBOARD);
    expect(barOffset(at(844 - KEYBOARD_MIN)).open).toBe(true);
  });

  it("a page dragged past the keyboard's room does not swing the bar", () => {
    // 300 px of keyboard leaves room for 300 px of scroll; iOS reports more
    // while the page rubber-bands, and a raw reading would go negative.
    expect(barOffset(at(544, 340))).toEqual({ lift: 0, open: false });
    expect(barOffset(at(544, 300), { lift: 300, open: true }).lift).toBe(0);
    // Under the room the bar follows the visual viewport.
    expect(barOffset(at(544, 40))).toEqual({ lift: 260, open: true });
    // Above the top (overscroll upward) is the top.
    expect(barOffset(at(544, -25))).toEqual({ lift: 300, open: true });
  });

  it("stays up while the keyboard's suggestion row shrinks, and goes down under 40", () => {
    const up = { lift: 300, open: true };
    expect(barOffset(at(844 - 60), up)).toEqual({ lift: 60, open: true });
    expect(barOffset(at(844 - KEYBOARD_STAY), up).open).toBe(true);
    expect(barOffset(at(844 - (KEYBOARD_STAY - 1)), up)).toEqual(NO_KEYBOARD);
    // ... but it does not come up from 60: that took 80.
    expect(barOffset(at(844 - 60), NO_KEYBOARD)).toEqual(NO_KEYBOARD);
  });

  it("a pinch-zoomed page keeps the last answer", () => {
    const up = { lift: 300, open: true };
    expect(barOffset(at(400, 0, 1.6), up)).toBe(up);
    expect(barOffset(at(400, 0, 1.6), NO_KEYBOARD)).toBe(NO_KEYBOARD);
  });
});

describe("trackKeyboard", () => {
  type Handler = () => void;
  let listeners: Record<string, Handler[]>;
  let vv: {
    height: number;
    offsetTop: number;
    scale: number;
    addEventListener: (type: string, f: Handler) => void;
    removeEventListener: (type: string, f: Handler) => void;
  };
  const fire = (type: string) => (listeners[type] ?? []).forEach((f) => f());
  let el: HTMLElement;

  beforeEach(() => {
    listeners = {};
    vv = {
      height: 844,
      offsetTop: 0,
      scale: 1,
      addEventListener: (type, f) => {
        (listeners[type] ??= []).push(f);
      },
      removeEventListener: (type, f) => {
        listeners[type] = (listeners[type] ?? []).filter((x) => x !== f);
      },
    };
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: vv,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 844,
    });
    el = document.createElement("div");
  });
  afterEach(() => {
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: undefined,
    });
  });

  it("starts at rest, rides the keyboard, and writes in the event, not a frame later", () => {
    const stop = trackKeyboard(el);
    expect(el.dataset.kb).toBe("rest");
    expect(el.style.getPropertyValue("--page-kb")).toBe("0px");
    vv.height = 544;
    fire("resize");
    expect(el.dataset.kb).toBe("open");
    expect(el.style.getPropertyValue("--page-kb")).toBe("300px");
    stop();
    expect(el.dataset.kb).toBeUndefined();
    expect(el.style.getPropertyValue("--page-kb")).toBe("");
    expect(listeners.resize).toEqual([]);
    expect(listeners.scroll).toEqual([]);
  });

  it("follows a scroll of the visual viewport but never overshoots", () => {
    trackKeyboard(el);
    vv.height = 544;
    fire("resize");
    vv.offsetTop = 120;
    fire("scroll");
    expect(el.style.getPropertyValue("--page-kb")).toBe("180px");
    // The rubber band: more than the keyboard leaves.
    vv.offsetTop = 420;
    fire("scroll");
    // lift hits 0: the keyboard counts as down only under 40, so this is "rest".
    expect(el.dataset.kb).toBe("rest");
    expect(el.style.getPropertyValue("--page-kb")).toBe("0px");
    vv.offsetTop = 0;
    fire("scroll");
    expect(el.style.getPropertyValue("--page-kb")).toBe("300px");
  });

  it("does nothing when the browser has no visual viewport", () => {
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: undefined,
    });
    const stop = trackKeyboard(el);
    expect(el.dataset.kb).toBeUndefined();
    expect(stop()).toBeUndefined();
  });
});

describe("block menu", () => {
  it("offers text, headings, lists, task, toggle, callout, quote, code, divider, image and table", () => {
    const ids = BLOCK_MENU.map((b) => b.id);
    for (const id of [
      "paragraph",
      "heading1",
      "heading2",
      "heading3",
      "bullet",
      "ordered",
      "taskItem",
      "TOGGLE",
      "CALLOUT",
      "quote",
      "code",
      "divider",
      "IMAGE",
      "TABLE",
    ]) {
      expect(ids).toContain(id);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names the block the caret is in", () => {
    expect(blockTypeOf(facts())).toBe("paragraph");
    expect(blockTypeOf(facts({ heading: 2 }))).toBe("heading2");
    expect(blockTypeOf(facts({ bullet: true }))).toBe("bullet");
    expect(blockTypeOf(facts({ ordered: true }))).toBe("ordered");
    expect(blockTypeOf(facts({ taskItem: true, isTask: true }))).toBe(
      "taskItem"
    );
    expect(blockTypeOf(facts({ taskItem: true }))).toBe("checklist");
    expect(blockTypeOf(facts({ code: true, quote: true }))).toBe("code");
    expect(blockTypeOf(facts({ callout: true }))).toBe("CALLOUT");
    expect(blockTypeOf(facts({ toggle: true }))).toBe("TOGGLE");
    expect(blockLabel("heading1")).toBe("Heading 1");
    expect(blockLabel("taskItem")).toBe("Task");
  });
});

describe("iOS 26's floating accessory pill", () => {
  const probe = (has: string[], coarse = true) => ({
    coarse,
    supports: (p: string) => has.includes(p),
  });

  it("is iOS WebKit with anchor positioning (Safari 26) on a touch screen", () => {
    expect(
      hasFloatingAccessory(probe(["-webkit-touch-callout", "anchor-name"]))
    ).toBe(true);
    // iOS 18: no anchor positioning; its accessory is an opaque strip the
    // visual viewport already ends above.
    expect(hasFloatingAccessory(probe(["-webkit-touch-callout"]))).toBe(false);
    // Chrome / Android: anchor positioning, no touch callout.
    expect(hasFloatingAccessory(probe(["anchor-name"]))).toBe(false);
    // A Mac (fine pointer).
    expect(
      hasFloatingAccessory(
        probe(["-webkit-touch-callout", "anchor-name"], false)
      )
    ).toBe(false);
    expect(hasFloatingAccessory(null)).toBe(false);
    expect(accessoryRoom(probe(["-webkit-touch-callout", "anchor-name"]))).toBe(
      FLOATING_ACCESSORY_PX
    );
    expect(accessoryRoom(null)).toBe(0);
  });

  it("lifts the bar over the pill only while the keyboard is up", () => {
    expect(barLift({ lift: 336, open: true }, FLOATING_ACCESSORY_PX)).toBe(
      336 + FLOATING_ACCESSORY_PX
    );
    expect(barLift({ lift: 336, open: true }, 0)).toBe(336);
    expect(barLift(NO_KEYBOARD, FLOATING_ACCESSORY_PX)).toBe(0);
  });

  it("the tracker writes the lift with the pill's room, --page-kb without it", () => {
    const listeners: Record<string, Array<() => void>> = {};
    const vv = {
      height: 844,
      offsetTop: 0,
      scale: 1,
      addEventListener: (type: string, f: () => void) => {
        (listeners[type] ??= []).push(f);
      },
      removeEventListener: () => undefined,
    };
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: vv,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 844,
    });
    const el = document.createElement("div");
    const heard: number[] = [];
    trackKeyboard(el, (lift) => heard.push(lift), 52);
    expect(el.style.transform).toBe(barTransform(0));
    vv.height = 508;
    listeners.resize.forEach((f) => f());
    expect(el.style.transform).toBe(barTransform(336 + 52));
    expect(el.style.getPropertyValue("--page-kb")).toBe("336px");
    expect(el.dataset.kbRead).toBe("844/508/0/52");
    expect(heard.at(-1)).toBe(388);
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: undefined,
    });
  });
});

describe("one bar in every state", () => {
  it("shows the bar while the editor has focus, and nothing without it", () => {
    expect(barMode({ focused: true, panel: false, suppressed: false })).toEqual(
      { mode: "bar", padded: true }
    );
    expect(
      barMode({ focused: false, panel: false, suppressed: false })
    ).toEqual({ mode: "off", padded: false });
  });

  it("a panel grows out of the bar (one surface)", () => {
    expect(barMode({ focused: true, panel: true, suppressed: false })).toEqual({
      mode: "panel",
      padded: true,
    });
  });

  it('steps aside for the "/" sheet but keeps the page\'s keyboard room', () => {
    for (const panel of [false, true])
      expect(barMode({ focused: true, panel, suppressed: true })).toEqual({
        mode: "off",
        padded: true,
      });
  });

  it("is never drawn on the desktop", () => {
    expect(
      barMode({ focused: true, panel: true, suppressed: false, desktop: true })
    ).toEqual({ mode: "off", padded: false });
  });
});

describe("the caret on Enter", () => {
  it("leaves a lead under a caret brought out from under the bar", () => {
    // band 100..700: a third is 200, capped at 120
    expect(caretLead(100, 700)).toBe(120);
    expect(caretLead(100, 250)).toBe(50);
    expect(caretLead(300, 200)).toBe(0);
    expect(
      caretScrollDelta({
        caretTop: 680,
        caretBottom: 708,
        viewTop: 100,
        viewBottom: 700,
        margin: 8,
        lead: caretLead(100, 700),
      })
    ).toBe(708 - (700 - 8 - 120));
  });

  it("a caret already in sight does not move, lead or not", () => {
    expect(
      caretScrollDelta({
        caretTop: 300,
        caretBottom: 328,
        viewTop: 100,
        viewBottom: 700,
        margin: 8,
        lead: 120,
      })
    ).toBe(0);
  });

  it("the lead never applies at the top edge", () => {
    expect(
      caretScrollDelta({
        caretTop: 90,
        caretBottom: 118,
        viewTop: 100,
        viewBottom: 700,
        margin: 8,
        lead: 120,
      })
    ).toBe(90 - 108);
  });
});
