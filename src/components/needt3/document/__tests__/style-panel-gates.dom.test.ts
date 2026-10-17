/**
 * @jest-environment jsdom
 *
 * The Style panel's plan gates, as the person sees them: fonts and three page
 * colours are free; the other page colours, covers, backdrops and All Styles
 * stop at the paywall on Free and work on Pro.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { V3PortalScope } from "../../ctx/PortalScope";
import { usePaywallStore } from "../../paywall/store";
import { StylePanel } from "../StylePanel";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let plan: { kind: string } | undefined;
const update = jest.fn(async () => ({ undo: jest.fn() })) as jest.Mock;
jest.mock("@/lib/needt3/hooks/plan", () => ({
  usePlan: () => ({ data: plan }),
}));
jest.mock("@/lib/needt3/hooks/docs", () => ({
  useUpdateDoc: () => ({ mutateAsync: (v: unknown) => update(v) }),
}));
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: jest.fn(),
    getQueryData: jest.fn(),
  }),
}));
jest.mock("@/lib/notifications", () => ({
  notify: { success: jest.fn(), error: jest.fn() },
}));

const doc = (extra: Record<string, unknown> = {}) => ({
  id: "p1",
  title: "T",
  icon: null,
  coverUrl: null,
  isFavorite: false,
  trashedAt: null,
  projectId: null,
  style: null,
  createdAt: null,
  updatedAt: null,
  ...extra,
});
const read = (name: string) =>
  name.endsWith("-d")
    ? "#2c2c2e"
    : name.includes("ink")
      ? "#1c1d20"
      : "#ffffff";

let host: HTMLDivElement;
let root: Root;

const mount = (d = doc()) => {
  act(() =>
    root.render(
      h(V3PortalScope, null, h(StylePanel, { doc: d as never, read }))
    )
  );
};
const open = (row: string) => {
  const rowEl = host.querySelector(`[data-dc-row="${row}"]`)!;
  act(() => {
    (rowEl.closest(".docs-dc-pop-1") ?? rowEl).dispatchEvent(
      new MouseEvent("click", { bubbles: true })
    );
  });
};
const swatch = (id: string) =>
  document.querySelector<HTMLElement>(`[data-dc-swatch="${id}"]`)!;
const click = (el: Element) =>
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

beforeEach(() => {
  plan = { kind: "free" };
  update.mockClear();
  usePaywallStore.getState().close();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("page colours", () => {
  it("marks the Pro colours and lets three through on Free", () => {
    mount();
    open("page");
    for (const id of ["white", "paper", "graphite"]) {
      expect(swatch(id).hasAttribute("data-pro-locked")).toBe(false);
    }
    for (const id of ["rose", "lilac", "sage", "sky", "sand", "black"]) {
      expect(swatch(id).hasAttribute("data-pro-locked")).toBe(true);
      expect(swatch(id).getAttribute("aria-label")).toMatch(/Pro$/);
    }
    click(swatch("paper"));
    expect(update).toHaveBeenCalledTimes(1);
    expect(usePaywallStore.getState().open).toBe(false);
  });

  it("stops at the paywall on a Pro colour without writing", () => {
    mount();
    open("page");
    click(swatch("rose"));
    expect(update).not.toHaveBeenCalled();
    expect(usePaywallStore.getState().open).toBe(true);
  });

  it("a Pro plan has every colour open", () => {
    plan = { kind: "monthly" };
    mount();
    open("page");
    expect(document.querySelectorAll("[data-pro-locked]")).toHaveLength(0);
    click(swatch("rose"));
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("an unknown plan (still loading) counts as Free", () => {
    plan = undefined;
    mount();
    open("page");
    click(swatch("sand"));
    expect(update).not.toHaveBeenCalled();
    expect(usePaywallStore.getState().open).toBe(true);
  });
});

describe("covers", () => {
  it("are locked on Free: art and upload open the paywall", () => {
    mount();
    open("cover");
    const art = document.querySelector<HTMLElement>("[data-dc-cover-art]")!;
    expect(art.hasAttribute("data-pro-locked")).toBe(true);
    click(art);
    expect(update).not.toHaveBeenCalled();
    expect(usePaywallStore.getState().open).toBe(true);
    usePaywallStore.getState().close();
    open("cover");
    click(document.querySelector("[data-dc-cover-upload]")!);
    expect(usePaywallStore.getState().open).toBe(true);
  });

  it("Pro can pick a cover art", () => {
    plan = { kind: "yearly" };
    mount();
    open("cover");
    click(document.querySelector("[data-dc-cover-art]")!);
    expect(update).toHaveBeenCalledTimes(1);
    expect(
      (update.mock.calls[0] as unknown as [{ patch: { coverUrl: string } }])[0]
        .patch.coverUrl
    ).toMatch(/^art:/);
  });
});
