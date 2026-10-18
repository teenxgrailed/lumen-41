/**
 * @jest-environment jsdom
 *
 * The morning brief card: its lines, a dismiss, and nothing for an empty text.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { BriefCard } from "../BriefCard";

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

it("draws each line and dismisses", async () => {
  const onDismiss = jest.fn();
  await act(async () =>
    root.render(
      h(BriefCard, {
        text: "Two things matter.\nOne is overdue.\n2 h 30 free.",
        onDismiss,
      })
    )
  );
  expect(host.querySelectorAll(".br-line")).toHaveLength(3);
  (host.querySelector('[data-br="dismiss"]') as HTMLButtonElement).click();
  expect(onDismiss).toHaveBeenCalled();
});

it("draws nothing without text", async () => {
  await act(async () =>
    root.render(h(BriefCard, { text: "\n", onDismiss: jest.fn() }))
  );
  expect(host.innerHTML).toBe("");
});
