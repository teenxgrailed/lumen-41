/**
 * @jest-environment jsdom
 *
 * Agenda has one set of ‹ › arrows and one span label: the calendar header's.
 * The bar under it only picks 3 / 5 / 7 days.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { DaysView } from "../DaysView";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../popovers", () => ({
  MoreRow: () => null,
  SlotPop: () => null,
  useSlot: () => ({ close: jest.fn() }),
}));
jest.mock("../../personal/PersonalBand", () => ({ PersonalRow: () => null }));
jest.mock("../../task/Task", () => ({ Task: () => null }));

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

describe("Agenda bar", () => {
  it("has no paging arrows and no second span label", () => {
    act(() =>
      root.render(
        h(DaysView, {
          days: [],
          blocks: [],
          loose: [],
          today: "2026-11-03",
          n: 3,
          onN: jest.fn(),
          carryAt: null,
        })
      )
    );
    expect(host.querySelector("[aria-label='Previous days']")).toBeNull();
    expect(host.querySelector("[aria-label='Next days']")).toBeNull();
    expect(host.querySelector("[data-c2-range]")).toBeNull();
    // what the bar is for stays
    expect(host.textContent).toContain("3 days");
    expect(host.textContent).toContain("7 days");
  });
});
