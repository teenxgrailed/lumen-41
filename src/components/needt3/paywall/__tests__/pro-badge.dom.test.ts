/**
 * @jest-environment jsdom
 *
 * A locked PRO pill is a way into the Pro sheet, on the feature it marks; a
 * plain one (the person is on Pro) is only a mark.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { ProBadge } from "../Pro";
import { closePaywall, usePaywallStore } from "../store";

jest.mock("@/lib/needt3/hooks/plan", () => ({
  usePlan: () => ({ data: undefined }),
}));
jest.mock("@/lib/needt3/hooks/settings", () => ({
  useSettings: () => ({ data: undefined }),
  useSetPref: () => jest.fn(),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  closePaywall();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("ProBadge", () => {
  it("opens the paywall on its feature when locked", () => {
    act(() =>
      root.render(
        h(ProBadge, { size: "sm", locked: true, feature: "Plan my day" })
      )
    );
    const pill = host.querySelector<HTMLElement>("[data-pro-badge=locked]")!;
    expect(pill.getAttribute("role")).toBe("button");
    expect(pill.tabIndex).toBe(0);
    act(() => pill.click());
    const s = usePaywallStore.getState();
    expect(s.open).toBe(true);
    expect(s.feature).toBe("Plan my day");
  });

  it("opens from the keyboard", () => {
    act(() => root.render(h(ProBadge, { locked: true, feature: "Week load" })));
    const pill = host.querySelector<HTMLElement>("[data-pro-badge=locked]")!;
    act(() => {
      pill.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
    });
    expect(usePaywallStore.getState().feature).toBe("Week load");
  });

  it("does not bubble to the row it sits in", () => {
    const row = jest.fn();
    act(() =>
      root.render(
        h(
          "div",
          { onClick: row },
          h(ProBadge, { locked: true, feature: "AI tools" })
        )
      )
    );
    act(() => host.querySelector<HTMLElement>("[data-pro-badge]")!.click());
    expect(row).not.toHaveBeenCalled();
  });

  it("is only a mark when not locked", () => {
    act(() => root.render(h(ProBadge, { size: "sm" })));
    const pill = host.querySelector<HTMLElement>("[data-pro-badge=on]")!;
    expect(pill.getAttribute("role")).toBeNull();
    act(() => pill.click());
    expect(usePaywallStore.getState().open).toBe(false);
  });
});
