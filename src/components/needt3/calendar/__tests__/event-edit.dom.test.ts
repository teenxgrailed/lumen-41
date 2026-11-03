/**
 * @jest-environment jsdom
 *
 * Events on the week grid. One on a calendar that takes writes (a Needt one,
 * or a synced Google/Outlook/CalDAV one the account can write to) can be
 * picked up and pulled by its bottom edge, like a task or a personal band; a
 * read-only one (holidays, contacts, ICS, a recurring series, a busy block)
 * has neither. The host decides what is written (see DragHost).
 */
import { act, createRef, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { EVENT_DRAG_PREFIX } from "../../drag/event-drop";
import { useDrag } from "../../drag/useDrag";
import {
  type ResizeRequest,
  usePersonalResize,
} from "../../drag/usePersonalResize";
import { type WeekHandle, WeekView } from "../WeekView";
import { calendarItems } from "../blocks";

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

const event = (id: string, calendarId: string, extra = {}) => ({
  id,
  title: `Event ${id}`,
  startAt: "2026-09-09T10:00",
  endAt: "2026-09-09T11:00",
  isAllDay: false,
  calendarId,
  source: "google" as const,
  externalId: `ext-${id}`,
  ...extra,
});

/** The grid fed the way CalendarCraft feeds it: through calendarItems. */
function Grid({ events }: { events: ReturnType<typeof event>[] }) {
  const { dragProps } = useDrag(() => undefined, document.body);
  const { resizeProps } = usePersonalResize((request) => {
    resized.push(request);
  });
  const { timed } = calendarItems({
    tasks: [],
    events,
    ownCalendarIds: new Set(["goog", "holidays", "recurring"]),
    // the Google calendar takes writes; the holiday calendar does not
    writableCalendarIds: new Set(["goog", "recurring"]),
    today: "2026-09-09",
    hideDone: false,
  });
  const blocks = new Map<string, typeof timed>();
  for (const b of timed) blocks.set(b.date, [...(blocks.get(b.date) ?? []), b]);
  return h(WeekView, {
    n: 7,
    initial: "2026-09-07",
    blocks,
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
  });
}

function mount(events: ReturnType<typeof event>[]) {
  act(() => {
    root.render(h(QueryClientProvider, { client }, h(Grid, { events })));
  });
}

const blockEl = (id: string) =>
  host.querySelector(`[data-c2-block="${id}"]`) as HTMLElement;

const pointer = (type: string, init: MouseEventInit = {}) =>
  new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init });

const flush = () =>
  act(() => {
    const queue = frames;
    frames = [];
    queue.forEach((cb) => cb(0));
  });

describe("events on the grid", () => {
  it("an event on a writable synced calendar can be picked up and pulled by its end", () => {
    mount([event("g1", "goog")]);
    const el = blockEl("g1");
    expect(el.hasAttribute("data-drag-src")).toBe(true);
    expect(el.getAttribute("data-drag-id")).toBe(`${EVENT_DRAG_PREFIX}g1`);
    expect(el.querySelector("[data-pb-resize]")).not.toBeNull();
  });

  it("an event on a read-only calendar has no drag attributes and no handle", () => {
    mount([event("h1", "holidays")]);
    const el = blockEl("h1");
    expect(el.hasAttribute("data-drag-src")).toBe(false);
    expect(el.hasAttribute("data-drag-id")).toBe(false);
    expect(el.querySelector("[data-pb-resize]")).toBeNull();
  });

  it("a recurring event stays read-only even on a writable calendar", () => {
    mount([event("r1", "recurring", { isRecurring: true })]);
    const el = blockEl("r1");
    expect(el.hasAttribute("data-drag-src")).toBe(false);
    expect(el.querySelector("[data-pb-resize]")).toBeNull();
  });

  it("pulling the bottom edge reports the event, the snapped distance and a revert", () => {
    mount([event("g1", "goog")]);
    const el = blockEl("g1");
    el.style.height = "52px";
    const handle = el.querySelector("[data-pb-resize]") as HTMLElement;
    act(() => {
      handle.dispatchEvent(pointer("pointerdown", { clientY: 100 }));
    });
    act(() => {
      window.dispatchEvent(pointer("pointermove", { clientY: 130 }));
    });
    flush();
    expect(el.style.height).toBe("78px");
    act(() => {
      window.dispatchEvent(pointer("pointerup", { clientY: 152 }));
    });
    expect(resized).toHaveLength(1);
    expect(resized[0]).toMatchObject({
      blockId: `${EVENT_DRAG_PREFIX}g1`,
      deltaHours: 1,
    });
    resized[0].revert();
    expect(el.style.height).toBe("52px");
  });
});
