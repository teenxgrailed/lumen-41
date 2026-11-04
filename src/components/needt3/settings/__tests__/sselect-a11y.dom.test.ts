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

it("names the control together with its current value", () => {
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
  expect(btn.getAttribute("aria-label")).toBe("Theme: Dark");
});

it("does not announce a listbox for what is a menu", () => {
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
  expect(host.querySelector("button")!.getAttribute("aria-haspopup")).not.toBe(
    "listbox"
  );
});

it("draws the keyboard-highlighted menu row", () => {
  const css = readFileSync(
    join(__dirname, "../../../../styles/v3/app.css"),
    "utf8"
  );
  expect(css).toMatch(/\.menu-row\[data-highlighted\]\s*\{[^}]*background/);
});
