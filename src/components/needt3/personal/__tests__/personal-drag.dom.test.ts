/**
 * @jest-environment jsdom
 *
 * Moving and resizing personal time on the week grid. A band of the person's
 * own can be picked up (the drag's attributes) and pulled by its bottom edge;
 * a band that follows a calendar event has neither, and keeps the plain
 * cursor. The pull itself is the drag's own discipline: 4px before it counts,
 * one frame per stream, the band's height written to the node, Escape puts it
 * back, and only the host decides what is written.
 */
import { act, createRef, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import type { DayBand } from "@/lib/personal-time-days";

import { type WeekHandle, WeekView } from "../../calendar/WeekView";
import { useDrag } from "../../drag/useDrag";
import {
  type ResizeRequest,
  usePersonalResize,
} from "../../drag/usePersonalResize";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../root/V3Root", () => ({ useDesignV3: () => true }));
jest.mock("../../ctx/PortalScope", () => ({
  useV3PortalContainer: () => document.body,
}));

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
let frames: FrameRequestCallback[];
let resized: ResizeRequest[];

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = RO;
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 1056,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => 600,
  });
  // the band is drawn one hour tall (52px)
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get: () => 52,
  });
  Element.prototype.scrollTo = function scrollTo() {} as never;
  Element.prototype.scrollIntoView = function scrollIntoView() {} as never;
  frames = [];
  window.requestAnimationFrame = (cb) => {
    frames.push(cb);
    return frames.length;
  };
  window.cancelAnimationFrame = () => undefined;
  (globalThis as { fetch?: unknown }).fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => "[]",
  });
  resized = [];
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div");
  host.className = "needt-v3";
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

const band = (over: Partial<DayBand>): DayBand => ({
  key: `${over.blockId ?? "lunch"}:2026-09-09`,
  blockId: "lunch",
  kind: "lunch",
  title: "Lunch",
  emoji: "🍽️",
  tone: "info",
  date: "2026-09-09",
  from: 13,
  to: 14,
  repeating: false,
  linked: false,
  ...over,
});

/** The grid with the real drag and resize hooks wired the way the host wires them. */
function Grid({ bands }: { bands: DayBand[] }) {
  const { dragProps } = useDrag(() => undefined, document.body);
  const { resizeProps } = usePersonalResize((request) => {
    resized.push(request);
  });
  return h(WeekView, {
    n: 7,
    initial: "2026-09-07",
    blocks: new Map(),
    nowHour: 10,
    today: "2026-09-09",
    work: { days: [1, 2, 3, 4, 5], start: 9, end: 17 },
    draft: null,
    onSlot: () => undefined,
    onCreate: () => undefined,
    onCancel: () => undefined,
    onDone: () => undefined,
    onRename: () => undefined,
    onDelete: () => undefined,
    handle: createRef<WeekHandle>(),
    dragProps,
    resizeProps,
    personal: new Map([["2026-09-09", bands]]),
    onPersonal: () => undefined,
  });
}

function mount(bands: DayBand[]) {
  act(() => {
    root.render(h(QueryClientProvider, { client }, h(Grid, { bands })));
  });
}

const bandEl = (id: string) =>
  host.querySelector(`[data-personal-band="${id}"]`) as HTMLElement;

const pointer = (type: string, init: MouseEventInit = {}) =>
  new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init });

const flush = () =>
  act(() => {
    const queue = frames;
    frames = [];
    queue.forEach((cb) => cb(0));
  });

describe("who can be dragged", () => {
  it("a band of the person's own can be picked up and pulled by its end", () => {
    mount([band({ blockId: "lunch" })]);
    const el = bandEl("lunch");
    expect(el.hasAttribute("data-drag-src")).toBe(true);
    expect(el.getAttribute("data-drag-id")).toBe("pb:lunch");
    expect(el.querySelector("[data-pb-resize]")).not.toBeNull();
  });

  it("a band marked on a calendar event is not draggable and has no handle", () => {
    mount([
      band({ blockId: "lunch" }),
      band({ blockId: "standup", title: "Standup", linked: true }),
    ]);
    const linked = bandEl("standup");
    expect(linked.hasAttribute("data-drag-src")).toBe(false);
    expect(linked.hasAttribute("data-drag-id")).toBe(false);
    expect(linked.querySelector("[data-pb-resize]")).toBeNull();
    // it still opens like any band
    expect(linked.getAttribute("role")).toBe("button");
    // and a press on it arms nothing
    act(() => {
      linked.dispatchEvent(
        pointer("pointerdown", { clientX: 10, clientY: 10 })
      );
      window.dispatchEvent(
        pointer("pointermove", { clientX: 10, clientY: 90 })
      );
    });
    flush();
    expect(document.querySelector(".shell-drag-lift")).toBeNull();
  });

  it("gives no handle to the slice of an overnight block that stops at midnight", () => {
    mount([band({ blockId: "late", from: 22, to: 24 })]);
    const el = bandEl("late");
    expect(el.hasAttribute("data-drag-src")).toBe(true);
    expect(el.querySelector("[data-pb-resize]")).toBeNull();
  });
});

