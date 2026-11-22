/**
 * @jest-environment jsdom
 *
 * A sheet opens and closes in each of the three looks the account can pick
 * (`data-sheet-style` on the v3 frame): the pop-up moves on a CSS ease
 * (transform and opacity, no spring, no clip morph); the docked sheet keeps its
 * spring; the white one wears the light plate. Reduced motion jumps.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { PkSheet } from "..";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let frame: HTMLDivElement;
let host: HTMLDivElement;
let root: Root;
let reduced = false;

beforeEach(() => {
  jest.useFakeTimers();
  reduced = false;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: reduced && query.includes("reduce"),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = RO;
  frame = document.createElement("div");
  frame.className = "needt-v3";
  host = document.createElement("div");
  frame.appendChild(host);
  document.body.appendChild(frame);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  frame.remove();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

const settle = () =>
  act(() => {
    jest.advanceTimersByTime(900);
  });

function mount(open: boolean, onShut?: () => void) {
  act(() =>
    root.render(
      h(
        PkSheet,
        {
          open,
          title: "New task",
          onShut,
          from: { x: 1, y: 2, w: 200, h: 60, r: 30 },
        },
        h("p", null, "body")
      )
    )
  );
}
const layer = () => host.querySelector<HTMLElement>(".pk-sheet-layer")!;
const sheet = () => host.querySelector<HTMLElement>(".pk-sheet")!;

describe("pop-up sheet (the default: a frame with no choice yet)", () => {
  it("opens on a CSS ease, never morphs, and is put away after the ease", () => {
    const shut = jest.fn();
    mount(false, shut);
    mount(true, shut);
    expect(layer().classList.contains("is-pop-anim")).toBe(true);
    expect(layer().classList.contains("is-morphing")).toBe(false);
    expect(layer().style.getPropertyValue("--pk-pop-ms")).toBe("280ms");
    expect(sheet().style.transform).toContain("translate3d(0,0.0px,0)");
    expect(sheet().style.opacity).toBe("");
    settle();
    expect(layer().classList.contains("is-pop-anim")).toBe(false);
    expect(layer().style.visibility).toBe("visible");

    mount(false, shut);
    expect(layer().classList.contains("is-pop-anim")).toBe(true);
    expect(sheet().style.opacity).toBe("0");
    // still visible while it leaves
    expect(layer().style.visibility).toBe("visible");
    expect(shut).not.toHaveBeenCalled();
    settle();
    expect(layer().style.visibility).toBe("hidden");
    expect(shut).toHaveBeenCalledTimes(1);
  });

  it("jumps with reduced motion: no ease at all", () => {
    reduced = true;
    mount(false);
    mount(true);
    expect(layer().classList.contains("is-pop-anim")).toBe(false);
    expect(sheet().style.transform).toContain("translate3d(0,0.0px,0)");
    mount(false);
    expect(layer().classList.contains("is-pop-anim")).toBe(false);
    expect(layer().style.visibility).toBe("hidden");
  });
});

describe("docked sheet (classic)", () => {
  it("keeps the spring: no pop class, settles open and shut by frames", () => {
    frame.setAttribute("data-sheet-style", "classic");
    const shut = jest.fn();
    mount(false, shut);
    mount(true, shut);
    expect(layer().classList.contains("is-pop-anim")).toBe(false);
    expect(layer().classList.contains("is-morphing")).toBe(true);
    settle();
    expect(layer().classList.contains("is-morphing")).toBe(false);
    expect(sheet().classList.contains("paper")).toBe(false);
    mount(false, shut);
    settle();
    expect(layer().style.visibility).toBe("hidden");
    expect(shut).toHaveBeenCalled();
  });
});

describe("white sheet", () => {
  it("is the docked sheet on the light plate", () => {
    frame.setAttribute("data-sheet-style", "white");
    mount(false);
    mount(true);
    expect(sheet().classList.contains("paper")).toBe(true);
    expect(layer().classList.contains("is-pop-anim")).toBe(false);
    settle();
    mount(false);
    settle();
    expect(layer().style.visibility).toBe("hidden");
  });
});
