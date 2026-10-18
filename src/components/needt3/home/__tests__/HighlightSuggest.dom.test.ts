/**
 * @jest-environment jsdom
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { HighlightSuggest } from "../HighlightSuggest";

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

const props = (over = {}) => ({
  title: "Ship the report",
  meta: "High priority",
  canCycle: true,
  onAccept: jest.fn(),
  onAnother: jest.fn(),
  onDismiss: jest.fn(),
  ...over,
});
const render = (p: ReturnType<typeof props>) =>
  act(async () => root.render(h(HighlightSuggest, p)));
const tap = (sel: string) =>
  (host.querySelector(sel) as HTMLButtonElement).click();

it("one tap accepts, another asks for a different one", async () => {
  const p = props();
  await render(p);
  expect(host.textContent).toContain("Ship the report");
  tap('[data-fin="suggest-accept"]');
  tap('[data-fin="suggest-another"]');
  tap("[data-hl-suggest-dismiss]");
  expect(p.onAccept).toHaveBeenCalledTimes(1);
  expect(p.onAnother).toHaveBeenCalledTimes(1);
  expect(p.onDismiss).toHaveBeenCalledTimes(1);
});

it("offers no Another when there is only one candidate", async () => {
  await render(props({ canCycle: false }));
  expect(host.querySelector('[data-fin="suggest-another"]')).toBeNull();
});
