/**
 * @jest-environment jsdom
 *
 * Hold-to-lift reorder on the phone wall, mounted for real: a hold lifts, a
 * drag over another tile reorders, a release commits once; a cancelled touch,
 * a scroll that starts before the hold, a second finger, an unmount in the
 * middle and a viewer never commit anything; a hold that does not move opens
 * the tile's actions; and every listener is gone when it ends.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { HOLD_MS } from "@/lib/needt3/gesture";

import { Wall } from "../Wall";
import { type PhoneBoardItem } from "../model";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const item = (id: string, extra = {}): PhoneBoardItem => ({
  id,
  kind: "note",
  url: null,
  color: null,
  text: `Words ${id}`,
  title: null,
  ratio: 0.7,
  colorName: null,
  source: null,
  thumbnailUrl: null,
  position: 1,
  createdAt: null,
  ...extra,
});

/** Where each tile sits (jsdom has no layout): a and c in the left column. */
const BOX: Record<string, [number, number]> = {
  a: [0, 0],
  b: [110, 0],
  c: [0, 110],
  canvas: [110, 110],
};

function pointer(
  type: string,
  p: { x?: number; y?: number; id?: number } = {}
) {
  const e = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: p.x ?? 0,
    clientY: p.y ?? 0,
  });
  Object.defineProperty(e, "pointerId", { value: p.id ?? 1 });
  Object.defineProperty(e, "pointerType", { value: "touch" });
  return e;
}

let host: HTMLDivElement;
let root: Root;
let onOrder: jest.Mock;
let onHold: jest.Mock;
let onOpen: jest.Mock;
let added: string[];
let removed: string[];

const mount = (canEdit = true, items = [item("a"), item("b"), item("c")]) =>
  act(() =>
    root.render(h(Wall, { items, canEdit, onOrder, onHold, onOpen } as never))
  );
const tile = (id: string) =>
  host.querySelector<HTMLElement>(`[data-phb-item="${id}"]`)!;
const ids = () =>
  [...host.querySelectorAll("[data-phb-item]")]
    .map((e) => e.getAttribute("data-phb-item"))
    .sort();
const down = (id: string, x = 5, y = 5, pid = 1) =>
  act(() => {
    tile(id).dispatchEvent(pointer("pointerdown", { x, y, id: pid }));
  });
const fire = (type: string, p = {}) =>
  act(() => {
    window.dispatchEvent(pointer(type, p));
  });
const wait = (ms: number) => act(() => void jest.advanceTimersByTime(ms));

