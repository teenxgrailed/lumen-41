/**
 * @jest-environment jsdom
 *
 * The notification anchor is mounted by the old AppShell beside every screen,
 * flag on or off. It carries `.needt-v2` so the design's tokens resolve, and
 * `.needt-v2` is also the design's page scope, which paints the canvas
 * (`background: var(--background)` in needt-ds-tokens.css). An anchor that
 * inherits that paint is an opaque 388 px slab over the right of every
 * screen: the whole window on a phone, half of it on a tablet. The visual
 * suite caught it as blank mobile snapshots.
 */
import { act, createElement as h } from "react";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Root, createRoot } from "react-dom/client";

import { NeedtNotices } from "../NeedtNotices";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../use-resolved-theme", () => ({
  useResolvedTheme: () => "dark",
}));

const CANVAS = "rgb(19, 20, 23)";

/** The `.needt-v2` base rule exactly as shipped, with the token resolved. */
function shippedScopeRule(): string {
  const css = readFileSync(
    join(process.cwd(), "src/styles/needt-ds-tokens.css"),
    "utf8"
  );
  const rule = [...css.matchAll(/^\.needt-v2\s*\{[^}]*\}/gm)]
    .map((m) => m[0])
    .find((r) => /background:\s*var\(--background\)/.test(r));
  if (!rule) throw new Error("the .needt-v2 canvas rule moved");
  return rule.replace("var(--background)", CANVAS);
}

let host: HTMLDivElement;
let root: Root;
let sheet: HTMLStyleElement;

beforeEach(() => {
  sheet = document.createElement("style");
  sheet.textContent = shippedScopeRule();
  document.head.appendChild(sheet);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  sheet.remove();
});

it("does not paint the design canvas over the screen it sits beside", () => {
  act(() => root.render(h(NeedtNotices)));
  const anchor = host.querySelector<HTMLElement>(".needt-notices");
  expect(anchor).not.toBeNull();
  // The shipped rule does reach it: the class is what resolves the tokens.
  expect(anchor!.matches(".needt-v2")).toBe(true);
  const bg = getComputedStyle(anchor!).backgroundColor;
  expect(bg).not.toBe(CANVAS);
  expect(["transparent", "rgba(0, 0, 0, 0)"]).toContain(bg);
});
