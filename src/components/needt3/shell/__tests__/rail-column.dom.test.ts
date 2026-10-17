/**
 * @jest-environment jsdom
 *
 * The wide rail: one-step width, the page's motion written to the row in the
 * same commit, and no re-render of the component that holds it.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { RailColumn } from "../RailColumn";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
let parentRenders = 0;

function Parent({ focusMode = false }) {
  parentRenders += 1;
  return h(
    "div",
    { className: "shell-app-row" },
    h(RailColumn, { focusMode, children: "rail" })
  );
}
const row = () => host.querySelector<HTMLElement>(".shell-app-row")!;
const col = () => host.querySelector<HTMLElement>(".sb-shell")!;

beforeEach(() => {
  useNeedt3Ui.getState().setSidebarOpen(true);
  parentRenders = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("RailColumn", () => {
  it("starts at rest, and changes width in one step with the motion on the row", () => {
    act(() => root.render(h(Parent)));
    expect(row().dataset.motion).toBeUndefined();
    expect(col().className).not.toContain("is-hidden");
    act(() => void useNeedt3Ui.getState().setSidebarOpen(false));
    expect(col().style.width).toBe("0px");
    expect(row().dataset.motion).toBe("rail-out");
    act(() => void useNeedt3Ui.getState().setSidebarOpen(true));
    expect(row().dataset.motion).toBe("rail-in");
  });

  it("Focus Mode hides it the same way", () => {
    act(() => root.render(h(Parent)));
    act(() => root.render(h(Parent, { focusMode: true })));
    expect(row().dataset.motion).toBe("rail-out");
    expect(col().className).toContain("is-hidden");
  });

  it("toggling does not re-render the parent", () => {
    act(() => root.render(h(Parent)));
    const before = parentRenders;
    act(() => void useNeedt3Ui.getState().setSidebarOpen(false));
    act(() => void useNeedt3Ui.getState().setSidebarOpen(true));
    expect(parentRenders).toBe(before);
  });
});
