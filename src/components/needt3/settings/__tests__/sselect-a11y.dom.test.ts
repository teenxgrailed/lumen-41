/**
 * @jest-environment jsdom
 */
import { act, createElement as h } from "react";

import { readFileSync } from "fs";
import { join } from "path";
import { type Root, createRoot } from "react-dom/client";

import { SSelect } from "../kit";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../ctx/PortalScope", () => ({
  useV3PortalContainer: () => document.body,
}));

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

const OPTS = [
  ["light", "Light"],
  ["dark", "Dark"],
] as const;

it("keeps the label as the name and describes the current value", () => {
  act(() =>
    root.render(
      h(SSelect, {
        value: "dark",
        options: OPTS,
        onChange: () => {},
        label: "Theme",
      })
    )
  );
  const btn = host.querySelector("button")!;
  expect(btn.getAttribute("aria-label")).toBe("Theme");
  const desc = document.getElementById(btn.getAttribute("aria-describedby")!);
  expect(desc?.textContent).toBe("Dark");
});

it("announces the menu it opens, not a listbox", () => {
  act(() =>
    root.render(
      h(SSelect, {
        value: "light",
        options: OPTS,
        onChange: () => {},
        label: "Theme",
      })
    )
  );
  expect(host.querySelector("button")!.getAttribute("aria-haspopup")).toBe(
    "menu"
  );
});

it("draws the keyboard-highlighted menu row", () => {
  const css = readFileSync(
    join(__dirname, "../../../../styles/v3/app.css"),
    "utf8"
  );
  const rule = css.match(
    /\.menu-row\[data-highlighted\],\s*\.needt-v3 \.menu-row:focus-visible\s*\{([^}]*)\}/
  );
  expect(rule).not.toBeNull();
  expect(rule![1]).toContain("background: var(--fill-5)");
  expect(rule![1]).toContain("inset 0 0 0 1px var(--text-quaternary)");
  expect(css).toMatch(
    /\.needt-v3 button\.menu-row \{ background: transparent; \}/
  );
});

it("does not tick or ring a checked menu row (it outgrew the menu and flashed a scrollbar)", () => {
  const read = (rel: string) => readFileSync(join(__dirname, rel), "utf8");
  for (const [file, scope] of [
    ["../../../../styles/v3/app.css", ".needt-v3"],
    ["../../../../styles/needt-motion.css", ".needt-v2"],
  ] as const) {
    const css = read(file);
    // The global tick still exists for marks ...
    expect(css).toContain(`${scope} [aria-checked="true"] { animation:`);
    // ... and rows opt out of it, for both attributes Radix sets.
    for (const attr of ['[aria-checked="true"]', '[data-state="checked"]']) {
      const rule = css.match(
        new RegExp(
          `\\${scope}\\s*:is\\(\\[role="menuitemradio"\\], \\[role="menuitemcheckbox"\\], \\[role="option"\\]\\)${attr.replace(/[[\]"=]/g, "\\$&")}`
        )
      );
      expect(rule).not.toBeNull();
    }
    expect(css).toMatch(/\{ animation: none; \}\n/);
  }
  // The Settings menu never has a sideways scroll axis.
  expect(read("../kit.tsx")).toMatch(
    /overflowY: "auto",[\s\S]{0,200}overflowX: "hidden"/
  );
});