describe("pulling the bottom edge", () => {
  const handle = () =>
    bandEl("lunch").querySelector("[data-pb-resize]") as HTMLElement;

  it("grows the band with the hand, snapped, and reports the distance on release", () => {
    mount([band({ blockId: "lunch" })]);
    const el = bandEl("lunch");
    el.style.height = "52px";
    act(() => {
      handle().dispatchEvent(pointer("pointerdown", { clientY: 100 }));
    });
    // 30px down is about half an hour: 26px at 52px an hour
    act(() => {
      window.dispatchEvent(pointer("pointermove", { clientY: 130 }));
    });
    flush();
    expect(el.style.height).toBe("78px");
    // the pull is not a drag of the band itself
    expect(document.querySelector(".shell-drag-lift")).toBeNull();
    act(() => {
      window.dispatchEvent(pointer("pointerup", { clientY: 152 }));
    });
    expect(resized).toHaveLength(1);
    expect(resized[0]).toMatchObject({ blockId: "lunch", deltaHours: 1 });
    expect(el.style.height).toBe("104px");
    // the host can give the old height back
    resized[0].revert();
    expect(el.style.height).toBe("52px");
  });

  it("never draws the band shorter than 15 minutes", () => {
    mount([band({ blockId: "lunch" })]);
    const el = bandEl("lunch");
    el.style.height = "52px";
    act(() => {
      handle().dispatchEvent(pointer("pointerdown", { clientY: 300 }));
      window.dispatchEvent(pointer("pointermove", { clientY: 100 }));
    });
    flush();
    expect(el.style.height).toBe("13px");
    act(() => {
      window.dispatchEvent(pointer("pointerup", { clientY: 100 }));
    });
    expect(resized[0].deltaHours).toBeLessThan(-1);
  });

  it("is a click, not a pull, until the hand has travelled 4px", () => {
    mount([band({ blockId: "lunch" })]);
    const el = bandEl("lunch");
    el.style.height = "52px";
    act(() => {
      handle().dispatchEvent(pointer("pointerdown", { clientY: 100 }));
      window.dispatchEvent(pointer("pointermove", { clientY: 102 }));
    });
    flush();
    act(() => {
      window.dispatchEvent(pointer("pointerup", { clientY: 102 }));
    });
    expect(resized).toHaveLength(0);
    expect(el.style.height).toBe("52px");
  });

  it("puts the band back on Escape and writes nothing", () => {
    mount([band({ blockId: "lunch" })]);
    const el = bandEl("lunch");
    el.style.height = "52px";
    act(() => {
      handle().dispatchEvent(pointer("pointerdown", { clientY: 100 }));
      window.dispatchEvent(pointer("pointermove", { clientY: 180 }));
    });
    flush();
    expect(el.style.height).not.toBe("52px");
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });
    expect(el.style.height).toBe("52px");
    act(() => {
      window.dispatchEvent(pointer("pointerup", { clientY: 180 }));
    });
    expect(resized).toHaveLength(0);
  });

  it("gives the height back when the hand ends where it began", () => {
    mount([band({ blockId: "lunch" })]);
    const el = bandEl("lunch");
    el.style.height = "52px";
    act(() => {
      handle().dispatchEvent(pointer("pointerdown", { clientY: 100 }));
      window.dispatchEvent(pointer("pointermove", { clientY: 160 }));
    });
    flush();
    act(() => {
      window.dispatchEvent(pointer("pointerup", { clientY: 101 }));
    });
    expect(resized).toHaveLength(0);
    expect(el.style.height).toBe("52px");
  });
});