beforeEach(() => {
  jest.useFakeTimers();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  jest
    .spyOn(Element.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: Element) {
      const id = this.getAttribute?.("data-phb-item");
      const [left, top] = (id && BOX[id]) || [0, 0];
      return {
        left,
        top,
        right: left + 100,
        bottom: top + 100,
        width: 100,
        height: 100,
        x: left,
        y: top,
        toJSON() {},
      } as DOMRect;
    });
  Element.prototype.setPointerCapture = jest.fn();
  onOrder = jest.fn().mockResolvedValue(undefined);
  onHold = jest.fn();
  onOpen = jest.fn();
  added = [];
  removed = [];
  const add = window.addEventListener.bind(window);
  const rm = window.removeEventListener.bind(window);
  jest.spyOn(window, "addEventListener").mockImplementation(((
    t: string,
    ...a: unknown[]
  ) => {
    if (t.startsWith("pointer")) added.push(t);
    return (add as (...x: unknown[]) => void)(t, ...a);
  }) as never);
  jest.spyOn(window, "removeEventListener").mockImplementation(((
    t: string,
    ...a: unknown[]
  ) => {
    if (t.startsWith("pointer")) removed.push(t);
    return (rm as (...x: unknown[]) => void)(t, ...a);
  }) as never);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/** Lift tile a and drag it over tile b. */
async function liftAndDragOverB() {
  down("a");
  await wait(HOLD_MS + 5);
  fire("pointermove", { x: 150, y: 50 }); // inside b
  await wait(20); // one frame
}

describe("hold to lift", () => {
  it("lifts after the hold, reorders under the finger, and commits once on release", async () => {
    mount();
    await liftAndDragOverB();
    expect(tile("a").className).toContain("is-lifted");
    fire("pointerup", { x: 150, y: 50 });
    await wait(0);
    expect(onOrder).toHaveBeenCalledTimes(1);
    expect(onOrder).toHaveBeenCalledWith(["b", "a", "c"]);
    expect(onHold).not.toHaveBeenCalled();
  });

  it("the click that ends a lift does not also open the tile", async () => {
    mount();
    await liftAndDragOverB();
    fire("pointerup", { x: 150, y: 50 });
    act(() => {
      tile("a").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onOpen).not.toHaveBeenCalled();
    // a later, ordinary tap opens it
    jest.setSystemTime(Date.now() + 2000);
    await wait(2000);
    act(() => {
      tile("b").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("a cancelled touch never commits, and the wall goes back", async () => {
    mount();
    await liftAndDragOverB();
    fire("pointercancel", {});
    await wait(0);
    expect(onOrder).not.toHaveBeenCalled();
    expect(onHold).not.toHaveBeenCalled();
    expect(tile("a").className).not.toContain("is-lifted");
    expect(ids()).toEqual(["a", "b", "c"]);
    // nothing is listening any more: a late release does nothing
    fire("pointerup", { x: 150, y: 50 });
    await wait(0);
    expect(onOrder).not.toHaveBeenCalled();
  });

  it("a hold that does not move opens the tile's actions", async () => {
    mount();
    down("b");
    await wait(HOLD_MS + 5);
    fire("pointerup", { x: 5, y: 5 });
    await wait(0);
    expect(onHold).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }));
    expect(onOrder).not.toHaveBeenCalled();
  });

  it("a drag that ends where it started changes nothing", async () => {
    mount();
    down("a");
    await wait(HOLD_MS + 5);
    fire("pointermove", { x: 40, y: 40 }); // moved, but over no other tile
    await wait(20);
    fire("pointerup", { x: 40, y: 40 });
    await wait(0);
    expect(onOrder).not.toHaveBeenCalled();
  });

  it("moving before the hold fires is a scroll: no lift, no commit", async () => {
    mount();
    down("a");
    await wait(200);
    fire("pointermove", { x: 5, y: 60 });
    await wait(HOLD_MS);
    expect(tile("a").className).not.toContain("is-lifted");
    fire("pointerup", { x: 5, y: 60 });
    await wait(0);
    expect(onOrder).not.toHaveBeenCalled();
    expect(onHold).not.toHaveBeenCalled();
  });

  it("a second finger is ignored while the first is down", async () => {
    mount();
    down("a", 5, 5, 1);
    down("b", 115, 5, 2);
    await wait(HOLD_MS + 5);
    expect(tile("a").className).toContain("is-lifted");
    expect(tile("b").className).not.toContain("is-lifted");
    // the other finger lifting changes nothing
    fire("pointerup", { id: 2 });
    expect(onOrder).not.toHaveBeenCalled();
    expect(onHold).not.toHaveBeenCalled();
    fire("pointercancel", { id: 1 });
  });

  it("unmounting in the middle lets go of everything and commits nothing", async () => {
    mount();
    await liftAndDragOverB();
    act(() => root.unmount());
    root = createRoot(host);
    fire("pointerup", { x: 150, y: 50 });
    await wait(50);
    expect(onOrder).not.toHaveBeenCalled();
    for (const t of ["pointermove", "pointerup", "pointercancel"])
      expect(removed.filter((x) => x === t).length).toBeGreaterThanOrEqual(
        added.filter((x) => x === t).length
      );
  });

  it("removes every listener it added when a gesture ends", async () => {
    mount();
    await liftAndDragOverB();
    fire("pointerup", { x: 150, y: 50 });
    await wait(0);
    for (const t of ["pointermove", "pointerup", "pointercancel"])
      expect(removed.filter((x) => x === t).length).toBeGreaterThanOrEqual(
        added.filter((x) => x === t).length
      );
    expect(added.length).toBeGreaterThan(0);
  });

  it("a viewer cannot lift", async () => {
    mount(false);
    down("a");
    await wait(HOLD_MS + 5);
    expect(tile("a").className).not.toContain("is-lifted");
    fire("pointerup", {});
    expect(onOrder).not.toHaveBeenCalled();
    expect(onHold).not.toHaveBeenCalled();
    expect(added).toEqual([]);
  });

  it("a tile from the old canvas cannot be lifted, and the order lists only the board's own", async () => {
    mount(true, [item("a"), item("b"), item("canvas", { fromCanvas: true })]);
    down("canvas", 115, 115);
    await wait(HOLD_MS + 5);
    expect(tile("canvas").className).not.toContain("is-lifted");
    fire("pointerup", {});
    expect(onHold).not.toHaveBeenCalled();
    down("a");
    await wait(HOLD_MS + 5);
    fire("pointermove", { x: 150, y: 50 });
    await wait(20);
    fire("pointerup", { x: 150, y: 50 });
    await wait(0);
    expect(onOrder).toHaveBeenCalledWith(["b", "a"]);
  });
});
