/**
 * @jest-environment jsdom
 *
 * Swipe left on a row shows Schedule and Delete and the row rests open; swipe
 * right still completes. Vertical scrolling is never taken by the row, and the
 * haptic pulses (where vibrate exists) fire at the threshold and on complete.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { PkRow } from "..";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
let vibrate: jest.Mock;

function pointer(type: string, p: { x?: number; y?: number } = {}) {
  const e = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: p.x ?? 0,
    clientY: p.y ?? 0,
  });
  Object.defineProperty(e, "pointerId", { value: 1 });
  Object.defineProperty(e, "pointerType", { value: "touch" });
  return e;
}
const fire = (el: Element | Window | Document, type: string, p = {}) => {
  const e = pointer(type, p);
  act(() => {
    el.dispatchEvent(e);
  });
  return e;
};

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  vibrate = jest.fn(() => true);
  Object.defineProperty(navigator, "vibrate", {
    configurable: true,
    value: vibrate,
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  jest.restoreAllMocks();
  act(() => root.unmount());
  host.remove();
  delete (navigator as { vibrate?: unknown }).vibrate;
});

const q = <T extends Element>(sel: string) => host.querySelector<T>(sel)!;

function mount(over: Record<string, unknown> = {}) {
  const onSwipe = jest.fn();
  const onSchedule = jest.fn();
  const onDelete = jest.fn();
  const onOpen = jest.fn();
  act(() =>
    root.render(
      h(PkRow, {
        id: "r",
        title: "Call Anna",
        canDone: true,
        onSwipe,
        onOpen,
        actions: { onSchedule, onDelete },
        ...over,
      })
    )
  );
  return {
    onSwipe,
    onSchedule,
    onDelete,
    onOpen,
    open: q<HTMLElement>(".pk-row-open"),
    row: q<HTMLElement>(".pk-row"),
    wrap: q<HTMLElement>(".pk-rw"),
  };
}

/** A slow drag: 400 ms between events, so velocity is not a flick. */
function slowClock() {
  let t = 1000;
  jest.spyOn(performance, "now").mockImplementation(() => (t += 400));
}

const OPEN_AT = /^translate3d\(-168(\.0)?px,0,0\)$/;

const drag = (el: Element, from: number, to: number) => {
  fire(el, "pointerdown", { x: from, y: 10 });
  fire(window, "pointermove", { x: to, y: 12 });
  fire(window, "pointerup", { x: to, y: 12 });
};

describe("swipe left", () => {
  it("rests open past the snap point, showing Schedule and Delete", () => {
    const { open, row, wrap, onSwipe } = mount();
    drag(open, 300, 200);
    expect(row.style.transform).toMatch(OPEN_AT);
    expect(wrap.getAttribute("data-pk-side")).toBe("actions");
    expect(wrap.classList.contains("is-open")).toBe(true);
    expect(onSwipe).not.toHaveBeenCalled();
    const labels = [...host.querySelectorAll(".pk-act")].map(
      (b) => b.textContent
    );
    expect(labels).toEqual(["Schedule", "Delete"]);
  });

  it("goes home after a short, slow drag", () => {
    slowClock();
    const { open, row, wrap } = mount();
    drag(open, 300, 270);
    expect(row.style.transform).toBe("");
    expect(wrap.classList.contains("is-open")).toBe(false);
  });

  it("follows the finger by transform only, with rubber band past the buttons", () => {
    const { open, row } = mount();
    fire(open, "pointerdown", { x: 350, y: 10 });
    fire(window, "pointermove", { x: 350 - 168 - 150, y: 12 });
    // the write is one rAF away; the offset after release is the settled one,
    // so read the move through a release at that point
    fire(window, "pointerup", { x: 0, y: 12 });
    expect(row.style.transform).toMatch(OPEN_AT);
    expect(row.style.left).toBe("");
    expect(row.style.width).toBe("");
  });

  it("Schedule shuts the row and asks the parent", () => {
    const { open, row, onSchedule } = mount();
    drag(open, 300, 200);
    act(() => {
      q<HTMLButtonElement>(".pk-act.is-schedule").click();
    });
    expect(onSchedule).toHaveBeenCalledTimes(1);
    expect(row.style.transform).toBe("");
  });

  it("Delete throws the row off the edge and asks the parent", () => {
    const { open, wrap, onDelete } = mount();
    drag(open, 300, 200);
    act(() => {
      q<HTMLButtonElement>(".pk-act.is-delete").click();
    });
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(wrap.classList.contains("is-thrown")).toBe(true);
  });

  it("a tap on an open row shuts it instead of opening the task", () => {
    const { open, row, onOpen } = mount();
    drag(open, 300, 200);
    // let the swipe-is-not-a-tap guard (300 ms) pass
    jest.spyOn(performance, "now").mockReturnValue(performance.now() + 1000);
    act(() => {
      open.click();
    });
    expect(onOpen).not.toHaveBeenCalled();
    expect(row.style.transform).toBe("");
  });

  it("a touch anywhere else shuts it", () => {
    const { open, row } = mount();
    drag(open, 300, 200);
    expect(row.style.transform).not.toBe("");
    fire(document.body, "pointerdown", { x: 5, y: 5 });
    expect(row.style.transform).toBe("");
  });

  it("opening one row shuts the other", () => {
    act(() =>
      root.render(
        h("div", null, [
          h(PkRow, {
            key: "a",
            id: "a",
            title: "A",
            canDone: true,
            onSwipe: () => {},
            actions: { onDelete: () => {} },
          }),
          h(PkRow, {
            key: "b",
            id: "b",
            title: "B",
            canDone: true,
            onSwipe: () => {},
            actions: { onDelete: () => {} },
          }),
        ])
      )
    );
    const [a, b] = [...host.querySelectorAll<HTMLElement>(".pk-row-open")];
    const rows = [...host.querySelectorAll<HTMLElement>(".pk-row")];
    drag(a, 300, 200);
    expect(rows[0].style.transform).not.toBe("");
    drag(b, 300, 200);
    expect(rows[0].style.transform).toBe("");
    expect(rows[1].style.transform).not.toBe("");
  });
});

