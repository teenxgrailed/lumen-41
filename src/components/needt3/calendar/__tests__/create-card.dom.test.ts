/**
 * @jest-environment jsdom
 *
 * The calendar's new-event card. It has a Date row (a month grid, as the
 * Composer's Event form has) and its dropdowns take the click that was made:
 * a press on a menu drawn in the shell's portal is a press in the card, not
 * outside it; a time row under a still pointer does not slide away; the row
 * clicked is the row chosen.
 */
import { act, createRef, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { CreateCard, type CreateSpec, pressIsInsideCard } from "../CreateCard";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let mockPortal: HTMLDivElement;
jest.mock("../../ctx/PortalScope", () => ({
  useV3PortalContainer: () => mockPortal,
}));

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let host: HTMLDivElement;
let ghost: HTMLDivElement;
let root: Root;
let onCreate: jest.Mock;
let onCancel: jest.Mock;
let onRange: jest.Mock;
let scrolled: jest.Mock;

const CALENDARS = [
  { id: "cal-a", name: "Needt", detail: "Only in Needt" },
  { id: "cal-g", name: "Work", detail: "me@gmail.com" },
];

beforeEach(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = RO;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  // the last calendar picked is remembered by the store: start clean
  useNeedt3Ui.setState({ lastCalendarId: null });
  scrolled = jest.fn();
  Element.prototype.scrollIntoView = scrolled as never;
  onCreate = jest.fn();
  onCancel = jest.fn();
  onRange = jest.fn();
  mockPortal = document.createElement("div");
  mockPortal.className = "needt-v3";
  document.body.appendChild(mockPortal);
  ghost = document.createElement("div");
  document.body.appendChild(ghost);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  ghost.remove();
  mockPortal.remove();
});

function mount(kind: "task" | "event" | "personal" = "event") {
  const anchor = createRef<HTMLElement>();
  (anchor as { current: HTMLElement | null }).current = ghost;
  act(() => {
    root.render(
      h(CreateCard, {
        anchor,
        date: "2026-09-09",
        at: 9,
        end: 10,
        sized: true,
        kind,
        onKind: () => undefined,
        onRange,
        calendars: CALENDARS,
        onCreate,
        onCancel,
      })
    );
  });
}

const q = <T extends Element>(sel: string) => mockPortal.querySelector<T>(sel);
const mouse = (type: string, init: MouseEventInit = {}) =>
  new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init });
const click = (el: Element) => act(() => void el.dispatchEvent(mouse("click")));
const press = (el: Element) =>
  act(() => void el.dispatchEvent(mouse("mousedown")));

