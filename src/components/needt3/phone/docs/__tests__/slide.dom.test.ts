/**
 * @jest-environment jsdom
 *
 * The reader's left-edge swipe, mounted for real: the finger from the edge
 * moves the page 1:1 and a release past the threshold goes back; a
 * pointercancel never does; a second finger's pointerdown and another
 * finger's up change nothing; a press outside the edge strip, a vertical
 * start and a disabled reader do nothing; unmounting in the middle of a swipe
 * lets go of every listener; the click that ends a swipe is swallowed.
 */
import { act, createElement as h, useRef } from "react";

import { type Root, createRoot } from "react-dom/client";

import { useReaderSlide } from "../useReaderSlide";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const onGone = jest.fn();
const onTap = jest.fn();

function Harness({ enabled = true }: { enabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const s = useReaderSlide({ rootRef: ref, onGone, enabled });
  return h(
    "div",
    {
      ref,
      "data-root": "",
      onPointerDown: s.onPointerDown,
      onClickCapture: s.onClickCapture,
    },
    h("button", { type: "button", "data-tap": "", onClick: onTap }, "tap")
  );
}

let host: HTMLDivElement;
let root: Root;

function pointer(
  type: string,
  p: { x?: number; y?: number; id?: number } = {}
) {
  const e = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: p.x ?? 0,
    clientY: p.y ?? 0,
  });
  Object.defineProperty(e, "pointerId", { value: p.id ?? 1 });
  Object.defineProperty(e, "pointerType", { value: "touch" });
  return e;
}
const fire = (el: Element | Window, type: string, p = {}) =>
  act(() => {
    el.dispatchEvent(pointer(type, p));
  });
const wait = (ms: number) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
const frames = () => wait(40);

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

const el = () => host.querySelector<HTMLElement>("[data-root]")!;

function mount(enabled = true) {
  act(() => root.render(h(Harness, { enabled })));
}

beforeEach(() => {
  onGone.mockClear();
  onTap.mockClear();
  reduced(true);
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get: () => 400,
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  jest.restoreAllMocks();
  act(() => root.unmount());
  host.remove();
  delete (HTMLElement.prototype as { offsetWidth?: number }).offsetWidth;
});

