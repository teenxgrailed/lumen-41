/**
 * @jest-environment jsdom
 *
 * The phone editing bar on a real keyboard's geometry: iOS leaves the layout
 * viewport alone and shrinks (and scrolls) the visual viewport, so the bar is
 * fixed to the bottom, portalled out from under any transform, and lifted by a
 * translateY read from the visual viewport. The scroll area is padded and the
 * caret kept above the bar. visualViewport is stubbed (height, offsetTop,
 * resize events); there is no layout in jsdom, so rectangles are stubbed too.
 */
import { act, createElement as h } from "react";

import { Editor, type JSONContent } from "@tiptap/core";
import Collaboration from "@tiptap/extension-collaboration";
import { type Root, createRoot } from "react-dom/client";

import { Yjs as Y } from "@/lib/collaboration/yjs";
import { pageEditorExtensions } from "@/lib/pages/page-editor-schema";

import { PhoneEditBar } from "../PhoneEditBar";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("lucide-react", () => {
  const icon = () => null;
  return new Proxy(
    { __esModule: true },
    { get: (t, k) => (k in t ? (t as never)[k] : icon) }
  );
});

const INNER = 800;
type Vv = EventTarget & { height: number; offsetTop: number; scale: number };

let vv: Vv;
let editorHost: HTMLElement;
let barHost: HTMLElement;
let scroller: HTMLElement;
let root: Root;
let editor: Editor;
const noop = jest.fn();
const realVv = Object.getOwnPropertyDescriptor(window, "visualViewport");
const realInner = Object.getOwnPropertyDescriptor(window, "innerHeight");

const para = (text: string): JSONContent => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});

/** The editor inside a scrolling ancestor; the bar rendered under `barParent`. */
const make = (barParentStyle: Partial<CSSStyleDeclaration> = {}) => {
  scroller = document.createElement("div");
  scroller.style.overflowY = "auto";
  scroller.style.paddingBottom = "7px";
  document.body.appendChild(scroller);
  editorHost = document.createElement("div");
  scroller.appendChild(editorHost);
  editor = new Editor({
    element: editorHost,
    extensions: [
      ...pageEditorExtensions,
      Collaboration.configure({ document: new Y.Doc() }),
    ],
  });
  editor.commands.setContent(
    { type: "doc", content: [para("Hello")] },
    { emitUpdate: false }
  );
  barHost = document.createElement("div");
  Object.assign(barHost.style, barParentStyle);
  document.body.appendChild(barHost);
  root = createRoot(barHost);
  act(() =>
    root.render(
      h(PhoneEditBar, {
        editor,
        onCommand: noop,
        onLink: noop,
        onInsert: noop,
      })
    )
  );
};

const bar = () =>
  document.body.querySelector<HTMLElement>(
    "[aria-label='Page editing actions']"
  )!;
/** The keyboard moves the visual viewport: it shrinks, and may scroll. */
const keyboard = (height: number, offsetTop = 0) =>
  act(() => {
    vv.height = height;
    vv.offsetTop = offsetTop;
    vv.dispatchEvent(new Event("resize"));
  });
const wait = (ms: number) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

/** Tiptap focuses on a frame; the bar hears the editor's focus event. */
const focus = async () => {
  act(() => void editor.commands.focus());
  await wait(60);
};

beforeEach(() => {
  vv = Object.assign(new EventTarget(), {
    height: INNER,
    offsetTop: 0,
    scale: 1,
  });
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: vv,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: INNER,
  });
  // jsdom has no layout: ProseMirror asks ranges and elements for rectangles.
  const rects = () =>
    ({
      length: 0,
      item: () => null,
      [Symbol.iterator]: [][Symbol.iterator],
    }) as never;
  Range.prototype.getClientRects = rects;
  Element.prototype.getClientRects = rects;
  Range.prototype.getBoundingClientRect = () =>
    ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }) as DOMRect;
  Element.prototype.scrollIntoView = jest.fn();
});
afterEach(() => {
  act(() => root.unmount());
  editor.destroy();
  scroller.remove();
  barHost.remove();
  if (realVv) Object.defineProperty(window, "visualViewport", realVv);
  else delete (window as { visualViewport?: unknown }).visualViewport;
  if (realInner) Object.defineProperty(window, "innerHeight", realInner);
});

