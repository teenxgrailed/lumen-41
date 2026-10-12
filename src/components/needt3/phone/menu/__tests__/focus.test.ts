/**
 * @jest-environment jsdom
 *
 * Menu A's focus and inert contract, mounted for real with reduced motion on
 * (so a stop is reached at once): opening moves focus to the first tile and
 * makes the screen host inert, closing returns focus to the Every place
 * button, and `away` makes the menu inert instead of aria-hidden.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { Menu, type MenuProps } from "../Menu";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const base: MenuProps = {
  side: "light",
  screen: "home",
  tiles: ["home", "docs", "ask"],
  counts: { overdue: 0, today: 0, mail: 0 },
  me: { name: "Maksym", initial: "M", plan: "Free", pro: false },
  onPick: () => {},
  onSettings: () => {},
};

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let host: HTMLDivElement;
let root: Root;

const mount = (over: Partial<MenuProps> = {}) =>
  act(() =>
    root.render(
      h(
        "div",
        { "data-v2p-frame": "" },
        h("main", { "data-v2p-host": "" }, h("button", { id: "behind" })),
        h(Menu, { ...base, ...over })
      )
    )
  );

const q = <T extends Element>(sel: string) => host.querySelector<T>(sel)!;

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = RO;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("Menu A focus and inert", () => {
  it("opening the card focuses the first tile and makes the screen inert", () => {
    mount();
    const dots = q<HTMLButtonElement>("[data-nva-open]");
    expect(dots.getAttribute("aria-expanded")).toBe("false");
    expect(q("[data-v2p-host]").hasAttribute("inert")).toBe(false);
    dots.focus();
    act(() => dots.click());
    expect(q("[data-nva-mode]").getAttribute("data-nva-mode")).toBe("card");
    expect(q("[data-nva-open]").getAttribute("aria-expanded")).toBe("true");
    expect(q("[data-v2p-host]").hasAttribute("inert")).toBe(true);
    expect(document.activeElement).toBe(q("[data-nva-tile]"));
    expect(q("[data-nva-tile]").getAttribute("data-nva-tile")).toBe("home");
  });

  it("closing returns focus to the Every place button and frees the screen", () => {
    mount();
    const dots = q<HTMLButtonElement>("[data-nva-open]");
    act(() => dots.click());
    expect(document.activeElement).toBe(q("[data-nva-tile]"));
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(q("[data-nva-mode]").getAttribute("data-nva-mode")).toBe("pill");
    expect(q("[data-v2p-host]").hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(q("[data-nva-open]"));
    expect(q("[data-nva-open]").getAttribute("aria-expanded")).toBe("false");
  });

  it("the button's aria-controls names the card region", () => {
    mount();
    const id = q("[data-nva-open]").getAttribute("aria-controls");
    expect(id).toBeTruthy();
    expect(document.getElementById(id!)?.className).toBe("nva-content");
  });

  it("away takes the menu out of focus order with inert, not aria-hidden", () => {
    mount({ away: true });
    const menu = q(".nva");
    expect(menu.hasAttribute("inert")).toBe(true);
    expect(menu.hasAttribute("aria-hidden")).toBe(false);
    mount({ away: false });
    expect(q(".nva").hasAttribute("inert")).toBe(false);
  });

  it("unmounting while open frees the screen", () => {
    mount();
    act(() => q<HTMLButtonElement>("[data-nva-open]").click());
    expect(q("[data-v2p-host]").hasAttribute("inert")).toBe(true);
    act(() =>
      root.render(
        h(
          "div",
          { "data-v2p-frame": "" },
          h("main", { "data-v2p-host": "" }, h("button", { id: "behind" }))
        )
      )
    );
    expect(q("[data-v2p-host]").hasAttribute("inert")).toBe(false);
  });
});
