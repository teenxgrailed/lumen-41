/**
 * @jest-environment jsdom
 *
 * An installed iOS app whose viewport ends above the bottom of the display:
 * the phone scope gets the display's height, and only then.
 */
import { act, createElement as h, useRef } from "react";

import { type Root, createRoot } from "react-dom/client";

import { fullHeightFor, usePhoneFullHeight } from "../usePhoneFullHeight";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/navigation", () => ({ usePathname: () => "/" }));

const base = {
  standalone: true,
  innerWidth: 402,
  innerHeight: 812,
  screenWidth: 402,
  screenHeight: 874,
};

describe("fullHeightFor", () => {
  it("pins the display height when the standalone viewport is short", () => {
    expect(fullHeightFor(base)).toBe(874);
  });
  it("leaves a healthy viewport, a browser tab, landscape and the keyboard alone", () => {
    expect(fullHeightFor({ ...base, innerHeight: 874 })).toBeNull();
    expect(fullHeightFor({ ...base, standalone: false })).toBeNull();
    expect(
      fullHeightFor({ ...base, innerWidth: 874, innerHeight: 402 })
    ).toBeNull();
    expect(fullHeightFor({ ...base, innerHeight: 560 })).toBeNull();
  });
});

describe("usePhoneFullHeight", () => {
  let host: HTMLDivElement;
  let root: Root;
  function Probe({ enabled }: { enabled: boolean }) {
    const ref = useRef<HTMLDivElement>(null);
    usePhoneFullHeight(ref, enabled);
    return h("div", { ref, id: "scope" });
  }
  const set = (k: string, v: number) =>
    Object.defineProperty(window, k, { value: v, configurable: true });

  beforeEach(() => {
    set("innerWidth", 402);
    set("innerHeight", 812);
    Object.defineProperty(window, "screen", {
      value: { width: 402, height: 874 },
      configurable: true,
    });
    window.matchMedia = ((q: string) => ({
      matches: q.includes("standalone"),
    })) as typeof window.matchMedia;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("sets and clears the scope height as the viewport changes", () => {
    act(() => root.render(h(Probe, { enabled: true })));
    const el = document.getElementById("scope")!;
    expect(el.style.height).toBe("874px");
    set("innerHeight", 874);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(el.style.height).toBe("");
    act(() => root.render(h(Probe, { enabled: false })));
    expect(el.style.height).toBe("");
  });
});
