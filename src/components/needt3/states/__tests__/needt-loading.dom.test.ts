/**
 * @jest-environment jsdom
 *
 * The loading word: real progress drives the fill, and reduced motion leaves a
 * still grey word with no animation at all.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { NeedtLoading } from "../NeedtLoading";

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
});
