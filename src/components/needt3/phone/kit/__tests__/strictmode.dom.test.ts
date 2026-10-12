/**
 * @jest-environment jsdom
 *
 * A sheet that mounts already open and grows out of a rect (the composer, opened
 * from the pill) must still morph when React's StrictMode (dev, and the e2e
 * suite that runs against `next dev`) unmounts and remounts it once. The
 * unmount cleanup cancelled the morph's frame and left the sheet "open", so the
 * remount found nothing to start: the sheet sat at the pill's clip for good
 * (found by the P12 audit in a dev server; a production build has no
 * double mount).
 */
import { StrictMode, act, createElement as h } from "react";

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

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.useFakeTimers();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = RO;
  jest
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(() => null);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

const frames = (n: number) =>
  act(() => {
    for (let i = 0; i < n; i++) jest.advanceTimersByTime(16);
  });

describe("PkSheet under StrictMode", () => {
  it("a sheet that mounts open still morphs out of its rect and settles", () => {
    act(() =>
      root.render(
        h(
          StrictMode,
          null,
          h(
            PkSheet,
            {
              open: true,
              title: "New task",
              from: { x: 77, y: 752, w: 236, h: 64, r: 32 },
            },
            h("p", null, "body")
          )
        )
      )
    );
    const layer = host.querySelector<HTMLElement>(".pk-sheet-layer")!;
    const sheet = host.querySelector<HTMLElement>(".pk-sheet")!;
    // it is morphing (the clip is the pill's) …
    expect(layer.classList.contains("is-morphing")).toBe(true);
    // … and it keeps moving: the clip changes from frame to frame …
    const first = sheet.style.clipPath;
    frames(6);
    expect(sheet.style.clipPath).not.toBe(first);
    // … until it has grown into the sheet: no clip, no morphing class.
    frames(120);
    expect(layer.classList.contains("is-morphing")).toBe(false);
    expect(sheet.style.clipPath).toBe("");
  });
});
