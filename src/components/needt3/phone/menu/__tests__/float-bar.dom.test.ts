/**
 * @jest-environment jsdom
 *
 * The floating bottom bar and the picker that chooses it, mounted for real:
 * - the bar holds the places, + and the menu opener, five slots; the place
 *   you are in is the one solid circle, or the menu opener when you are
 *   somewhere the bar does not hold;
 * - a tap picks a place, opens the composer, opens the card;
 * - it steps out (inert) while the card, a cover or the composer is up;
 * - the picker shows both bars, marks the chosen one, reports a tap, and its
 *   previews hold no buttons of their own.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { BarStylePicker } from "../BarStylePicker";
import { FloatBar, type FloatBarProps } from "../FloatBar";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const q = <T extends Element>(sel: string) => host.querySelector<T>(sel);
const qa = (sel: string) => Array.from(host.querySelectorAll(sel));

function bar(p: Partial<FloatBarProps> = {}) {
  const calls = {
    pick: [] as string[],
    compose: 0,
    menu: 0,
  };
  act(() =>
    root.render(
      h(FloatBar, {
        side: "light",
        places: ["home", "docs", "ask"],
        screen: "home",
        onPick: (id) => calls.pick.push(id),
        onCompose: () => (calls.compose += 1),
        onMenu: () => (calls.menu += 1),
        ...p,
      })
    )
  );
  return calls;
}

describe("FloatBar", () => {
  it("holds five slots: three places, + and the menu opener", () => {
    bar();
    expect(qa(".nfb-slot")).toHaveLength(5);
    expect(
      qa("[data-nfb-place]").map((b) => b.getAttribute("data-nfb-place"))
    ).toEqual(["home", "docs", "ask"]);
    expect(q("[data-nfb-add]")?.getAttribute("aria-label")).toBe("New task");
    expect(q("[data-nfb-menu]")).not.toBeNull();
    expect(q("[data-nva-pill]")).not.toBeNull();
  });

  it("puts the one circle on the place you are in", () => {
    bar({ screen: "docs" });
    expect(qa(".nfb-slot.is-on")).toEqual([q('[data-nfb-place="docs"]')]);
    expect(q('[data-nfb-place="docs"]')?.getAttribute("aria-current")).toBe(
      "page"
    );
  });

  it("puts the circle on the menu opener when the place is not in the bar", () => {
    bar({ screen: "mail" });
    expect(qa(".nfb-slot.is-on")).toEqual([q("[data-nfb-menu]")]);
    expect(q("[data-nfb-menu]")?.getAttribute("aria-label")).toContain("Mail");
  });

  it("picks, composes and opens the card", () => {
    const calls = bar();
    act(() => q<HTMLButtonElement>('[data-nfb-place="ask"]')?.click());
    act(() => q<HTMLButtonElement>("[data-nfb-add]")?.click());
    act(() => q<HTMLButtonElement>("[data-nfb-menu]")?.click());
    expect(calls).toEqual({ pick: ["ask"], compose: 1, menu: 1 });
  });

  it("steps out while the card, a cover or the composer is up", () => {
    for (const p of [{ open: true }, { away: true }, { morph: true }]) {
      bar(p);
      expect(q(".nfb")?.classList.contains("is-out")).toBe(true);
      expect(q(".nfb")?.hasAttribute("inert")).toBe(true);
    }
    bar();
    expect(q(".nfb")?.classList.contains("is-out")).toBe(false);
  });

  it("stays out, with no blur, until the menu has settled (rule 12)", () => {
    bar({ moving: true });
    expect(q(".nfb")?.classList.contains("is-out")).toBe(true);
    expect(q(".nfb")?.hasAttribute("data-nva-moving")).toBe(true);
    bar();
    expect(q(".nfb")?.hasAttribute("data-nva-moving")).toBe(false);
  });

  it("marks its pill for the composer only while the card is at rest", () => {
    bar();
    expect(q(".nfb-pill")?.hasAttribute("data-nva-pill")).toBe(true);
    // the composer is up: the pill keeps its mark, it grows back into it
    bar({ morph: true });
    expect(q(".nfb-pill")?.hasAttribute("data-nva-pill")).toBe(true);
    bar({ open: true });
    expect(q("[data-nva-pill]")).toBeNull();
    bar({ moving: true });
    expect(q("[data-nva-pill]")).toBeNull();
  });

  it("wears the dark frost on the dark theme", () => {
    bar({ side: "dark" });
    expect(q(".nfb")?.classList.contains("is-dark")).toBe(true);
  });
});

describe("BarStylePicker", () => {
  function picker(value: "classic" | "float") {
    const picks: string[] = [];
    act(() =>
      root.render(
        h(BarStylePicker, {
          value,
          places: ["home", "docs", "ask"],
          side: "light",
          onChange: (s) => picks.push(s),
        })
      )
    );
    return picks;
  }

  it("shows both bars and marks the chosen one", () => {
    picker("float");
    const opts = qa("[data-bar-pick]");
    expect(opts.map((o) => o.getAttribute("data-bar-pick"))).toEqual([
      "classic",
      "float",
    ]);
    expect(q('[data-bar-pick="float"]')?.getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(q('[data-bar-pick="classic"]')?.getAttribute("aria-pressed")).toBe(
      "false"
    );
  });

  it("reports a tap", () => {
    const picks = picker("classic");
    act(() => q<HTMLButtonElement>('[data-bar-pick="float"]')?.click());
    expect(picks).toEqual(["float"]);
  });

  it("draws the previews without buttons or a pill the composer could grow from", () => {
    picker("classic");
    for (const opt of qa("[data-bar-pick]"))
      expect(opt.querySelector("button")).toBeNull();
    expect(q("[data-nva-pill]")).toBeNull();
    expect(q("nav")).toBeNull();
  });
});
