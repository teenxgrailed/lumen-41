/**
 * @jest-environment jsdom
 *
 * The loading word: real progress drives the fill, and reduced motion leaves a
 * still grey word with no animation at all.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { NeedtLoading } from "../NeedtLoading";
import { resetLoadingClock } from "../needtLoadingFill";

let reduced = false;
jest.mock("@/components/providers/MotionRuntime", () => ({
  useNeedtReducedMotion: () => reduced,
}));

let host: HTMLDivElement;
let root: Root;
let frames: jest.SpyInstance;

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  reduced = false;
  resetLoadingClock();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  frames = jest.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  frames.mockRestore();
});

const node = () => host.querySelector<HTMLElement>("[data-needt-loading]")!;

describe("NeedtLoading", () => {
  it("draws real progress as the fill", () => {
    act(() => root.render(h(NeedtLoading, { progress: 0.4 })));
    expect(node().getAttribute("data-fill")).toBe("0.400");
    expect(node().style.getPropertyValue("--nl-inset")).toBe("60%");
    act(() => root.render(h(NeedtLoading, { progress: 1 })));
    expect(node().style.getPropertyValue("--nl-inset")).toBe("0%");
  });

  it("says Needt once, in the word, and nothing else", () => {
    act(() => root.render(h(NeedtLoading, {})));
    expect(node().getAttribute("aria-label")).toBe("Loading");
    expect(node().querySelector(".nl-base")?.textContent).toBe("Needt");
    expect(node().querySelector(".nl-fill")?.textContent).toBe("Needt");
    expect(node().querySelectorAll("*").length).toBe(3);
  });

  it("with no progress, runs the eased fill from empty", () => {
    act(() => root.render(h(NeedtLoading, {})));
    expect(frames).toHaveBeenCalled();
    expect(node().getAttribute("data-fill")).toBe("0.000");
  });

  it("with reduced motion, is a still word: no frames, no fill", () => {
    reduced = true;
    act(() => root.render(h(NeedtLoading, {})));
    expect(frames).not.toHaveBeenCalled();
    expect(node().className).toContain("nl-still");
    expect(node().style.getPropertyValue("--nl-inset")).toBe("100%");
    // Even real progress does not animate the fill.
    act(() => root.render(h(NeedtLoading, { progress: 0.7 })));
    expect(node().style.getPropertyValue("--nl-inset")).toBe("100%");
  });

  it("the eased fill really ticks, slowing as it climbs", () => {
    frames.mockRestore();
    jest.useFakeTimers();
    try {
      act(() => root.render(h(NeedtLoading, {})));
      const read = () => Number(node().getAttribute("data-fill"));
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      const a = read();
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      const b = read();
      act(() => {
        jest.advanceTimersByTime(5000);
      });
      const c = read();
      expect(a).toBeGreaterThan(0);
      expect(b).toBeGreaterThan(a);
      expect(c).toBeGreaterThan(b);
      expect(b - a).toBeLessThan(a);
      expect(c).toBeLessThan(0.9);
    } finally {
      jest.useRealTimers();
    }
  });

  it("a second word continues the fill instead of starting from empty", () => {
    frames.mockRestore();
    jest.useFakeTimers();
    try {
      act(() => root.render(h(NeedtLoading, {})));
      act(() => {
        jest.advanceTimersByTime(3000);
      });
      const before = Number(node().getAttribute("data-fill"));
      expect(before).toBeGreaterThan(0.4);
      // The fallback goes, the route's own word arrives in the same turn.
      act(() => {
        root.render(h("div", { key: "other" }));
        root.render(h(NeedtLoading, {}));
      });
      expect(Number(node().getAttribute("data-fill"))).toBeGreaterThanOrEqual(
        before
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it("a word that arrives while another is up is marked continued, the first is not", () => {
    const one = h(NeedtLoading, { key: "a" });
    act(() => root.render(h("div", null, one)));
    expect(node().hasAttribute("data-continued")).toBe(false);
    act(() => root.render(h("div", null, one, h(NeedtLoading, { key: "b" }))));
    const all = host.querySelectorAll("[data-needt-loading]");
    expect(all.length).toBe(2);
    expect(all[0].hasAttribute("data-continued")).toBe(false);
    expect(all[1].hasAttribute("data-continued")).toBe(true);
  });
});
