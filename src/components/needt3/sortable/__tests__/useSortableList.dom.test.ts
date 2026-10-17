/**
 * @jest-environment jsdom
 *
 * The shared sortable list: optimistic order, rollback, keyboard (space,
 * arrows, space; escape), the live region, the grip. A drop is fed to the
 * hook the way @dnd-kit does (jsdom has no layout to drag across).
 */
import { act, createElement as h } from "react";

import type { DragEndEvent } from "@dnd-kit/core";
import { type Root, createRoot } from "react-dom/client";

import {
  SortableItem,
  type SortableItemState,
  SortableList,
} from "../Sortable";
import { type SortableController, useSortableList } from "../useSortableList";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Row = { id: string; name: string };
const ROWS: Row[] = [
  { id: "a", name: "Alpha" },
  { id: "b", name: "Bravo" },
  { id: "c", name: "Charlie" },
];

let host: HTMLDivElement;
let root: Root;
let ctl: SortableController;
let onReorder: jest.Mock;
let onError: jest.Mock;

function Harness({ items }: { items: Row[] }) {
  ctl = useSortableList({
    items,
    label: (r) => r.name,
    onReorder: (order, move) => onReorder(order, move),
    onError: (e) => onError(e),
  });
  return h(SortableList, {
    ctl,
    children: (ctl.ordered as Row[]).map((r) =>
      h(SortableItem, {
        key: r.id,
        id: r.id,
        label: r.name,
        className: "row",
        children: ({ handleProps }: SortableItemState) =>
          h("span", { ...handleProps, className: "grip" }, r.name),
      })
    ),
  });
}

const render = (items: Row[] = ROWS) =>
  act(() => root.render(h(Harness, { items })));
const names = () =>
  [...host.querySelectorAll(".grip")].map((n) => n.textContent);
const grip = (name: string) =>
  [...host.querySelectorAll<HTMLElement>(".grip")].find(
    (n) => n.textContent === name
  )!;
const key = (el: Element, k: string) =>
  act(() => {
    el.dispatchEvent(
      new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })
    );
  });
const live = () => host.querySelector(".nx-sort-live")?.textContent;
const dropped = (from: string, over: string | null) =>
  act(async () => {
    ctl.onDragStart({ active: { id: from } } as never);
    ctl.onDragEnd({
      active: { id: from },
      over: over ? { id: over } : null,
    } as DragEndEvent);
  });

beforeEach(() => {
  onReorder = jest.fn().mockResolvedValue(undefined);
  onError = jest.fn();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("a drop", () => {
  it("shows the new order at once and saves it once", async () => {
    render();
    await dropped("a", "c");
    expect(names()).toEqual(["Bravo", "Charlie", "Alpha"]);
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(["b", "c", "a"], {
      id: "a",
      from: 0,
      to: 2,
    });
    expect(live()).toBe("Alpha, dropped at position 3 of 3.");
  });

  it("outside any row, or on itself, saves nothing", async () => {
    render();
    await dropped("a", null);
    await dropped("b", "b");
    expect(onReorder).not.toHaveBeenCalled();
    expect(names()).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("puts the old order back when the save is rejected", async () => {
    onReorder.mockRejectedValue(new Error("offline"));
    render();
    await dropped("a", "c");
    expect(names()).toEqual(["Alpha", "Bravo", "Charlie"]);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(live()).toMatch(/could not be saved/);
  });

  it("keeps the dropped order until the saved list catches up", async () => {
    render();
    await dropped("a", "c");
    render(); // an unrelated re-render with the old list
    expect(names()).toEqual(["Bravo", "Charlie", "Alpha"]);
    render([ROWS[1], ROWS[2], ROWS[0]]); // the list now says the same
    expect(names()).toEqual(["Bravo", "Charlie", "Alpha"]);
    render([ROWS[2], ROWS[1], ROWS[0]]); // the server answers with its own
    expect(names()).toEqual(["Charlie", "Bravo", "Alpha"]);
  });
});

describe("keyboard", () => {
  it("space picks up, arrows move, space drops and saves", async () => {
    render();
    const g = grip("Alpha");
    key(g, " ");
    expect(live()).toMatch(/^Alpha, picked up\. Position 1 of 3/);
    expect(g.getAttribute("aria-pressed")).toBe("true");
    key(g, "ArrowDown");
    expect(names()).toEqual(["Bravo", "Alpha", "Charlie"]);
    expect(live()).toBe("Alpha, position 2 of 3.");
    key(grip("Alpha"), "ArrowDown");
    key(grip("Alpha"), "ArrowDown"); // already last: stays
    expect(names()).toEqual(["Bravo", "Charlie", "Alpha"]);
    expect(onReorder).not.toHaveBeenCalled();
    key(grip("Alpha"), " ");
    await act(async () => void (await Promise.resolve()));
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder.mock.calls[0][0]).toEqual(["b", "c", "a"]);
    expect(live()).toBe("Alpha, dropped at position 3 of 3.");
    expect(grip("Alpha").getAttribute("aria-pressed")).toBe("false");
  });

  it("escape puts it back and saves nothing", () => {
    render();
    key(grip("Charlie"), " ");
    key(grip("Charlie"), "Home");
    expect(names()).toEqual(["Charlie", "Alpha", "Bravo"]);
    key(grip("Charlie"), "Escape");
    expect(names()).toEqual(["Alpha", "Bravo", "Charlie"]);
    expect(onReorder).not.toHaveBeenCalled();
    expect(live()).toBe("Cancelled. Charlie is back at position 3 of 3.");
  });

  it("arrows do nothing until a row is picked up", () => {
    render();
    key(grip("Alpha"), "ArrowDown");
    expect(names()).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("a key typed inside the grip (not on it) is left alone", () => {
    render();
    const inner = document.createElement("input");
    grip("Alpha").appendChild(inner);
    key(inner, " ");
    expect(grip("Alpha").getAttribute("aria-pressed")).toBe("false");
  });
});

describe("the grip", () => {
  it("is named, focusable, and the list speaks through one live region", () => {
    render();
    const g = grip("Bravo");
    expect(g.getAttribute("aria-label")).toBe("Reorder Bravo");
    expect(g.tabIndex).toBe(0);
    expect(g.hasAttribute("data-sort-handle")).toBe(true);
    const region = host.querySelectorAll(".nx-sort-live");
    expect(region).toHaveLength(1);
    expect(region[0].getAttribute("aria-live")).toBe("assertive");
  });

  it("rows are never draggable by the browser, and nothing sets top or left", () => {
    render();
    const row = host.querySelector<HTMLElement>(".row")!;
    expect(row.getAttribute("draggable")).toBeNull();
    expect(row.style.top).toBe("");
    expect(row.style.left).toBe("");
  });
});
