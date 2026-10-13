/**
 * @jest-environment jsdom
 *
 * The kit's gestures, mounted for real: a cancelled swipe never commits, the
 * release uses the last move (not the up event's coordinates), a second
 * pointerdown or another finger's up changes nothing, a fired hold lets go of
 * a pull-down, and a sheet moves focus in, traps Tab, restores focus and
 * answers Esc one at a time.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { PkPullDown, PkRow, PkSheet } from "..";
import { pkAbortGestures, pkTrack } from "../pointer";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let host: HTMLDivElement;
let root: Root;

function pointer(
  type: string,
  props: { x?: number; y?: number; id?: number; kind?: string } = {}
) {
  const e = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: props.x ?? 0,
    clientY: props.y ?? 0,
  });
  Object.defineProperty(e, "pointerId", { value: props.id ?? 1 });
  Object.defineProperty(e, "pointerType", { value: props.kind ?? "mouse" });
  return e;
}
const fire = (el: Element | Window, type: string, p = {}) =>
  act(() => {
    el.dispatchEvent(pointer(type, p));
  });

const reduced = (on: boolean) =>
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: on && query.includes("reduce"),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }),
  });

beforeEach(() => {
  reduced(true);
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = RO;
  // jsdom has no canvas: the sky engine bails out on a null context
  jest
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(() => null);
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get() {
      return (this as HTMLElement).classList?.contains("pk-pull") ? 220 : 0;
    },
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  jest.restoreAllMocks();
  act(() => root.unmount());
  host.remove();
  delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight;
});

const q = <T extends Element>(sel: string) => host.querySelector<T>(sel)!;

describe("pkTrack", () => {
  it("ignores other fingers and reports a cancel without coordinates", () => {
    const end = jest.fn();
    const move = jest.fn();
    pkTrack(move, end, 7);
    window.dispatchEvent(pointer("pointermove", { id: 9, x: 5 }));
    window.dispatchEvent(pointer("pointerup", { id: 9 }));
    expect(move).not.toHaveBeenCalled();
    expect(end).not.toHaveBeenCalled();
    window.dispatchEvent(pointer("pointercancel", { id: 7 }));
    expect(end).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledWith(null, "cancel");
    window.dispatchEvent(pointer("pointerup", { id: 7 }));
    expect(end).toHaveBeenCalledTimes(1);
  });
  it("a fired hold (the abort bus) cancels it", () => {
    const end = jest.fn();
    pkTrack(jest.fn(), end, 3);
    pkAbortGestures(3);
    expect(end).toHaveBeenCalledWith(null, "cancel");
  });
  it("an abort aimed at another finger leaves it alone", () => {
    const end = jest.fn();
    const off = pkTrack(jest.fn(), end, 3);
    pkAbortGestures(4);
    expect(end).not.toHaveBeenCalled();
    off();
  });
});

describe("row swipe", () => {
  const mountRow = () => {
    const onSwipe = jest.fn();
    act(() =>
      root.render(
        h(PkRow, {
          id: "r",
          title: "Call Anna",
          canDone: true,
          canLater: true,
          onSwipe,
          onOpen: () => {},
        })
      )
    );
    return {
      onSwipe,
      open: q<HTMLElement>(".pk-row-open"),
      row: q<HTMLElement>(".pk-row"),
    };
  };

  it("a cancel after a long drag commits nothing and the row goes home", () => {
    const { onSwipe, open, row } = mountRow();
    fire(open, "pointerdown", { x: 10, y: 10 });
    fire(window, "pointermove", { x: 140, y: 12 });
    // the synthetic cancel a hold used to send: zero coordinates
    fire(window, "pointercancel", { x: 0, y: 0 });
    expect(onSwipe).not.toHaveBeenCalled();
    expect(row.style.transform).toBe("");
  });

  it("a hold firing mid-drag aborts the swipe", () => {
    const { onSwipe, open } = mountRow();
    fire(open, "pointerdown", { x: 10, y: 10 });
    fire(window, "pointermove", { x: 140, y: 12 });
    act(() => pkAbortGestures(1));
    fire(window, "pointerup", { x: 140, y: 12 });
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it("the release uses the last move, not the up event's coordinates", () => {
    const { onSwipe, open } = mountRow();
    fire(open, "pointerdown", { x: 10, y: 10 });
    fire(window, "pointermove", { x: 140, y: 12 });
    fire(window, "pointerup", { x: 0, y: 0 });
    expect(onSwipe).toHaveBeenCalledWith("done");
  });

  it("a second pointerdown while one is down is ignored", () => {
    const { onSwipe, open } = mountRow();
    fire(open, "pointerdown", { x: 10, y: 10, id: 1 });
    fire(open, "pointerdown", { x: 300, y: 10, id: 2 });
    fire(window, "pointermove", { x: 140, y: 12, id: 1 });
    fire(window, "pointerup", { x: 140, y: 12, id: 1 });
    expect(onSwipe).toHaveBeenCalledTimes(1);
    expect(onSwipe).toHaveBeenCalledWith("done");
  });

  it("another finger lifting does not end the swipe", () => {
    const { onSwipe, open } = mountRow();
    fire(open, "pointerdown", { x: 10, y: 10, id: 1 });
    fire(window, "pointermove", { x: 140, y: 12, id: 1 });
    fire(window, "pointerup", { x: 5, y: 5, id: 2 });
    expect(onSwipe).not.toHaveBeenCalled();
    fire(window, "pointerup", { x: 140, y: 12, id: 1 });
    expect(onSwipe).toHaveBeenCalledWith("done");
  });
});

describe("pull-down", () => {
  const mountPull = () => {
    const scroller = document.createElement("div");
    document.body.appendChild(scroller);
    act(() => root.render(h(PkPullDown, { scroller, onAdd: () => {} })));
    return scroller;
  };
  const state = () => q("[data-pk-pull]").getAttribute("data-pk-pull");

  it("pulling past the arm distance opens it", () => {
    const scroller = mountPull();
    fire(scroller, "pointerdown", { x: 50, y: 0 });
    fire(window, "pointermove", { x: 50, y: 160 });
    fire(window, "pointerup", { x: 50, y: 160 });
    expect(state()).toBe("open");
    scroller.remove();
  });

  it("a hold that fires mid-pull lets go: it stays shut", () => {
    const scroller = mountPull();
    fire(scroller, "pointerdown", { x: 50, y: 0 });
    fire(window, "pointermove", { x: 50, y: 160 });
    act(() => pkAbortGestures());
    fire(window, "pointerup", { x: 50, y: 160 });
    expect(state()).toBe("shut");
    scroller.remove();
  });
});

describe("sheet focus and stacking", () => {
  const frames = () =>
    act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });

  it("moves focus in after the first paint, traps Tab, and gives it back", async () => {
    const opener = document.createElement("button");
    opener.textContent = "open";
    document.body.appendChild(opener);
    opener.focus();
    const sheet = (open: boolean) =>
      h(
        PkSheet,
        {
          open,
          onClose: () => {},
          title: "New task",
          footer: h("button", { id: "go" }, "Go"),
        },
        h("input", { id: "first" }),
        h("button", { id: "second" }, "x")
      );
    act(() => root.render(sheet(true)));
    // not yet: the layout effect leaves the focus alone
    expect(document.activeElement).toBe(opener);
    await frames();
    expect(document.activeElement?.id).toBe("first");

    // Tab from the last focusable wraps to the first
    q<HTMLElement>("#go").focus();
    const tab = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(tab);
    });
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe("first");

    // closing puts it back where it was
    act(() => root.render(sheet(false)));
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("Esc closes only the top sheet", async () => {
    const closeA = jest.fn();
    const closeB = jest.fn();
    act(() =>
      root.render(
        h(
          "div",
          null,
          h(
            PkSheet,
            { open: true, onClose: closeA, title: "A" },
            h("input", { id: "a" })
          ),
          h(
            PkSheet,
            { open: true, onClose: closeB, title: "B" },
            h("input", { id: "b" })
          )
        )
      )
    );
    await frames();
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });
    expect(closeB).toHaveBeenCalledTimes(1);
    expect(closeA).not.toHaveBeenCalled();
  });
});