describe("edge swipe back", () => {
  it("opens at rest under reduced motion and slides in otherwise", () => {
    mount();
    expect(el().style.transform).toBe("");
    act(() => root.unmount());
    root = createRoot(host);
    reduced(false);
    mount();
    expect(el().style.transform).toBe("translate3d(400.0px,0,0)");
    expect(el().hasAttribute("data-pd-sliding")).toBe(true);
  });

  it("follows the finger 1:1 and goes back past the threshold, from the last move", async () => {
    mount();
    fire(el(), "pointerdown", { x: 8, y: 300 });
    fire(window, "pointermove", { x: 100, y: 304 });
    fire(window, "pointermove", { x: 308, y: 306 });
    await frames();
    expect(el().style.transform).toBe("translate3d(300.0px,0,0)");
    expect(el().classList.contains("is-dragging")).toBe(true);
    // the up event's own coordinates are not trusted: the last move decided
    fire(window, "pointerup", { x: 0, y: 0 });
    expect(onGone).toHaveBeenCalledTimes(1);
    expect(el().classList.contains("is-dragging")).toBe(false);
  });

  it("a short, slow drag springs back and goes nowhere", async () => {
    mount();
    fire(el(), "pointerdown", { x: 8, y: 300 });
    await wait(150);
    fire(window, "pointermove", { x: 40, y: 301 });
    await frames();
    fire(window, "pointerup", { x: 40, y: 301 });
    expect(onGone).not.toHaveBeenCalled();
    expect(el().style.transform).toBe("");
  });

  it("a pointercancel never goes back, however far the page had come", async () => {
    mount();
    fire(el(), "pointerdown", { x: 8, y: 300 });
    fire(window, "pointermove", { x: 350, y: 300 });
    await frames();
    fire(window, "pointercancel", {});
    expect(onGone).not.toHaveBeenCalled();
    expect(el().style.transform).toBe("");
    expect(el().classList.contains("is-dragging")).toBe(false);
    // and the swipe is over: later events change nothing
    fire(window, "pointerup", { x: 390, y: 300 });
    expect(onGone).not.toHaveBeenCalled();
  });

  it("ignores a second pointerdown and another finger's release", async () => {
    mount();
    const added = jest.spyOn(window, "addEventListener");
    fire(el(), "pointerdown", { x: 8, y: 300, id: 1 });
    fire(el(), "pointerdown", { x: 12, y: 320, id: 2 });
    // one tracked stream, not two
    expect(added.mock.calls.filter((c) => c[0] === "pointermove")).toHaveLength(
      1
    );
    fire(window, "pointermove", { x: 330, y: 302, id: 1 });
    fire(window, "pointerup", { x: 400, y: 10, id: 2 });
    expect(onGone).not.toHaveBeenCalled();
    fire(window, "pointermove", { x: 340, y: 302, id: 1 });
    fire(window, "pointerup", { x: 0, y: 0, id: 1 });
    expect(onGone).toHaveBeenCalledTimes(1);
  });

  it("does nothing for a press outside the edge strip", () => {
    mount();
    fire(el(), "pointerdown", { x: 120, y: 300 });
    fire(window, "pointermove", { x: 380, y: 300 });
    fire(window, "pointerup", { x: 380, y: 300 });
    expect(onGone).not.toHaveBeenCalled();
    expect(el().style.transform).toBe("");
  });

  it("a vertical start is a scroll, not a back swipe", async () => {
    mount();
    fire(el(), "pointerdown", { x: 8, y: 300 });
    fire(window, "pointermove", { x: 10, y: 340 });
    fire(window, "pointermove", { x: 300, y: 350 });
    await frames();
    fire(window, "pointerup", { x: 300, y: 350 });
    expect(onGone).not.toHaveBeenCalled();
    expect(el().style.transform).toBe("");
  });

  it("a leftward start is not a back swipe either", () => {
    mount();
    fire(el(), "pointerdown", { x: 8, y: 300 });
    fire(window, "pointermove", { x: 0, y: 301 });
    fire(window, "pointermove", { x: 300, y: 301 });
    fire(window, "pointerup", { x: 300, y: 301 });
    expect(onGone).not.toHaveBeenCalled();
  });

  it("is off while typing, a sheet or the menu is up", () => {
    mount(false);
    fire(el(), "pointerdown", { x: 8, y: 300 });
    fire(window, "pointermove", { x: 330, y: 300 });
    fire(window, "pointerup", { x: 330, y: 300 });
    expect(onGone).not.toHaveBeenCalled();
  });

  it("lets go of every listener when it unmounts in the middle of a swipe", () => {
    mount();
    const removed = jest.spyOn(window, "removeEventListener");
    fire(el(), "pointerdown", { x: 8, y: 300 });
    fire(window, "pointermove", { x: 200, y: 300 });
    act(() => root.unmount());
    const types = removed.mock.calls.map((c) => c[0]);
    expect(types).toEqual(
      expect.arrayContaining(["pointermove", "pointerup", "pointercancel"])
    );
    fire(window, "pointermove", { x: 390, y: 300 });
    fire(window, "pointerup", { x: 390, y: 300 });
    expect(onGone).not.toHaveBeenCalled();
    root = createRoot(host);
  });

  it("swallows the click a swipe ends with, and only that one", async () => {
    mount();
    fire(el(), "pointerdown", { x: 8, y: 300 });
    await wait(150);
    fire(window, "pointermove", { x: 40, y: 301 });
    await frames();
    fire(window, "pointerup", { x: 40, y: 301 });
    expect(onGone).not.toHaveBeenCalled();
    act(() => {
      host.querySelector<HTMLElement>("[data-tap]")!.click();
    });
    expect(onTap).not.toHaveBeenCalled();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 320));
    });
    act(() => {
      host.querySelector<HTMLElement>("[data-tap]")!.click();
    });
    expect(onTap).toHaveBeenCalledTimes(1);
  });
});
