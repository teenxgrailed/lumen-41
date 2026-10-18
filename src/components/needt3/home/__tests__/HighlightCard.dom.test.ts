/**
 * @jest-environment jsdom
 *
 * The highlight card: one task, big, with a one-tap complete and Start focus;
 * a finished one is only its title.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { HighlightCard } from "../HighlightCard";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../phone/kit", () => ({
  PkButton: ({ children, ...p }: { children: string }) =>
    h("button", p, children),
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

const props = () => ({
  id: "t1",
  title: "Ship the report",
  meta: "Due today · 45 min",
  done: false,
  onComplete: jest.fn(),
  onFocus: jest.fn(),
  onClear: jest.fn(),
  onOpen: jest.fn(),
});
const render = (p: ReturnType<typeof props> & { phone?: boolean }) =>
  act(async () => root.render(h(HighlightCard, p)));
const btn = (sel: string) => host.querySelector(sel) as HTMLButtonElement;

it("shows the task big, with its line", async () => {
  await render(props());
  expect(btn(".hl-title").textContent).toBe("Ship the report");
  expect(host.querySelector(".hl-meta")?.textContent).toBe(
    "Due today · 45 min"
  );
});

it("completes and starts focus in one tap each", async () => {
  const p = props();
  await render(p);
  btn('[data-fin="hl-complete"]').click();
  btn('[data-fin="hl-focus"]').click();
  expect(p.onComplete).toHaveBeenCalledTimes(1);
  expect(p.onFocus).toHaveBeenCalledTimes(1);
});

it("opens the task from its title and clears from the x", async () => {
  const p = props();
  await render(p);
  btn(".hl-title").click();
  btn('[data-hl="clear"]').click();
  expect(p.onOpen).toHaveBeenCalled();
  expect(p.onClear).toHaveBeenCalled();
});

it("a finished highlight keeps only its title", async () => {
  await render({ ...props(), done: true, meta: "Done" });
  expect(
    host.querySelector("[data-hl-card]")?.getAttribute("data-hl-done")
  ).toBe("true");
  expect(host.querySelector('[data-fin="hl-complete"]')).toBeNull();
  expect(host.querySelector('[data-fin="hl-focus"]')).toBeNull();
});
