/**
 * @jest-environment jsdom
 *
 * The habit card stack and month grid, mounted for real: a swipe right marks
 * the top habit done and the notice's Undo takes it back; a short or vertical
 * drag does nothing; the Done button and Enter do what the swipe does; under
 * reduced motion the card is gone at once; the month grid colours days by the
 * share of habits kept. The goal cards show a next step and a risk hint.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import type { GoalView } from "@/lib/goals";
import { notify } from "@/lib/notifications";

import { GoalCards } from "../../../goals/GoalCards";
import type { HabitsController } from "../../useHabitsController";
import { HabitCardsPanel, HabitMonthGrid, HabitStack } from "../HabitCards";
import { LEAVE_MS } from "../useSwipeDone";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/notifications", () => ({
  notify: { success: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

const TODAY = "2026-11-15";
const habit = (id: string, title: string) => ({
  id,
  title,
  projectId: null,
  color: "#cc3366",
  icon: null,
  schedule: { time: null, perWeek: null },
  archivedAt: null,
});

let host: HTMLDivElement;
let root: Root;
let reduce = false;
const tick = jest.fn();

function fakeCtl(over: Partial<HabitsController> = {}): HabitsController {
  const list = [habit("a", "Read"), habit("b", "Stretch"), habit("c", "Walk")];
  return {
    today: TODAY,
    list,
    shown: list,
    over: false,
    all: false,
    setAll: jest.fn(),
    checkins: [],
    history: [],
    projects: [],
    kept: 0,
    tick,
    openEdit: jest.fn(),
    archive: jest.fn(),
    ...over,
  } as unknown as HabitsController;
}

function pointer(
  type: string,
  p: { x?: number; y?: number; kind?: string } = {}
) {
  const e = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: p.x ?? 0,
    clientY: p.y ?? 0,
  });
  Object.defineProperty(e, "pointerId", { value: 1 });
  Object.defineProperty(e, "pointerType", { value: p.kind ?? "touch" });
  return e;
}
const fire = (el: Element | Window, type: string, p = {}) =>
  act(() => {
    el.dispatchEvent(pointer(type, p));
  });

/** A slow drag, so velocity never turns a short pull into a flick. */
function slowClock() {
  let t = 1000;
  jest.spyOn(performance, "now").mockImplementation(() => (t += 400));
}

const q = <T extends Element>(sel: string) => host.querySelector<T>(sel)!;
const topCard = () => q<HTMLElement>("[data-hc-card].is-top");

const drag = (el: Element, from: [number, number], to: [number, number]) => {
  fire(el, "pointerdown", { x: from[0], y: from[1] });
  fire(window, "pointermove", { x: to[0], y: to[1] });
  fire(window, "pointerup", { x: to[0], y: to[1] });
};

beforeEach(() => {
  jest.useFakeTimers();
  reduce = false;
  tick.mockClear();
  (notify.success as jest.Mock).mockClear();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: reduce && query.includes("reduce"),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  jest.restoreAllMocks();
  act(() => root.unmount());
  host.remove();
  jest.useRealTimers();
});

const mount = (node: ReturnType<typeof h>) => act(() => root.render(node));

describe("the stack", () => {
  it("shows the first habit on top, two edges behind it, and a count", () => {
    mount(h(HabitStack, { ctl: fakeCtl() }));
    expect(q("[data-hc-stack]").getAttribute("data-hc-stack")).toBe("3");
    expect(host.querySelectorAll("[data-hc-card]")).toHaveLength(3);
    expect(topCard().textContent).toContain("Read");
    expect(topCard().getAttribute("tabindex")).toBe("0");
    // only the top card can be acted on
    expect(
      host.querySelectorAll("[data-hc-card]:not(.is-top)[inert]")
    ).toHaveLength(2);
  });

  it("a kept habit leaves the stack", () => {
    const ctl = fakeCtl({
      checkins: [{ habitId: "a", date: TODAY, done: true }],
    });
    mount(h(HabitStack, { ctl }));
    expect(host.querySelector('[data-hc-card="a"]')).toBeNull();
    expect(topCard().textContent).toContain("Stretch");
  });

  it("says so when nothing is left", () => {
    const ctl = fakeCtl({
      checkins: ["a", "b", "c"].map((habitId) => ({
        habitId,
        date: TODAY,
        done: true,
      })),
    });
    mount(h(HabitStack, { ctl }));
    expect(q("[data-hc-clear]").textContent).toBe("All done for today.");
    expect(host.querySelector("[data-hc-card]")).toBeNull();
  });
});

