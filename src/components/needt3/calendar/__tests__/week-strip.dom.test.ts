/**
 * @jest-environment jsdom
 *
 * The Week grid as an endless strip: all 24 hours, only the columns near the
 * viewport in the DOM, working hours shaded, arrows glide a week, the scroll
 * settles on a day column and reports the first day in view.
 */
import { act, createRef, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { type WeekHandle, WeekView } from "../WeekView";
import { STRIP_BUFFER } from "../strip";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// the frame's flag context lives in V3Root, which imports the CSS entry
jest.mock("../../root/V3Root", () => ({ useDesignV3: () => true }));

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
const WIDTH = 1056; // minus the 56px gutter: seven columns of exactly 143

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
    get: () => WIDTH,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => 600,
  });
  // jsdom has no layout: a scroller that remembers what it was told
  Element.prototype.scrollTo = function scrollTo(
    this: Element,
    arg?: ScrollToOptions | number
  ) {
    if (typeof arg === "object" && arg.left != null) {
      this.scrollLeft = arg.left;
      this.dispatchEvent(new Event("scroll"));
    }
  } as typeof Element.prototype.scrollTo;
  window.requestAnimationFrame = (cb) => {
    cb(0);
    return 1;
  };
  (globalThis as { fetch?: unknown }).fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => "[]",
  });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  jest.useFakeTimers();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.useRealTimers();
});

const block = (date: string, at: number) => ({
  id: `b-${date}`,
  date,
  at,
  len: 60,
  title: `Block ${date}`,
  event: true,
  entry: {
    kind: "event" as const,
    id: `b-${date}`,
    title: `Block ${date}`,
    startAt: `${date}T0${at}:00`,
    endAt: `${date}T0${at + 1}:00`,
  },
});

function mount(props: Partial<Parameters<typeof WeekView>[0]> = {}) {
  const handle = createRef<WeekHandle>();
  const firsts: string[] = [];
  const settled: string[] = [];
  act(() => {
    root.render(
      h(
        QueryClientProvider,
        { client },
        h(WeekView, {
          n: 7,
          initial: "2026-09-07",
          blocks: new Map([
            ["2026-09-08", [block("2026-09-08", 9)]],
            ["2026-12-01", [block("2026-12-01", 9)]],
          ]),
          nowHour: 10,
          today: "2026-09-09",
          work: { days: [1, 2, 3, 4, 5], start: 9, end: 17 },
          draft: null,
          onSlot: () => undefined,
          onSave: () => undefined,
          onCancel: () => undefined,
          onDone: () => undefined,
          onRename: () => undefined,
          onDelete: () => undefined,
          onFirst: (d: string) => firsts.push(d),
          onSettle: (d: string) => settled.push(d),
          handle,
          ...props,
        })
      )
    );
  });
  const scroller = host.querySelector<HTMLElement>(
    ".c2-wscroll"
  ) as HTMLElement;
  return { handle, firsts, settled, scroller };
}

const days = () =>
  Array.from(host.querySelectorAll<HTMLElement>("[data-c2-day]")).map(
    (el) => el.dataset.c2Day
  );

describe("Week strip", () => {
  it("draws all 24 hours", () => {
    mount();
    const labels = Array.from(host.querySelectorAll(".c2-hour")).map(
      (e) => e.textContent
    );
    expect(labels).toHaveLength(24);
    expect(labels[1]).toBe("01:00");
    expect(labels[23]).toBe("23:00");
    // the grid is the whole day tall: 24 × 52px
    expect((host.querySelector(".c2-wgrid") as HTMLElement).style.height).toBe(
      "1248px"
    );
  });

  it("draws the week plus a week of buffer either side, not the whole strip", () => {
    mount();
    expect(days()).toHaveLength(7 + 2 * STRIP_BUFFER);
    expect(days()[0]).toBe("2026-08-31");
    expect(days()).toContain("2026-09-13");
    expect(days()).not.toContain("2026-12-01");
  });

  it("puts the blocks of a day in its column", () => {
    mount();
    const col = host.querySelector('[data-c2-day="2026-09-08"]') as HTMLElement;
    expect(col.querySelector('[data-c2-block="b-2026-09-08"]')).not.toBeNull();
  });

  it("shades the hours outside working hours and non-working days", () => {
    mount();
    const wed = host.querySelector('[data-c2-day="2026-09-09"]') as HTMLElement;
    const spans = Array.from(wed.querySelectorAll<HTMLElement>(".c2-off"));
    expect(spans.map((s) => s.style.height)).toEqual(["468px", "364px"]); // 9h, 7h
    const sun = host.querySelector('[data-c2-day="2026-09-13"]') as HTMLElement;
    expect(sun.querySelectorAll(".c2-off")).toHaveLength(1);
    expect((sun.querySelector(".c2-off") as HTMLElement).style.height).toBe(
      "1248px"
    );
  });

  it("opens with now a third of the way down", () => {
    const { scroller } = mount();
    expect(scroller.scrollTop).toBe(10 * 52 - 200);
  });

  it("opens on the day it was given and reports it", () => {
    const { scroller, firsts } = mount();
    expect(scroller.scrollLeft).toBeCloseTo((5000 * 1000) / 7, 0);
    expect(firsts[0]).toBe("2026-09-07");
  });

  it("glides a week on a jump and keeps the drawn window moving with it", () => {
    const { handle, scroller, firsts, settled } = mount();
    act(() => handle.current?.jump(7));
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(scroller.scrollLeft).toBeCloseTo((5007 * 1000) / 7, 0);
    expect(firsts.at(-1)).toBe("2026-09-14");
    expect(settled.at(-1)).toBe("2026-09-14");
    expect(days()).toContain("2026-09-27");
  });

  it("settles a scroll that stops between two days onto the nearer one", () => {
    const { scroller, settled } = mount();
    const colW = 1000 / 7;
    act(() => {
      scroller.scrollLeft = 5002 * colW + colW * 0.3;
      scroller.dispatchEvent(new Event("scroll"));
    });
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(scroller.scrollLeft).toBeCloseTo(5002 * colW, 0);
    expect(settled.at(-1)).toBe("2026-09-09");
  });

  it("goes to a far day without scrolling through the days between", () => {
    const { handle, scroller } = mount();
    const writes: number[] = [];
    const scrollTo = scroller.scrollTo.bind(scroller);
    scroller.scrollTo = ((arg: ScrollToOptions) => {
      writes.push(arg.left ?? 0);
      scrollTo(arg);
    }) as typeof scroller.scrollTo;
    act(() => handle.current?.goTo("2026-12-01"));
    act(() => {
      jest.advanceTimersByTime(300);
    });
    // 85 days away: the position was set 21 days short, one glide did the rest
    expect(writes).toHaveLength(1);
    expect(days()).toContain("2026-12-01");
  });
});