function typeTitle(value: string) {
  const el = q<HTMLInputElement>("[data-c2-create-title]")!;
  const set = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )!.set!;
  act(() => {
    set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("the Date row", () => {
  it("shows the day the card was opened on", () => {
    mount();
    expect(q("[data-c2-create-date]")!.textContent).toContain("9 Sep");
  });

  it("opens a month grid; the day picked is the day created", () => {
    mount();
    expect(q(".tdc-cal")).toBeNull();
    click(q("[data-c2-create-date]")!);
    const grid = q(".tdc-cal")!;
    expect(grid).not.toBeNull();
    const day = Array.from(
      grid.querySelectorAll<HTMLButtonElement>(".tdc-cal-day")
    ).find((b) => b.textContent === "15")!;
    click(day);
    // the grid folds away and the button shows the pick
    expect(q(".tdc-cal")).toBeNull();
    expect(q("[data-c2-create-date]")!.textContent).toContain("15 Sep");
    typeTitle("Lunch with Sam");
    click(q("[data-c2-create-go]")!);
    expect(onCreate).toHaveBeenCalledTimes(1);
    const spec = onCreate.mock.calls[0][0] as CreateSpec;
    expect(spec).toMatchObject({
      kind: "event",
      title: "Lunch with Sam",
      date: "2026-09-15",
      at: 9,
      end: 10,
    });
  });

  it("creates on the opened day when no other day was picked", () => {
    mount();
    typeTitle("Standup");
    click(q("[data-c2-create-go]")!);
    expect(onCreate.mock.calls[0][0]).toMatchObject({ date: "2026-09-09" });
  });
});

describe("a press on a menu the card opened", () => {
  it("is inside the card; a press elsewhere is outside", () => {
    const menu = document.createElement("div");
    menu.setAttribute("data-radix-popper-content-wrapper", "");
    const item = document.createElement("div");
    item.setAttribute("role", "menuitemradio");
    menu.appendChild(item);
    mockPortal.appendChild(menu);
    expect(pressIsInsideCard(item, null, null)).toBe(true);
    expect(pressIsInsideCard(document.body, null, null)).toBe(false);
    expect(pressIsInsideCard(ghost, null, ghost)).toBe(true);
  });

  it("does not drop the draft; a press outside does", () => {
    mount();
    const menu = document.createElement("div");
    menu.setAttribute("data-radix-popper-content-wrapper", "");
    const item = document.createElement("div");
    item.setAttribute("role", "menuitemradio");
    menu.appendChild(item);
    mockPortal.appendChild(menu);
    press(item);
    expect(onCancel).not.toHaveBeenCalled();
    press(document.body);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("the Calendar dropdown selects the item that was clicked", () => {
    mount();
    const trigger = q<HTMLButtonElement>('button[aria-label="Calendar"]')!;
    // Radix opens a menu on the primary button's pointerdown
    act(() => void trigger.dispatchEvent(mouse("pointerdown")));
    const items = Array.from(
      document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')
    );
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringContaining("Needt"),
      expect.stringContaining("Work"),
    ]);
    // the press lands in the portal first, as a real click does
    press(items[1]);
    expect(onCancel).not.toHaveBeenCalled();
    click(items[1]);
    typeTitle("Review");
    click(q("[data-c2-create-go]")!);
    expect(onCreate.mock.calls[0][0]).toMatchObject({ calendarId: "cal-g" });
  });
});

describe("the Calendar row", () => {
  const trigger = () => q<HTMLButtonElement>('button[aria-label="Calendar"]')!;

  it("starts on Only in Needt, the first calendar, and says so once", () => {
    mount();
    expect(trigger().textContent).toBe("Needt · Only in Needt");
    typeTitle("Standup");
    click(q("[data-c2-create-go]")!);
    expect(onCreate.mock.calls[0][0]).toMatchObject({ calendarId: "cal-a" });
  });

  it("opens its list above the card, lined up with the button", () => {
    mount();
    act(() => void trigger().dispatchEvent(mouse("pointerdown")));
    const list = document.querySelector<HTMLElement>('[role="menu"]')!;
    expect(Number(list.style.zIndex)).toBeGreaterThan(
      Number(q<HTMLElement>(".c2-create")!.style.zIndex || 1200)
    );
    expect(list.className).not.toContain("is-right");
  });
});

describe("the type switch", () => {
  it("says Personal, short enough for its third of the switch", () => {
    mount();
    const labels = Array.from(
      mockPortal.querySelectorAll<HTMLElement>("[role='tab'], button")
    ).map((b) => b.textContent);
    expect(labels).toContain("Personal");
    expect(labels).not.toContain("Personal time");
  });
});

describe("the time list", () => {
  const start = () => q<HTMLInputElement>("[data-c2-create-from]")!;
  const rows = () =>
    Array.from(mockPortal.querySelectorAll<HTMLElement>(".c2-tf-row"));
  const row = (text: string) =>
    rows().find((r) => r.textContent?.startsWith(text))!;

  it("takes the row that was clicked", () => {
    mount();
    click(start());
    expect(rows().length).toBeGreaterThan(40);
    click(row("10:30"));
    // the start moved to 10:30 and the length stayed an hour
    expect(onRange).toHaveBeenCalledWith(10.5, 11.5);
  });

  it("takes the row under the pointer after the pointer moved over others", () => {
    mount();
    click(start());
    act(() => void row("09:15").dispatchEvent(mouse("mousemove")));
    act(() => void row("14:00").dispatchEvent(mouse("mousemove")));
    act(() => void row("11:00").dispatchEvent(mouse("mousemove")));
    click(row("11:00"));
    expect(onRange).toHaveBeenCalledWith(11, 12);
  });

  it("does not scroll the list when the pointer lights a row", () => {
    mount();
    click(start());
    const opened = scrolled.mock.calls.length;
    expect(opened).toBeGreaterThan(0);
    act(() => void row("09:30").dispatchEvent(mouse("mousemove")));
    act(() => void row("09:45").dispatchEvent(mouse("mousemove")));
    expect(scrolled).toHaveBeenCalledTimes(opened);
    // the keys still follow the highlight
    act(
      () =>
        void start().dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
        )
    );
    expect(scrolled.mock.calls.length).toBeGreaterThan(opened);
  });

  it("a press on a row keeps focus in the field (it is not a blur)", () => {
    mount();
    click(start());
    const down = mouse("mousedown");
    row("10:00").dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
  });
});
