/**
 * @jest-environment jsdom
 *
 * The loading screen is the Needt logo and nothing else: no word, no fill, no
 * text. It wears the chosen icon, falls back to the default and then a plain
 * tile, breathes only once something is on screen, is still under reduced
 * motion, and a screen that takes over from one already up does not fade in
 * again.
 */
import { act, createElement as h } from "react";

import { readFileSync } from "node:fs";
import path from "node:path";
import { type AtRule, type Rule, parse } from "postcss";
import { type Root, createRoot } from "react-dom/client";

import { useAppIcon } from "@/store/app-icon";

import { NeedtLoading, resetLoadingScreens } from "../NeedtLoading";

let reduced = false;
jest.mock("@/components/providers/MotionRuntime", () => ({
  useNeedtReducedMotion: () => reduced,
}));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  reduced = false;
  resetLoadingScreens();
  useAppIcon.setState({ id: "midnight" });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const nodes = () => host.querySelectorAll<HTMLElement>("[data-needt-loading]");
const img = () => host.querySelector("img");
const logo = () => host.querySelector(".nl-logo")!;
const fire = (el: Element, type: "load" | "error") =>
  act(() => {
    el.dispatchEvent(new Event(type));
  });

describe("NeedtLoading", () => {
  it("renders the Needt app icon, eagerly, and no word or text", () => {
    act(() => root.render(h(NeedtLoading, {})));
    const el = nodes()[0];
    expect(el.getAttribute("aria-label")).toBe("Loading");
    expect(img()).not.toBeNull();
    expect(img()!.getAttribute("src") ?? "").toContain("/midnight/");
    expect(img()!.getAttribute("loading")).toBe("eager");
    expect(img()!.getAttribute("fetchpriority")).toBe("high");
    expect((el.textContent ?? "").trim()).toBe("");
    expect(el.querySelector(".nl-word, .nl-fill, .nl-base")).toBeNull();
  });

  it("wears the icon the person chose", () => {
    useAppIcon.setState({ id: "sky" });
    act(() => root.render(h(NeedtLoading, {})));
    expect(img()!.getAttribute("src") ?? "").toContain("/sky/");
  });

  it("falls back to the default icon, then to a plain tile", () => {
    useAppIcon.setState({ id: "sky" });
    act(() => root.render(h(NeedtLoading, {})));
    fire(img()!, "error");
    expect(img()!.getAttribute("src") ?? "").toContain("/midnight/");
    expect(host.querySelector(".nl-tile")).toBeNull();
    fire(img()!, "error");
    expect(img()).toBeNull();
    expect(host.querySelector(".nl-tile")).not.toBeNull();
    // the tile is something on screen: it may breathe
    expect(logo().className).toContain("nl-loaded");
  });

  it("breathes only after the icon has loaded", async () => {
    act(() => root.render(h(NeedtLoading, {})));
    expect(logo().className).not.toContain("nl-loaded");
    // next/image reports a load after the browser has decoded the file
    await act(async () => {
      img()!.dispatchEvent(new Event("load"));
      await new Promise((done) => setTimeout(done, 0));
    });
    expect(logo().className).toContain("nl-loaded");
  });

  it("is still under reduced motion", () => {
    reduced = true;
    act(() => root.render(h(NeedtLoading, {})));
    expect(nodes()[0].className).toContain("nl-still");
  });

  it("a screen that arrives while another is up is continued, the first is not", () => {
    const one = h(NeedtLoading, { key: "a" });
    act(() => root.render(h("div", null, one)));
    expect(nodes()[0].hasAttribute("data-continued")).toBe(false);
    act(() => root.render(h("div", null, one, h(NeedtLoading, { key: "b" }))));
    expect(nodes().length).toBe(2);
    expect(nodes()[0].hasAttribute("data-continued")).toBe(false);
    expect(nodes()[1].hasAttribute("data-continued")).toBe(true);
  });

  it("a Strict Mode remount of the same node is not a hand-over", () => {
    const { StrictMode } = jest.requireActual<typeof import("react")>("react");
    act(() => root.render(h(StrictMode, null, h(NeedtLoading, {}))));
    expect(nodes()[0].hasAttribute("data-continued")).toBe(false);
  });
});

describe("the loading css", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/styles/v3-overrides/needt-loading.css"),
    "utf8"
  );
  const sheet = parse(source);
  const rules = (inside?: AtRule) => {
    const out: Rule[] = [];
    (inside ?? sheet).walkRules((r) => {
      if (!inside && r.parent?.type === "atrule") return;
      out.push(r);
    });
    return out;
  };
  const decl = (rule: Rule | undefined, prop: string) => {
    let v: string | undefined;
    rule?.walkDecls(prop, (d) => {
      v = d.value;
    });
    return v;
  };
  const find = (list: Rule[], selector: string) =>
    list.find((r) =>
      r.selectors.some((s) => s.replace(/\s+/g, " ").trim() === selector)
    );
  const top = rules();
  const reducedBlock = (() => {
    let at: AtRule | undefined;
    sheet.walkAtRules("media", (a) => {
      if (/prefers-reduced-motion:\s*reduce/.test(a.params)) at = a;
    });
    return at!;
  })();

  it("the breathe is opacity and scale over 2.4 s, on the loaded logo only", () => {
    expect(
      decl(
        find(top, ":is(.needt-v3, .nl-host) .nl-logo.nl-loaded"),
        "animation"
      )
    ).toMatch(/^nl-breathe 2\.4s /);
    expect(
      decl(find(top, ":is(.needt-v3, .nl-host) .nl-logo"), "animation")
    ).toBe(undefined);
    let frames = "";
    sheet.walkAtRules("keyframes", (a) => {
      if (a.params === "nl-breathe") frames = a.toString();
    });
    expect(frames).toContain("scale(0.98)");
    expect(frames).toContain("scale(1)");
    expect(frames).toMatch(/opacity/);
    expect(source).not.toMatch(/clip-path|nl-fill|nl-word/);
  });

  it("reduced motion removes the breathe", () => {
    const inside = rules(reducedBlock);
    expect(
      decl(
        find(inside, ":is(.needt-v3, .nl-host) .nl-logo.nl-loaded"),
        "animation"
      )
    ).toBe("none");
  });

  it("a continued screen does not fade in again", () => {
    expect(
      decl(
        find(top, ":is(.needt-v3, .nl-host) .nl-root[data-continued]"),
        "animation"
      )
    ).toBe("none");
  });

  it("outside the v3 scope the ground is a literal colour, never transparent", () => {
    const literal = /^#[0-9a-f]{6}$/i;
    expect(decl(find(top, ".nl-host .nl-fixed"), "background")).toMatch(
      literal
    );
    const dark = rules(
      (() => {
        let at: AtRule | undefined;
        sheet.walkAtRules("media", (a) => {
          if (/prefers-color-scheme:\s*dark/.test(a.params)) at = a;
        });
        return at!;
      })()
    );
    expect(decl(find(dark, ".nl-host .nl-fixed"), "background")).toMatch(
      literal
    );
  });

  it("an explicit theme on <html> sets its own literal ground", () => {
    for (const theme of ["light", "paper", "warm", "dark", "dim"]) {
      const r = top.find((x) =>
        x.selectors.includes(`html[data-theme="${theme}"] .nl-host .nl-fixed`)
      );
      expect(decl(r, "background")).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