describe("swipe right and scrolling", () => {
  it("still completes, with the reveal behind it", () => {
    const { open, onSwipe } = mount();
    drag(open, 10, 160);
    expect(onSwipe).toHaveBeenCalledWith("done");
  });

  it("does not hijack a vertical scroll", () => {
    const { open, row } = mount();
    fire(open, "pointerdown", { x: 100, y: 10 });
    const move = fire(window, "pointermove", { x: 104, y: 120 });
    fire(window, "pointerup", { x: 104, y: 120 });
    expect(move.defaultPrevented).toBe(false);
    expect(row.style.transform).toBe("");
  });

  it("a horizontal drag does claim the gesture", () => {
    const { open } = mount();
    fire(open, "pointerdown", { x: 300, y: 10 });
    const move = fire(window, "pointermove", { x: 220, y: 12 });
    expect(move.defaultPrevented).toBe(true);
    fire(window, "pointerup", { x: 220, y: 12 });
  });
});

describe("haptics on the row", () => {
  it("ticks once when the swipe crosses its threshold, not before", () => {
    const { open } = mount();
    fire(open, "pointerdown", { x: 300, y: 10 });
    fire(window, "pointermove", { x: 280, y: 12 });
    expect(vibrate).not.toHaveBeenCalled();
    fire(window, "pointermove", { x: 200, y: 12 });
    expect(vibrate).toHaveBeenCalledTimes(1);
    fire(window, "pointermove", { x: 190, y: 12 });
    expect(vibrate).toHaveBeenCalledTimes(1);
    fire(window, "pointerup", { x: 190, y: 12 });
  });

  it("ticks at the complete threshold and pulses on complete", () => {
    const { open } = mount();
    fire(open, "pointerdown", { x: 10, y: 10 });
    fire(window, "pointermove", { x: 130, y: 12 });
    expect(vibrate).toHaveBeenCalledTimes(1);
    fire(window, "pointerup", { x: 130, y: 12 });
    expect(vibrate).toHaveBeenCalledTimes(2);
  });

  it("pulses when the check ring completes a task", () => {
    mount({ done: false });
    act(() => {
      q<HTMLButtonElement>(".pk-check").click();
    });
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it("does nothing where vibrate is missing (iOS)", () => {
    delete (navigator as { vibrate?: unknown }).vibrate;
    const { open, onSwipe } = mount();
    drag(open, 10, 160);
    expect(onSwipe).toHaveBeenCalledWith("done");
    expect(vibrate).not.toHaveBeenCalled();
  });
});
