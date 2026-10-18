/**
 * @jest-environment jsdom
 *
 * Personal time on screen: the band is calm and tinted (never the accent),
 * sits behind the blocks of its day column, opens its own card instead of a
 * new event, and the empty-slot menu lists the presets without taking focus
 * from the draft.
 */
import { act, createRef, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import type { DayBand } from "@/lib/personal-time-days";

import { type WeekHandle, WeekView } from "../../calendar/WeekView";
import { PersonalBand, PersonalRow } from "../PersonalBand";
import { PersonalSlotMenu } from "../PersonalSlotMenu";

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
  Element.prototype.scrollTo = function scrollTo() {} as never;
  Element.prototype.scrollIntoView = function scrollIntoView() {} as never;
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

const lunch: DayBand = {
  key: "lunch:2026-09-09:13",
  blockId: "lunch",
  kind: "lunch",
  title: "Lunch",
  emoji: "🍽️",
  tone: "info",
  date: "2026-09-09",
  from: 13,
  to: 14,
  repeating: true,
  linked: false,
};

describe("PersonalBand", () => {
  it("shows the emoji, the name and the time, tinted and named for assistive tech", () => {
    act(() =>
      root.render(
        h(PersonalBand, {
          title: "Lunch",
          emoji: "🍽️",
          tone: "info",
          time: "13:00–14:00",
        })
      )
    );
    const band = host.querySelector("[data-personal-band]") as HTMLElement;
    expect(band.dataset.tone).toBe("info");
    expect(band.getAttribute("aria-label")).toBe(
      "Lunch, personal time, 13:00–14:00"
    );
    expect(band.querySelector(".pb-emoji")?.textContent).toBe("🍽️");
    expect(band.querySelector(".pb-name")?.textContent).toBe("Lunch");
    expect(band.querySelector(".pb-time")?.textContent).toBe("13:00–14:00");
    // not a button unless it can open something
    expect(band.getAttribute("role")).toBe("group");
  });

  it("collapses to the emoji alone when too short for words", () => {
    act(() =>
      root.render(
        h(PersonalBand, {
          title: "Break",
          emoji: "☕",
          tone: "info",
          compact: true,
        })
      )
    );
    const band = host.querySelector("[data-personal-band]") as HTMLElement;
    expect(band.querySelector(".pb-name")).toBeNull();
    expect(band.title).toContain("Break");
  });

  it("is a button that opens when it has somewhere to go, from the keyboard too", () => {
    const open = jest.fn();
    act(() =>
      root.render(
        h(PersonalBand, {
          title: "Walk",
          emoji: "🚶",
          tone: "success",
          onOpen: open,
        })
      )
    );
    const band = host.querySelector("[data-personal-band]") as HTMLElement;
    expect(band.getAttribute("role")).toBe("button");
    act(() => band.click());
    act(() => {
      band.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
    });
    expect(open).toHaveBeenCalledTimes(2);
  });

  it("a row of a band reads the same", () => {
    act(() => root.render(h(PersonalRow, { band: lunch })));
    const band = host.querySelector("[data-personal-band]") as HTMLElement;
    expect(band.dataset.variant).toBe("row");
    expect(band.dataset.repeating).toBe("");
    expect(band.textContent).toContain("13:00–14:00");
  });
});

describe("Week grid with personal time", () => {
  function mount(extra: Record<string, unknown> = {}) {
    const onSlot = jest.fn();
    const onPersonal = jest.fn();
    act(() => {
      root.render(
        h(
          QueryClientProvider,
          { client },
          h(WeekView, {
            n: 7,
            initial: "2026-09-07",
            blocks: new Map(),
            nowHour: 10,
            today: "2026-09-09",
            work: { days: [1, 2, 3, 4, 5], start: 9, end: 17 },
            draft: null,
            onSlot,
            onSave: () => undefined,
            onCancel: () => undefined,
            onDone: () => undefined,
            onRename: () => undefined,
            onDelete: () => undefined,
            handle: createRef<WeekHandle>(),
            personal: new Map([["2026-09-09", [lunch]]]),
            onPersonal,
            ...extra,
          })
        )
      );
    });
    return { onSlot, onPersonal };
  }

  it("draws the band edge to edge in its day, at its hour, behind the hour lines", () => {
    mount();
    const col = host.querySelector('[data-c2-day="2026-09-09"]') as HTMLElement;
    const band = col.querySelector("[data-personal-band]") as HTMLElement;
    expect(band).not.toBeNull();
    expect(band.dataset.variant).toBe("grid");
    expect(band.style.top).toBe(`${13 * 52}px`);
    expect(band.style.height).toBe(`${52}px`);
    // painted before the hour lines, so they draw over it
    const children = Array.from(col.children);
    expect(children.indexOf(band)).toBeLessThan(
      children.indexOf(col.querySelector(".c2-hlines") as Element)
    );
    // no other day has one
    const tue = host.querySelector('[data-c2-day="2026-09-08"]') as HTMLElement;
    expect(tue.querySelector("[data-personal-band]")).toBeNull();
  });

  it("opens its own card on a click and does not start a new event", () => {
    const { onSlot, onPersonal } = mount();
    const band = host.querySelector("[data-personal-band]") as HTMLElement;
    act(() => band.click());
    expect(onPersonal).toHaveBeenCalledTimes(1);
    expect(onPersonal.mock.calls[0][0]).toMatchObject({ blockId: "lunch" });
    expect(onSlot).not.toHaveBeenCalled();
  });

  it("lists the presets beside the draft and picks one without blurring it", () => {
    const pick = jest.fn();
    mount({
      draft: { date: "2026-09-10", at: 10, key: 1 },
      onPersonalPreset: pick,
    });
    const menu = document.body.querySelector(
      "[data-pb-slot-menu]"
    ) as HTMLElement;
    expect(menu).not.toBeNull();
    const kinds = Array.from(
      menu.querySelectorAll<HTMLElement>("[data-pb-preset]")
    ).map((el) => el.dataset.pbPreset);
    expect(kinds).toEqual([
      "lunch",
      "break",
      "walk",
      "dinner",
      "gym",
      "party",
      "rest",
    ]);
    // mouse down must not move focus off the draft's input
    const down = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    menu.querySelector("[data-pb-preset]")?.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    act(() =>
      (menu.querySelector('[data-pb-preset="walk"]') as HTMLElement).click()
    );
    expect(pick).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "walk", title: "Walk" })
    );
  });
});

describe("PersonalSlotMenu", () => {
  it("renders nothing without an anchor to sit beside", () => {
    act(() =>
      root.render(
        h(PersonalSlotMenu, {
          anchor: createRef<HTMLElement>(),
          onPick: () => undefined,
        })
      )
    );
    expect(document.body.querySelector("[data-pb-slot-menu]")).toBeNull();
  });
});
