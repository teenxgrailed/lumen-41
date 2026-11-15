/**
 * @jest-environment jsdom
 *
 * The card's own actions: Schedule places the next step and Plan a task opens
 * the goal, and neither also toggles the card (a button inside a clickable
 * card must not select it twice).
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import type { GoalView } from "@/lib/goals";

import { GoalCards } from "../GoalCards";

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

const goal = {
  id: "g1",
  title: "Run 10k",
  deadline: null,
  area: "health",
  status: "active",
  createdAt: "2026-10-01T00:00:00.000Z",
  progress: { source: "tasks", ratio: 0, percent: 0, done: 0, total: 1 },
} as unknown as GoalView;

function draw(extra: Record<string, unknown> = {}) {
  const onSelect = jest.fn();
  const onSchedule = jest.fn();
  const onPlan = jest.fn();
  act(() =>
    root.render(
      h(GoalCards, {
        goals: [goal],
        selectedId: null,
        nextSteps: { g1: { id: "t1", title: "Buy running shoes" } },
        stepDays: {},
        planned: { g1: false },
        today: "2026-11-15",
        onSelect,
        onSchedule,
        onPlan,
        ...extra,
      })
    )
  );
  return { onSelect, onSchedule, onPlan };
}

describe("Goal card actions", () => {
  it("Schedule places the next step and does not select the card", () => {
    const { onSelect, onSchedule } = draw();
    const button = host.querySelector(
      '[data-gl-schedule="g1"]'
    ) as HTMLButtonElement;
    act(() => button.click());
    expect(onSchedule).toHaveBeenCalledWith("t1");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("Plan a task opens that goal and does not toggle the card", () => {
    const { onSelect, onPlan } = draw();
    const button = host.querySelector('[data-gl-plan="g1"]') as HTMLElement;
    act(() => button.click());
    expect(onPlan).toHaveBeenCalledWith("g1");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("the card itself still selects, by click", () => {
    const { onSelect } = draw();
    act(() => (host.querySelector("[data-gl-card]") as HTMLElement).click());
    expect(onSelect).toHaveBeenCalledWith("g1");
  });

  it("disables Schedule while a placement runs", () => {
    draw({ busy: true });
    expect(
      (host.querySelector('[data-gl-schedule="g1"]') as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });
});
