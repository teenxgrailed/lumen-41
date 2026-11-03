/**
 * @jest-environment jsdom
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { HaTimeline, type HaTimelineRow } from "../ha/HaTimeline";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const rows: HaTimelineRow[] = [
  {
    key: "a",
    t: "09:00",
    task: { id: "t1", title: "Renew the domain", c: "#888", d: "30m" },
  },
  {
    key: "b",
    t: "10:00",
    task: { title: "Standup", c: "#888", d: "15m", event: true },
  },
];

function render(onOpen: (id: string) => void) {
  act(() => root.render(h(HaTimeline, { rows, onOpen })));
}

describe("HaTimeline keyboard", () => {
  it("makes a task row a button reachable by Tab", () => {
    render(() => {});
    const task = host.querySelectorAll<HTMLElement>(".ha-task")[0];
    expect(task.getAttribute("role")).toBe("button");
    expect(task.tabIndex).toBe(0);
  });

  it("opens the task on Enter and Space", () => {
    const onOpen = jest.fn();
    render(onOpen);
    const task = host.querySelectorAll<HTMLElement>(".ha-task")[0];
    for (const key of ["Enter", " "]) {
      act(() => {
        task.dispatchEvent(
          new KeyboardEvent("keydown", { key, bubbles: true })
        );
      });
    }
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(onOpen).toHaveBeenCalledWith("t1");
  });

  it("leaves a calendar event out of the tab order", () => {
    render(() => {});
    const event = host.querySelectorAll<HTMLElement>(".ha-task")[1];
    expect(event.getAttribute("role")).toBeNull();
    expect(event.hasAttribute("tabindex")).toBe(false);
  });
});
