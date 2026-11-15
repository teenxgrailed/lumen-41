/**
 * @jest-environment jsdom
 *
 * The loading screen is the Needt logo and nothing else: no word, no fill, no
 * text. Reduced motion leaves it still, and a screen that takes over from one
 * already up does not fade in again.
 */
import { act, createElement as h } from "react";

import { readFileSync } from "node:fs";
import path from "node:path";
import { type Root, createRoot } from "react-dom/client";

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
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const nodes = () => host.querySelectorAll<HTMLElement>("[data-needt-loading]");

describe("NeedtLoading", () => {
  it("renders the Needt app icon, and no word or text", () => {
    act(() => root.render(h(NeedtLoading, {})));
    const el = nodes()[0];
    expect(el.getAttribute("aria-label")).toBe("Loading");
    const img = el.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src") ?? "").toContain("app-icons");
    expect((el.textContent ?? "").trim()).toBe("");
    expect(el.querySelector(".nl-word, .nl-fill, .nl-base")).toBeNull();
  });

  it("breathes by default and is still under reduced motion", () => {
    act(() => root.render(h(NeedtLoading, {})));
    expect(nodes()[0].className).not.toContain("nl-still");
    act(() => root.render(h("div", null)));
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
});

describe("the loading css", () => {
  const css = readFileSync(
    path.join(process.cwd(), "src/styles/v3-overrides/needt-loading.css"),
    "utf8"
  );
  it("breathes in opacity and scale over 2.4 s and nothing else", () => {
    expect(css).toContain("nl-breathe 2.4s");
    expect(css).toMatch(/scale\(0\.98\)/);
    expect(css).not.toMatch(/clip-path|nl-fill|nl-word/);
  });
  it("reduced motion removes the breathe, and a continued screen the fade", () => {
    expect(css).toMatch(
      /prefers-reduced-motion: reduce\)[\s\S]*\.nl-logo[\s\S]*animation: none/
    );
    expect(css).toMatch(/\.nl-root\[data-continued\][\s\S]*animation: none/);
  });
});
