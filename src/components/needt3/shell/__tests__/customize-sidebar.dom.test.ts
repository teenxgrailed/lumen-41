/**
 * @jest-environment jsdom
 *
 * Customize Sidebar: Places and Sections reorder through the shared sortable
 * list (grip, keyboard, optimistic save), and the tick still toggles.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { V3PortalScope } from "../../ctx/PortalScope";
import { CustomizeSidebar } from "../CustomizeSidebar";
import { DEFAULT_PREFS, type SidebarPrefs } from "../places";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let prefs: SidebarPrefs;
const setPrefs = jest.fn();
jest.mock("../useSidebarPrefs", () => ({
  useSidebarPrefs: () => [prefs, setPrefs],
}));

let host: HTMLDivElement;
let root: Root;

const open = () =>
  act(() =>
    root.render(
      h(
        V3PortalScope,
        null,
        h(CustomizeSidebar, { open: true, onClose: jest.fn() })
      )
    )
  );
const grips = () => [
  ...document.querySelectorAll<HTMLElement>("[data-sort-handle]"),
];
const gripOf = (id: string) =>
  document.querySelector<HTMLElement>(
    `[data-sort-id="${id}"] [data-sort-handle]`
  )!;
const key = (el: Element, k: string) =>
  act(() => {
    el.dispatchEvent(
      new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })
    );
  });
const flush = () => act(async () => void (await Promise.resolve()));

beforeEach(() => {
  prefs = DEFAULT_PREFS;
  setPrefs.mockReset().mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("Customize Sidebar", () => {
  it("gives every place and section a named grip and no native drag", async () => {
    await open();
    const labels = grips().map((g) => g.getAttribute("aria-label"));
    expect(labels).toContain("Reorder Calendar");
    expect(labels).toContain("Reorder Pinned");
    expect(labels).toContain("Reorder Projects");
    expect(grips()).toHaveLength(
      DEFAULT_PREFS.places.length + DEFAULT_PREFS.sections.length
    );
    expect(document.querySelector("[draggable=true]")).toBeNull();
  });

  it("reorders a place from the keyboard and saves the whole order, rethrowing so a failure rolls back", async () => {
    await open();
    const id0 = DEFAULT_PREFS.places[0].id;
    const id1 = DEFAULT_PREFS.places[1].id;
    key(gripOf(id0), " ");
    key(gripOf(id0), "ArrowDown");
    expect(setPrefs).not.toHaveBeenCalled();
    key(gripOf(id0), " ");
    await flush();
    expect(setPrefs).toHaveBeenCalledTimes(1);
    const [update, opts] = setPrefs.mock.calls[0];
    expect(opts).toEqual({ rethrow: true });
    const next: SidebarPrefs = update(DEFAULT_PREFS);
    expect(next.places.slice(0, 2).map((p) => p.id)).toEqual([id1, id0]);
    expect(next.places).toHaveLength(DEFAULT_PREFS.places.length);
    expect(next.sections).toEqual(DEFAULT_PREFS.sections);
  });

  it("reorders the sections list on its own", async () => {
    await open();
    const first = DEFAULT_PREFS.sections[0].id;
    key(gripOf(first), " ");
    key(gripOf(first), "ArrowDown");
    key(gripOf(first), " ");
    await flush();
    const next: SidebarPrefs = setPrefs.mock.calls[0][0](DEFAULT_PREFS);
    expect(next.sections.map((s) => s.id)).toEqual(
      DEFAULT_PREFS.sections.map((s) => s.id).reverse()
    );
    expect(next.places).toEqual(DEFAULT_PREFS.places);
  });

  it("a click on the tick toggles a place and does not start a drag", async () => {
    await open();
    const tick = document.querySelector<HTMLElement>("[role=checkbox]")!;
    act(() => {
      tick.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(setPrefs).toHaveBeenCalledTimes(1);
    expect(setPrefs.mock.calls[0][1]).toBeUndefined();
    expect(document.documentElement.classList.contains("nx-sorting")).toBe(
      false
    );
  });
});
