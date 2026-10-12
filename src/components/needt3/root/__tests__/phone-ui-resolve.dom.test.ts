/**
 * @jest-environment jsdom
 *
 * The frame follows the width both ways after hydration: phone → desktop as
 * well as desktop → phone, including a width change that arrives without a
 * media-query event (a hidden tab, a browser that only fires resize).
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import type { PhoneUi } from "@/lib/needt3/phone-ui";

import { useResolvedPhoneUi } from "../phone-ui-context";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** A matchMedia stand-in whose answer the test sets, with or without events. */
function installMatchMedia(initial: boolean) {
  const listeners = new Set<(e: { matches: boolean }) => void>();
  const mq = {
    matches: initial,
    media: "",
    addEventListener: (_: string, fn: (e: { matches: boolean }) => void) =>
      listeners.add(fn),
    removeEventListener: (_: string, fn: (e: { matches: boolean }) => void) =>
      listeners.delete(fn),
  };
  window.matchMedia = jest.fn(() => mq) as unknown as typeof window.matchMedia;
  return {
    /** The width crosses 700 px and the browser says so. */
    change(narrow: boolean) {
      mq.matches = narrow;
      act(() => listeners.forEach((fn) => fn({ matches: narrow })));
    },
    /** The width crosses 700 px and no media-query event arrives. */
    silently(narrow: boolean) {
      mq.matches = narrow;
    },
  };
}

let host: HTMLDivElement;
let root: Root;

function Probe({ initial, forced }: { initial: PhoneUi; forced: boolean }) {
  const ui = useResolvedPhoneUi(initial, forced);
  return h("div", { "data-ui": ui });
}

const ui = () => host.querySelector("[data-ui]")?.getAttribute("data-ui");
const render = (initial: PhoneUi, forced = false) =>
  act(() => root.render(h(Probe, { initial, forced })));

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("useResolvedPhoneUi", () => {
  it("a page loaded as phone becomes the desktop when widened", () => {
    const mm = installMatchMedia(true);
    render("phone");
    expect(ui()).toBe("phone");
    mm.change(false);
    expect(ui()).toBe("desktop");
    mm.change(true);
    expect(ui()).toBe("phone");
  });

  it("a page loaded as desktop becomes the phone when narrowed", () => {
    const mm = installMatchMedia(false);
    render("desktop");
    expect(ui()).toBe("desktop");
    mm.change(true);
    expect(ui()).toBe("phone");
  });

  it("re-reads the width on resize when no media-query event arrived", () => {
    const mm = installMatchMedia(true);
    render("phone");
    mm.silently(false);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(ui()).toBe("desktop");
  });

  it("re-reads the width when a hidden tab comes back", () => {
    const mm = installMatchMedia(true);
    render("phone");
    mm.silently(false);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(ui()).toBe("desktop");
  });

  it("a side pinned by the cookie ignores the width", () => {
    const mm = installMatchMedia(true);
    render("desktop", true);
    mm.change(true);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(ui()).toBe("desktop");
  });
});
