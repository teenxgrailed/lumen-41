/**
 * @jest-environment jsdom
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { TimeLeftBar } from "../TimeLeftBar";
import { minutesAhead, timeLeft, timeLeftLine } from "../timeleft";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("minutesAhead", () => {
  it("counts only what is still ahead", () => {
    const items = [
      { at: 9, len: 60 }, // over
      { at: 10, len: 60 }, // half done at 10:30
      { at: 14, len: 30 },
    ];
    expect(minutesAhead(items, 10.5)).toBe(60);
    expect(minutesAhead(items, 15)).toBe(0);
  });
});

describe("timeLeft", () => {
  const open = (m: number | null) => ({ done: false, estimatedMinutes: m });

  it("compares planned work with the free time", () => {
    const t = timeLeft({
      capacity: 240,
      eventsAhead: 60,
      openTasks: [open(60), open(30), { done: true, estimatedMinutes: 500 }],
    });
    expect(t).toMatchObject({ planned: 150, free: 240, over: false });
    expect(t?.fill).toBeCloseTo(150 / 240);
    expect(timeLeftLine(t!)).toBe("2 h 30 planned · 1 h 30 free");
  });

  it("warns softly when overbooked", () => {
    const t = timeLeft({
      capacity: 120,
      eventsAhead: 60,
      openTasks: [open(120)],
    });
    expect(t).toMatchObject({ over: true, overBy: 60, fill: 1 });
    expect(timeLeftLine(t!)).toBe("3 h planned, 1 h more than the time left");
  });

  it("lets personal blocks take from the free time", () => {
    const t = timeLeft({
      capacity: 240,
      blocked: 120,
      eventsAhead: 0,
      openTasks: [open(150)],
    });
    expect(t).toMatchObject({ free: 120, over: true, overBy: 30 });
  });

  it("is null on a day off, after work, or with nothing planned", () => {
    expect(
      timeLeft({ capacity: null, eventsAhead: 0, openTasks: [open(60)] })
    ).toBeNull();
    expect(
      timeLeft({ capacity: 0, eventsAhead: 0, openTasks: [open(60)] })
    ).toBeNull();
    expect(
      timeLeft({ capacity: 200, eventsAhead: 0, openTasks: [open(null)] })
    ).toBeNull();
  });
});

describe("TimeLeftBar", () => {
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

  it("draws nothing without a comparison", async () => {
    await act(async () => root.render(h(TimeLeftBar, { left: null })));
    expect(host.innerHTML).toBe("");
  });

  it("marks an overbooked day", async () => {
    const left = timeLeft({
      capacity: 60,
      eventsAhead: 0,
      openTasks: [{ done: false, estimatedMinutes: 120 }],
    });
    await act(async () => root.render(h(TimeLeftBar, { left })));
    expect(
      host.querySelector("[data-tl-bar]")?.getAttribute("data-tl-over")
    ).toBe("true");
    expect(host.textContent).toContain("more than the time left");
  });
});
