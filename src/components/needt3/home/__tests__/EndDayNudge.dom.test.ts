/**
 * @jest-environment jsdom
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { EndDayNudge } from "../EndDayNudge";

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

it("offers End day and a way to say not now", async () => {
  const onEndDay = jest.fn();
  const onDismiss = jest.fn();
  await act(async () => root.render(h(EndDayNudge, { onEndDay, onDismiss })));
  (host.querySelector('[data-fin="nudge-end-day"]') as HTMLElement).click();
  (host.querySelector('[data-nd="dismiss"]') as HTMLElement).click();
  expect(onEndDay).toHaveBeenCalledTimes(1);
  expect(onDismiss).toHaveBeenCalledTimes(1);
});
