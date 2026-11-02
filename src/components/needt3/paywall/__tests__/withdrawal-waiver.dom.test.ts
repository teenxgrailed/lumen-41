/**
 * @jest-environment jsdom
 *
 * The Terms 5.5 box shows the product, links the clause and reports a tick.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { WithdrawalWaiver } from "../WithdrawalWaiver";

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

describe("WithdrawalWaiver", () => {
  it("shows the product, links the clause and reports a tick", () => {
    const onChange = jest.fn();
    act(() =>
      root.render(
        h(WithdrawalWaiver, { checked: false, onChange, product: "Lifetime" })
      )
    );
    const box = host.querySelector<HTMLInputElement>("input[type=checkbox]")!;
    expect(box.checked).toBe(false);
    expect(host.textContent).toContain("Start Lifetime now");
    expect(host.querySelector("a")!.getAttribute("href")).toBe(
      "/terms#5-5-refunds-and-the-right-of-withdrawal"
    );
    act(() => box.click());
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