describe("swipe right is done", () => {
  it("a long swipe marks the habit done after the card leaves, with an Undo", () => {
    slowClock();
    mount(h(HabitStack, { ctl: fakeCtl() }));
    const card = topCard();
    drag(card, [20, 30], [180, 34]);
    // flying out: nothing is written until it has gone
    expect(card.classList.contains("is-leaving")).toBe(true);
    expect(card.style.transform).toContain("translate3d(120%");
    expect(tick).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(LEAVE_MS + 5);
    });
    expect(tick).toHaveBeenCalledTimes(1);
    expect(tick.mock.calls[0][0].id).toBe("a");
    expect(tick.mock.calls[0][1]).toBe(true);
    expect(notify.success).toHaveBeenCalledTimes(1);
    const [message, options] = (notify.success as jest.Mock).mock.calls[0];
    expect(message).toBe("Read done");
    expect(options.action.label).toBe("Undo");
  });

  it("Undo marks it not done again", () => {
    slowClock();
    mount(h(HabitStack, { ctl: fakeCtl() }));
    drag(topCard(), [20, 30], [180, 30]);
    act(() => {
      jest.advanceTimersByTime(LEAVE_MS + 5);
    });
    const { action } = (notify.success as jest.Mock).mock.calls[0][1];
    tick.mockClear();
    act(() => action.onClick());
    expect(tick).toHaveBeenCalledTimes(1);
    expect(tick.mock.calls[0][0].id).toBe("a");
    expect(tick.mock.calls[0][1]).toBe(false);
  });

  it("a flick counts even when it is short", () => {
    let t = 1000;
    jest.spyOn(performance, "now").mockImplementation(() => (t += 10));
    mount(h(HabitStack, { ctl: fakeCtl() }));
    drag(topCard(), [20, 30], [80, 30]); // 60px in ~10ms
    act(() => {
      jest.advanceTimersByTime(LEAVE_MS + 5);
    });
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it("a short, slow pull goes home and writes nothing", () => {
    slowClock();
    mount(h(HabitStack, { ctl: fakeCtl() }));
    const card = topCard();
    drag(card, [20, 30], [60, 30]);
    act(() => {
      jest.advanceTimersByTime(LEAVE_MS + 5);
    });
    expect(card.style.transform).toBe("");
    expect(tick).not.toHaveBeenCalled();
    expect(notify.success).not.toHaveBeenCalled();
  });

  it("swiping left does not complete anything", () => {
    slowClock();
    mount(h(HabitStack, { ctl: fakeCtl() }));
    const card = topCard();
    drag(card, [200, 30], [20, 30]);
    act(() => {
      jest.advanceTimersByTime(LEAVE_MS + 5);
    });
    expect(tick).not.toHaveBeenCalled();
    expect(card.style.transform).toBe("");
  });

  it("a vertical drag is the page's scroll and is never taken", () => {
    slowClock();
    mount(h(HabitStack, { ctl: fakeCtl() }));
    const card = topCard();
    drag(card, [20, 20], [30, 200]);
    act(() => {
      jest.advanceTimersByTime(LEAVE_MS + 5);
    });
    expect(card.style.transform).toBe("");
    expect(tick).not.toHaveBeenCalled();
  });

  it("a cancelled pointer commits nothing", () => {
    slowClock();
    mount(h(HabitStack, { ctl: fakeCtl() }));
    const card = topCard();
    fire(card, "pointerdown", { x: 20, y: 30 });
    fire(window, "pointermove", { x: 200, y: 30 });
    fire(window, "pointercancel", { x: 200, y: 30 });
    act(() => {
      jest.advanceTimersByTime(LEAVE_MS + 5);
    });
    expect(tick).not.toHaveBeenCalled();
    expect(card.style.transform).toBe("");
  });

  it("works with a mouse too: the same pointer events", () => {
    slowClock();
    mount(h(HabitStack, { ctl: fakeCtl() }));
    const card = topCard();
    act(() => {
      card.dispatchEvent(
        pointer("pointerdown", { x: 20, y: 30, kind: "mouse" })
      );
    });
    fire(window, "pointermove", { x: 200, y: 31 });
    fire(window, "pointerup", { x: 200, y: 31 });
    act(() => {
      jest.advanceTimersByTime(LEAVE_MS + 5);
    });
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it("under reduced motion the card does not tilt or fly: it is simply done", () => {
    reduce = true;
    slowClock();
    mount(h(HabitStack, { ctl: fakeCtl() }));
    const card = topCard();
    fire(card, "pointerdown", { x: 20, y: 30 });
    fire(window, "pointermove", { x: 150, y: 30 });
    // it follows the pointer, flat: no rotation
    expect(card.style.transform).not.toContain("rotate");
    fire(window, "pointerup", { x: 150, y: 30 });
    expect(card.classList.contains("is-leaving")).toBe(false);
    expect(tick).toHaveBeenCalledTimes(1); // no wait for an exit
  });
});

describe("without a swipe", () => {
  it("the Done button on the top card does the same", () => {
    mount(h(HabitStack, { ctl: fakeCtl() }));
    act(() => q<HTMLButtonElement>("[data-hc-done]").click());
    expect(q("[data-hc-done]").getAttribute("data-hc-done")).toBe("a");
    expect(tick).toHaveBeenCalledWith(
      expect.objectContaining({ id: "a" }),
      true
    );
    expect((notify.success as jest.Mock).mock.calls[0][0]).toBe("Read done");
  });

  it("only the top card has a Done button", () => {
    mount(h(HabitStack, { ctl: fakeCtl() }));
    expect(host.querySelectorAll("[data-hc-done]")).toHaveLength(1);
  });

  it("Enter and ArrowRight on the focused card mark it done", () => {
    mount(h(HabitStack, { ctl: fakeCtl() }));
    const card = topCard();
    act(() => {
      card.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
    });
    expect(tick).toHaveBeenCalledTimes(1);
    act(() => {
      card.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
      );
    });
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it("Enter on the Edit button edits; it does not mark done", () => {
    const ctl = fakeCtl();
    mount(h(HabitStack, { ctl }));
    const edit = q<HTMLButtonElement>("[data-hc-edit]");
    act(() => {
      edit.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
      edit.click();
    });
    expect(tick).not.toHaveBeenCalled();
    expect(ctl.openEdit).toHaveBeenCalled();
  });
});

describe("the month grid", () => {
  it("colours each day by the share of habits kept", () => {
    const k = (habitId: string, date: string) => ({
      habitId,
      date,
      done: true,
    });
    const ctl = fakeCtl({
      history: [
        k("a", "2026-11-01"),
        k("a", "2026-11-02"),
        k("b", "2026-11-02"),
        k("a", "2026-11-03"),
        k("b", "2026-11-03"),
        k("c", "2026-11-03"),
      ],
    });
    mount(h(HabitMonthGrid, { ctl }));
    const level = (d: string) =>
      q(`[data-hc-day="${d}"]`).getAttribute("data-level");
    expect(level("2026-11-01")).toBe("1"); // 1 of 3
    expect(level("2026-11-02")).toBe("2"); // 2 of 3
    expect(level("2026-11-03")).toBe("3"); // all
    expect(level("2026-11-04")).toBe("0");
    expect(level("2026-11-20")).toBe("ahead");
    expect(q('[data-hc-day="2026-11-02"]').getAttribute("aria-label")).toBe(
      "2: 2 of 3 habits"
    );
    expect(q(".is-today").getAttribute("data-hc-day")).toBe(TODAY);
  });

  it("is part of the panel, under the stack", () => {
    mount(h(HabitCardsPanel, { ctl: fakeCtl() }));
    const panel = q("[data-hc-panel]");
    expect(panel.querySelector("[data-hc-stack]")).not.toBeNull();
    expect(panel.querySelector("[data-hc-grid]")).not.toBeNull();
    expect(panel.querySelectorAll("[data-hc-row]")).toHaveLength(3);
  });
});

describe("goal cards", () => {
  const goal = (over: Partial<GoalView>) =>
    ({
      id: "g1",
      title: "Ship the launch",
      description: null,
      deadline: "2026-11-30T00:00:00.000Z",
      area: "work",
      status: "active",
      createdAt: "2026-10-01T00:00:00.000Z",
      progress: {
        source: "tasks",
        ratio: 0.2,
        percent: 20,
        done: 1,
        total: 5,
        current: null,
        target: null,
        unit: null,
      },
      ...over,
    }) as unknown as GoalView;

  it("shows progress, the next step, the deadline and a risk hint", () => {
    const onSelect = jest.fn();
    mount(
      h(GoalCards, {
        goals: [goal({})],
        selectedId: null,
        nextSteps: { g1: { id: "t2", title: "Write the announcement" } },
        today: TODAY,
        onSelect,
      })
    );
    const card = q('[data-gl-card="g1"]');
    expect(q('[data-gl-progress="g1"]').textContent).toBe("1 of 5 tasks");
    expect(q('[data-gl-next="g1"]').textContent).toContain(
      "Write the announcement"
    );
    expect(q('[data-gl-due="g1"]').textContent).toBe("by 30 Nov 2026");
    expect(q("[data-gl-risk]").getAttribute("data-gl-risk")).toBe("behind");
    act(() => card.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSelect).toHaveBeenCalledWith("g1");
  });

  it("says when no open task is linked, and waits while tasks are unread", () => {
    mount(
      h(GoalCards, {
        goals: [goal({ id: "g1" }), goal({ id: "g2", title: "Two" })],
        selectedId: null,
        nextSteps: { g1: null },
        today: TODAY,
        onSelect: jest.fn(),
      })
    );
    expect(q('[data-gl-next="g1"]').textContent).toContain(
      "No open task linked"
    );
    expect(q('[data-gl-next="g2"]').textContent).not.toContain("No open task");
  });

  it("has no risk hint for a goal that is on track", () => {
    mount(
      h(GoalCards, {
        goals: [
          goal({
            progress: { ...goal({}).progress, percent: 80, ratio: 0.8 },
          }),
        ],
        selectedId: null,
        nextSteps: {},
        today: TODAY,
        onSelect: jest.fn(),
      })
    );
    expect(host.querySelector("[data-gl-risk]")).toBeNull();
  });

  it("folds closed goals away", () => {
    mount(
      h(GoalCards, {
        goals: [goal({}), goal({ id: "g9", status: "achieved" })],
        selectedId: null,
        nextSteps: {},
        today: TODAY,
        onSelect: jest.fn(),
      })
    );
    expect(host.querySelector('[data-gl-card="g9"]')).toBeNull();
    expect(q("[data-gl-closed]").textContent).toBe("Closed goals (1)");
  });
});
