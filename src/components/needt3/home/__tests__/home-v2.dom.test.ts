/**
 * @jest-environment jsdom
 *
 * Home v2's two pieces: the single overdue row (closed by default, opens to
 * the existing actions and rows) and the rail frame (project-card style, a
 * ring only when there is progress to show).
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import {
  DayCount,
  MissedLine,
  OverdueRow,
  RailFrame,
  dominant,
  ratio,
  reviewHour,
} from "../HomeV2";

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
const render = (el: Parameters<Root["render"]>[0]) =>
  act(async () => root.render(el));

describe("OverdueRow", () => {
  const mount = (count: number, onMove = jest.fn()) =>
    render(
      h(OverdueRow, {
        count,
        children: h("div", { "data-late-rows": "" }, "rows"),
        note: "Move to today puts them all on today.",
        actions: h(
          "button",
          { type: "button", "data-move": "", onClick: onMove },
          "Move to today"
        ),
      })
    );

  it("draws nothing without overdue work", async () => {
    await mount(0);
    expect(host.querySelector("[data-hv2-late]")).toBeNull();
  });

  it("collapses all overdue into one row: N overdue, Sort out", async () => {
    await mount(39);
    const row = host.querySelector("[data-hv2-late]");
    expect(row?.textContent).toContain("39 overdue");
    expect(row?.textContent).toContain("Sort out");
    // closed: no rows, no actions on the screen
    expect(host.querySelector("[data-late-rows]")).toBeNull();
    expect(host.querySelector("[data-move]")).toBeNull();
    expect(
      host
        .querySelector("[data-hv2-late-toggle]")
        ?.getAttribute("aria-expanded")
    ).toBe("false");
  });

  it("expands to the existing actions and rows, and closes again", async () => {
    const onMove = jest.fn();
    await mount(3, onMove);
    const toggle = host.querySelector<HTMLButtonElement>(
      "[data-hv2-late-toggle]"
    )!;
    await act(async () => toggle.click());
    expect(host.querySelector("[data-late-rows]")).not.toBeNull();
    const move = host.querySelector<HTMLButtonElement>("[data-move]")!;
    await act(async () => move.click());
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    await act(async () => toggle.click());
    expect(host.querySelector("[data-late-rows]")).toBeNull();
  });
});

describe("MissedLine", () => {
  it("draws nothing without missed tasks", async () => {
    await render(h(MissedLine, { count: 0, onReschedule: jest.fn() }));
    expect(host.querySelector("[data-hv2-missed]")).toBeNull();
  });

  it("is one line: the count, and Reschedule", async () => {
    await render(h(MissedLine, { count: 2, onReschedule: jest.fn() }));
    const line = host.querySelector("[data-hv2-missed]")!;
    expect(line.textContent).toContain("2 tasks from earlier today");
    expect(line.querySelector("[data-hv2-missed-go]")?.textContent).toBe(
      "Reschedule"
    );
  });

  it("Reschedule runs the action once and is busy until it answers", async () => {
    let finish: () => void = () => undefined;
    const onReschedule = jest.fn(
      () => new Promise<void>((resolve) => (finish = resolve))
    );
    await render(h(MissedLine, { count: 1, onReschedule }));
    const go = host.querySelector<HTMLButtonElement>("[data-hv2-missed-go]")!;
    await act(async () => go.click());
    expect(onReschedule).toHaveBeenCalledTimes(1);
    expect(go.disabled).toBe(true);
    await act(async () => go.click());
    expect(onReschedule).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    expect(go.disabled).toBe(false);
  });
});

describe("DayCount", () => {
  it("is a quiet done/total at the title", async () => {
    await render(h(DayCount, { done: 0, total: 13 }));
    expect(
      host.querySelector("[data-hv2-count]")?.getAttribute("data-hv2-count")
    ).toBe("0/13");
    expect(host.textContent).toBe("0/13");
  });

  it("draws nothing for an empty day", async () => {
    await render(h(DayCount, { done: 0, total: 0 }));
    expect(host.querySelector("[data-hv2-count]")).toBeNull();
  });
});

describe("the Sunday review waits for the evening", () => {
  it("shows from 18:00 local, not before", () => {
    expect(reviewHour(17.99)).toBe(false);
    expect(reviewHour(18)).toBe(true);
    expect(reviewHour(22.5)).toBe(true);
  });
});

describe("RailFrame", () => {
  it("frames the panel in the hue and draws a ring for progress", async () => {
    await render(
      h(RailFrame, {
        label: "habits",
        hue: "#3b82f6",
        pct: 0.5,
        children: h("i", null),
      })
    );
    const frame = host.querySelector<HTMLElement>("[data-hv2-frame=habits]")!;
    expect(frame.dataset.hv2Hue).toBe("#3b82f6");
    expect(frame.querySelector(".hv2-plate svg.wk-ring")).not.toBeNull();
    expect(
      frame.querySelector("[aria-label='Habits, 50% done']")
    ).not.toBeNull();
  });

  it("draws no ring when there is no progress to show", async () => {
    await render(
      h(RailFrame, {
        label: "inbox",
        hue: "var(--text-muted)",
        pct: null,
        children: h("i", null),
      })
    );
    expect(host.querySelector("svg.wk-ring")).toBeNull();
  });
});

describe("helpers", () => {
  it("ratio clamps and is null with nothing to measure", () => {
    expect(ratio(1, 4)).toBe(0.25);
    expect(ratio(5, 4)).toBe(1);
    expect(ratio(0, 0)).toBeNull();
  });
  it("dominant picks the most common id, ignoring blanks", () => {
    expect(dominant([null, "a", "b", "b", undefined])).toBe("b");
    expect(dominant([null, undefined])).toBeNull();
  });
});
