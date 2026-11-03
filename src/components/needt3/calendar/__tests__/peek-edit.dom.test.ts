/**
 * @jest-environment jsdom
 *
 * The event peek's Edit: for an event on a calendar that takes writes it
 * opens the title, the day and the start and end, and Save writes all of
 * them in one go. A read-only event has no Edit.
 */
import { act, createElement as h } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Root, createRoot } from "react-dom/client";

import { type CalItem, calendarItems, canEditEvent } from "../blocks";
import { Peek, eventEditStamps } from "../popovers";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../ctx/PortalScope", () => ({
  useV3PortalContainer: () => document.body,
}));

let host: HTMLDivElement;
let root: Root;
let onEdit: jest.Mock;
let onRename: jest.Mock;

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  (globalThis as { fetch?: unknown }).fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => "[]",
  });
  onEdit = jest.fn();
  onRename = jest.fn();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

const ev = (calendarId: string) => ({
  id: "g1",
  title: "Review",
  startAt: "2026-09-09T10:00",
  endAt: "2026-09-09T11:00",
  isAllDay: false,
  calendarId,
  source: "google" as const,
  externalId: "x",
});

function item(calendarId: string): CalItem {
  const { timed } = calendarItems({
    tasks: [],
    events: [ev(calendarId)],
    writableCalendarIds: new Set(["goog"]),
    today: "2026-09-09",
    hideDone: false,
  });
  return timed[0];
}

function mount(b: CalItem) {
  act(() => {
    root.render(
      h(
        QueryClientProvider,
        { client: new QueryClient() },
        h(Peek, {
          b,
          rect: { top: 100, left: 100, right: 200 },
          leaving: false,
          today: "2026-09-09",
          onEnter: () => undefined,
          onLeave: () => undefined,
          onDone: () => undefined,
          onRename,
          onEdit,
          onDelete: () => undefined,
          onClose: () => undefined,
        })
      )
    );
  });
}

const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);
const setValue = (el: HTMLInputElement, value: string) => {
  const set = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )!.set!;
  act(() => {
    set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const click = (el: Element) =>
  act(() => void el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const button = (text: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (b) => b.textContent === text
  );

describe("the event peek", () => {
  it("a writable synced event can be edited: title, day, start and end", () => {
    const b = item("goog");
    expect(canEditEvent(b)).toBe(true);
    mount(b);
    click(button("Edit")!);
    setValue(q("[aria-label='Event title']")!, "Review v2");
    setValue(q("[data-c2-edit-date]")!, "2026-09-11");
    setValue(q("[data-c2-edit-from]")!, "14:00");
    setValue(q("[data-c2-edit-to]")!, "15:30");
    click(button("Save")!);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit.mock.calls[0][1]).toEqual({
      title: "Review v2",
      startAt: "2026-09-11T14:00",
      endAt: "2026-09-11T15:30",
    });
    expect(onRename).not.toHaveBeenCalled();
  });

  it("saves nothing when nothing changed", () => {
    mount(item("goog"));
    click(button("Edit")!);
    click(button("Save")!);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("a read-only event has no Edit", () => {
    const b = item("holidays");
    expect(canEditEvent(b)).toBe(false);
    mount(b);
    expect(button("Edit")).toBeUndefined();
    expect(button("Delete")).toBeUndefined();
  });
});

describe("eventEditStamps", () => {
  const was = { startAt: "2026-09-09T10:00", endAt: "2026-09-09T11:00" };
  it("keeps the end on the same distance of days and fixes an end before the start", () => {
    expect(eventEditStamps(was, "2026-09-10", "09:00", "10:00")).toEqual({
      startAt: "2026-09-10T09:00",
      endAt: "2026-09-10T10:00",
    });
    expect(eventEditStamps(was, "2026-09-09", "10:00", "09:00")).toEqual({
      startAt: "2026-09-09T10:00",
      endAt: "2026-09-09T10:15",
    });
    expect(eventEditStamps(was, "", "10:00", "11:00")).toBeNull();
  });
});
