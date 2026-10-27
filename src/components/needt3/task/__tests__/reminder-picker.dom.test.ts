/**
 * @jest-environment jsdom
 *
 * The reminder picker: presets, the ticked ones it already has, removing
 * one, and an absolute time.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import type { V3Reminder } from "@/lib/needt3/hooks/reminders";

import { ReminderPicker, specLabel } from "../ReminderPicker";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const onPick = jest.fn();
const onRemove = jest.fn();

const reminder = (over: Partial<V3Reminder>): V3Reminder => ({
  id: "r1",
  taskId: "t1",
  eventId: null,
  title: "Task",
  kind: "BEFORE_START",
  anchor: "start",
  offsetMinutes: 10,
  atTime: null,
  at: null,
  firesAt: null,
  snoozedUntil: null,
  status: "PENDING",
  label: "10 min before",
  link: "/today?task=t1",
  ...over,
});

function mount(props: Partial<Parameters<typeof ReminderPicker>[0]> = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(h(ReminderPicker, { onPick, onRemove, ...props })));
}
const byText = (text: string) =>
  Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((b) =>
    b.textContent?.includes(text)
  );

beforeEach(() => jest.clearAllMocks());
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("ReminderPicker", () => {
  it("picks a preset", () => {
    mount();
    act(() => byText("1 day before, 09:00")?.click());
    expect(onPick).toHaveBeenCalledWith({
      offsetMinutes: 1440,
      atTime: "09:00",
    });
  });

  it("ticks what the task has and removes it on a second press", () => {
    mount({
      current: [
        reminder({}),
        reminder({
          id: "r2",
          kind: "AT_TIME",
          offsetMinutes: null,
          label: "Wed 28 Oct, 14:00",
        }),
      ],
    });
    const ten = byText("10 min before");
    expect(ten?.getAttribute("aria-checked")).toBe("true");
    act(() => ten?.click());
    expect(onRemove).toHaveBeenCalledWith("r1");
    expect(onPick).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Wed 28 Oct, 14:00");
    act(() =>
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="Remove reminder Wed 28 Oct, 14:00"]'
        )
        ?.click()
    );
    expect(onRemove).toHaveBeenCalledWith("r2");
  });

  it("sets an absolute time, and offers only that on its own", () => {
    mount({ relative: false });
    expect(byText("At start")).toBeUndefined();
    const input = host.querySelector<HTMLInputElement>(
      '[aria-label="Remind at a time"]'
    );
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set;
      setter?.call(input, "2026-10-28T14:00");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => byText("Set")?.click());
    expect(onPick).toHaveBeenCalledWith({
      at: new Date("2026-10-28T14:00").toISOString(),
    });
  });

  it("names a spec the way the picker does", () => {
    expect(specLabel({ offsetMinutes: 0 })).toBe("At start");
    expect(specLabel({ offsetMinutes: 1440, atTime: "09:00" })).toBe(
      "1 day before, 09:00"
    );
  });
});
