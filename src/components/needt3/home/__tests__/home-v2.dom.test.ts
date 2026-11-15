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
  const idle = { kind: "idle" } as const;
  const change = {
    taskId: "a",
    title: "Write brief",
    toStart: "2030-01-02T15:00:00.000Z",
    toEnd: "2030-01-02T15:30:00.000Z",
    explanation: "Missed at 08:30",
  };
  const props = (o: Record<string, unknown> = {}) => ({
    count: 2,
    step: idle,
    tz: "UTC",
    onOpen: jest.fn(),
    onKeep: jest.fn(),
    onDismiss: jest.fn(),
    ...o,
  });

  it("draws nothing without missed tasks", async () => {
    await render(h(MissedLine, props({ count: 0 })));
    expect(host.querySelector("[data-hv2-missed]")).toBeNull();
  });

  it("is one line: the count, and open slots", async () => {
    await render(h(MissedLine, props()));
    const line = host.querySelector("[data-hv2-missed]")!;
    expect(line.textContent).toContain("2 tasks from earlier today");
    expect(line.querySelector("[data-hv2-missed-go]")?.textContent).toBe(
      "\u2192 open slots"
    );
    expect(host.querySelector("[data-hv2-missed-prev]")).toBeNull();
  });

  it("pressing it asks once; while planning it is busy", async () => {
    const p = props();
    await render(h(MissedLine, p));
    const go = host.querySelector<HTMLButtonElement>("[data-hv2-missed-go]")!;
    await act(async () => go.click());
    expect(p.onOpen).toHaveBeenCalledTimes(1);
    await render(h(MissedLine, { ...p, step: { kind: "previewing" } }));
    expect(go.disabled).toBe(true);
  });

  it("the preview lists each change with its time and reason, and what did not fit", async () => {
    await render(
      h(
        MissedLine,
        props({
          step: {
            kind: "preview",
            token: "t",
            changes: [change],
            unscheduled: [{ taskId: "b", title: "Too long" }],
          },
        })
      )
    );
    const prev = host.querySelector("[data-hv2-missed-prev]")!;
    expect(prev.querySelector("[data-change=a]")?.textContent).toContain(
      "Write brief"
    );
    expect(prev.textContent).toContain("Wed 15:00");
    expect(prev.textContent).toContain("Missed at 08:30");
    expect(prev.querySelector("[data-unscheduled=b]")?.textContent).toContain(
      "Didn't fit today"
    );
  });

  it("Keep and Dismiss call their handlers; with nothing placed there is no Keep", async () => {
    const p = props({
      step: { kind: "preview", token: "t", changes: [change], unscheduled: [] },
    });
    await render(h(MissedLine, p));
    await act(async () =>
      host.querySelector<HTMLButtonElement>("[data-hv2-missed-keep]")!.click()
    );
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>("[data-hv2-missed-dismiss]")!
        .click()
    );
    expect(p.onKeep).toHaveBeenCalledTimes(1);
    expect(p.onDismiss).toHaveBeenCalledTimes(1);
    await render(
      h(
        MissedLine,
        props({
          step: {
            kind: "preview",
            token: "t",
            changes: [],
            unscheduled: [{ taskId: "b", title: "Too long" }],
          },
        })
      )
    );
    expect(host.querySelector("[data-hv2-missed-keep]")).toBeNull();
    expect(host.querySelector("[data-hv2-missed-dismiss]")).not.toBeNull();
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