describe("the bar on the keyboard", () => {
  it("is portalled out of a transformed ancestor, to the body", () => {
    // The reader slides with a transform; a fixed element inside it is fixed
    // to the reader, not to the screen. The bar must not sit under one.
    make({ transform: "translate3d(0,0,0)", willChange: "transform" });
    const el = bar();
    expect(el.parentElement).toBe(document.body);
    expect(barHost.contains(el)).toBe(false);
    for (let p = el.parentElement; p; p = p.parentElement) {
      expect(p.style.transform).toBe("");
      expect(p.style.willChange).toBe("");
    }
  });

  it("shows only while the editor has focus, and goes with it", async () => {
    make();
    expect(bar().dataset.shown).toBe("false");
    expect(bar().hasAttribute("inert")).toBe(true);
    await focus();
    expect(bar().dataset.shown).toBe("true");
    expect(bar().hasAttribute("inert")).toBe(false);
    act(() => void editor.commands.blur());
    // The bar hides after a short grace period; poll instead of betting on
    // one fixed delay, which a loaded CI runner can overrun.
    for (let i = 0; i < 40 && bar().dataset.shown !== "false"; i += 1) {
      await wait(50);
    }
    expect(bar().dataset.shown).toBe("false");
  });

  it("rides on the keyboard by innerHeight - vv.height - vv.offsetTop", () => {
    make();
    expect(bar().style.transform).toBe("translate3d(0, 0px, 0)");
    keyboard(450);
    expect(bar().style.transform).toBe("translate3d(0, -350px, 0)");
    expect(bar().dataset.kb).toBe("open");
    // iOS scrolls the visual viewport to keep the caret in view: the bar
    // follows the bottom of what is seen, not the layout viewport's.
    keyboard(450, 40);
    expect(bar().style.transform).toBe("translate3d(0, -310px, 0)");
    // The suggestion row changing height moves it with the keys.
    keyboard(470, 40);
    expect(bar().style.transform).toBe("translate3d(0, -290px, 0)");
    keyboard(INNER);
    expect(bar().style.transform).toBe("translate3d(0, 0px, 0)");
    expect(bar().dataset.kb).toBe("rest");
  });

  it("pads the scroll area by the keyboard plus the bar while it shows, then gives it back", async () => {
    make();
    keyboard(450);
    await focus();
    // 350 for the keyboard, 48 for the bar's row
    expect(scroller.style.paddingBottom).toBe("398px");
    expect(scroller.style.scrollPaddingBottom).toBe("418px");
    keyboard(400);
    expect(scroller.style.paddingBottom).toBe("448px");
    act(() => void editor.commands.blur());
    await wait(220);
    expect(scroller.style.paddingBottom).toBe("7px");
    expect(scroller.style.scrollPaddingBottom).toBe("");
  });

  it("scrolls the caret line clear of the bar", async () => {
    make();
    let top = 0;
    const sets: number[] = [];
    Object.defineProperty(scroller, "scrollTop", {
      configurable: true,
      get: () => top,
      set: (v: number) => {
        sets.push(v - top);
        top = v;
      },
    });
    bar().getBoundingClientRect = () =>
      ({
        top: 500,
        bottom: 548,
        left: 0,
        right: 390,
        width: 390,
        height: 48,
      }) as DOMRect;
    jest
      .spyOn(editor.view, "coordsAtPos")
      .mockReturnValue({ top: 700, bottom: 720, left: 0, right: 0 });
    keyboard(450);
    await focus();
    // the line's bottom (720) rises to the bar's top (500) less a 20 px margin
    // (ProseMirror scrolls on focus too; ours is the last step: +240)
    expect(sets.at(-1)).toBe(240);
  });
});
