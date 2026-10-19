/**
 * @jest-environment jsdom
 *
 * The sort board: a drag starts after 6 px (less is a tap and opens the
 * editor), drops into the lane under the pointer, the board scrolls near the
 * scroller's edge, a lane with two or more tiles closes with Done, suggestions
 * appear after four sorted tiles, "Sort the rest for me" follows the agent,
 * and Create hands every tile over.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import type { StarterSuggestions } from "@/lib/starter-game";

import { SgBoard } from "../SgBoard";
import { type SgTile } from "../board";

jest.mock("../../orb/AiOrb", () => ({ AiOrb: () => null }));
jest.mock("../../ctx/PortalScope", () => ({
  useV3PortalContainer: () => document.body,
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const TILES: SgTile[] = [
  { id: "a", t: "Call Anna", k: "task", s: "today", g: null, min: 15 },
  { id: "b", t: "Write report", k: "task", s: "week", g: null, min: 60 },
  { id: "c", t: "Plan the week", k: "task", s: "week", g: null, min: 30 },
  { id: "d", t: "Reply to buyers", k: "task", s: "today", g: null, min: 15 },
  { id: "e", t: "Duolingo", k: "habit", s: "habit", g: null, perWeek: 7 },
  {
    id: "f",
    t: "German course",
    k: "project",
    s: "project",
    g: null,
    horizon: "this quarter",
    firstStep: "Book the test",
  },
];
const SUGGESTIONS: StarterSuggestions = {
  habit: { title: "Read 20 pages", kind: "habit", suggestedGroup: "habit" },
  project: {
    title: "Autumn stock",
    kind: "project",
    suggestedGroup: "project",
    firstStep: "List what is left",
  },
};

let host: HTMLDivElement;
let root: Root;
let scroller: HTMLDivElement;
let hit: string | null;
let onCreate: jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  hit = null;
  onCreate = jest.fn();
  // jsdom has no layout: say which lane is under the pointer.
  document.elementFromPoint = jest.fn(() => {
    if (!hit) return null;
    return host.querySelector(`[data-sg-lane="${hit}"]`);
  });
  scroller = document.createElement("div");
  scroller.className = "sg-body";
  scroller.getBoundingClientRect = () =>
    ({ top: 100, bottom: 700, left: 0, right: 400 }) as DOMRect;
  document.body.appendChild(scroller);
  host = document.createElement("div");
  scroller.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  scroller.remove();
  jest.useRealTimers();
});

const draw = (over: Partial<Parameters<typeof SgBoard>[0]> = {}) =>
  act(() =>
    root.render(
      h(SgBoard, {
        initial: TILES,
        suggestions: SUGGESTIONS,
        phone: false,
        creating: false,
        onCreate,
        ...over,
      })
    )
  );

const tile = (id: string) =>
  host.querySelector(`[data-sg-tile="${id}"]`) as HTMLElement;
const lane = (g: string) =>
  host.querySelector(`[data-sg-lane="${g}"]`) as HTMLElement;
const names = (g: string) =>
  Array.from(lane(g).querySelectorAll(".sg-lane-item")).map(
    (n) => (n.childNodes[0] as Text).textContent
  );
const fire = (target: EventTarget, type: string, x: number, y: number) =>
  act(() => {
    target.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        clientX: x,
        clientY: y,
        button: 0,
      })
    );
  });

/** Press a tile, move through `to`, release over `lane`. */
function dragTo(id: string, over: string | null, to = { x: 200, y: 300 }) {
  fire(tile(id), "pointerdown", 10, 500);
  fire(window, "pointermove", 10, 480);
  hit = over;
  fire(window, "pointermove", to.x, to.y);
  fire(window, "pointerup", to.x, to.y);
}

describe("dragging", () => {
  it("drops a tile into the lane under the pointer", () => {
    draw();
    dragTo("a", "today");
    expect(names("today")).toEqual(["Call Anna"]);
    expect(tile("a")).toBeNull();
    expect(host.textContent).toContain("5 left to sort");
  });

  it("does nothing when released over no lane", () => {
    draw();
    dragTo("a", null);
    expect(tile("a")).not.toBeNull();
    expect(host.textContent).toContain("6 left to sort");
  });

  it("lights the lane under the drag", () => {
    draw();
    fire(tile("a"), "pointerdown", 10, 500);
    fire(window, "pointermove", 10, 480);
    hit = "week";
    fire(window, "pointermove", 200, 300);
    expect(lane("week").className).toContain("is-over");
    fire(window, "pointerup", 200, 300);
    expect(lane("week").className).not.toContain("is-over");
  });

  it("is a tap under 6 px: it opens the editor and moves nothing", () => {
    draw();
    fire(tile("a"), "pointerdown", 10, 500);
    fire(window, "pointermove", 13, 503); // 4.2 px
    fire(window, "pointerup", 13, 503);
    expect(host.querySelector("[data-sg-editor]")).not.toBeNull();
    expect(tile("a")).not.toBeNull();
  });

  it("starts after 6 px", () => {
    draw();
    fire(tile("a"), "pointerdown", 10, 500);
    fire(window, "pointermove", 10, 493); // 7 px
    expect(document.querySelector(".sg-drag")).not.toBeNull();
    fire(window, "pointercancel", 10, 493);
    expect(document.querySelector(".sg-drag")).toBeNull();
    expect(tile("a")).not.toBeNull();
  });

  it("scrolls the board near the scroller's edge", () => {
    const frames: FrameRequestCallback[] = [];
    jest
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb: FrameRequestCallback) => frames.push(cb));
    draw();
    scroller.scrollTop = 200;
    fire(tile("a"), "pointerdown", 10, 500);
    fire(window, "pointermove", 10, 480);
    fire(window, "pointermove", 200, 690); // 10 px from the bottom edge
    act(() => frames.shift()?.(0));
    expect(scroller.scrollTop).toBeGreaterThan(200);
    fire(window, "pointermove", 200, 120); // 20 px from the top edge
    const before = scroller.scrollTop;
    act(() => frames.shift()?.(0));
    expect(scroller.scrollTop).toBeLessThan(before);
    fire(window, "pointerup", 200, 120);
    jest.restoreAllMocks();
  });

  it("only a primary button drags", () => {
    draw();
    act(() => {
      tile("a").dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          clientX: 10,
          clientY: 500,
          button: 2,
        })
      );
    });
    fire(window, "pointermove", 10, 400);
    expect(document.querySelector(".sg-drag")).toBeNull();
  });
});

describe("the editor", () => {
  it("opens from the keyboard and sorts through its Group chips", () => {
    draw();
    act(() => tile("b").click()); // detail 0: Enter, Space, a screen reader
    expect(host.querySelector("[data-sg-editor]")).not.toBeNull();
    const chips = Array.from(
      host.querySelectorAll<HTMLButtonElement>(".sg-ed .sg-chip")
    );
    act(() => chips.find((c) => c.textContent?.includes("Today"))?.click());
    act(() =>
      host.querySelector<HTMLButtonElement>('[data-sg="save"]')?.click()
    );
    expect(names("today")).toEqual(["Write report"]);
    expect(host.querySelector("[data-sg-editor]")).toBeNull();
  });

  it("changes the title and the duration", () => {
    draw();
    act(() => tile("b").click());
    const input = host.querySelector<HTMLInputElement>(".sg-ed input")!;
    act(() => {
      const set = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!;
      set.call(input, "Write the report");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() =>
      Array.from(host.querySelectorAll<HTMLButtonElement>(".sg-ed .sg-chip"))
        .find((c) => c.textContent === "30 min")
        ?.click()
    );
    act(() =>
      host.querySelector<HTMLButtonElement>('[data-sg="save"]')?.click()
    );
    expect(names("week")).toEqual(["Write the report"]);
    expect(lane("week").textContent).toContain("30 min");
  });

  it("Remove deletes the tile", () => {
    draw();
    act(() => tile("c").click());
    act(() =>
      host.querySelector<HTMLButtonElement>('[data-sg="remove"]')?.click()
    );
    expect(tile("c")).toBeNull();
    expect(host.textContent).toContain("5 left to sort");
  });

  it("offers the habit's cadences and the project's horizons", () => {
    draw();
    act(() => tile("e").click());
    expect(host.querySelector(".sg-ed")?.textContent).toContain("How often");
    expect(host.querySelector(".sg-ed")?.textContent).toContain("3× a week");
    act(() =>
      host.querySelector<HTMLButtonElement>('[data-sg="remove"]')?.click()
    );
    act(() => tile("f").click());
    expect(host.querySelector(".sg-ed")?.textContent).toContain("this quarter");
  });

  it("says where the agent would put it", () => {
    draw();
    act(() => tile("b").click());
    expect(host.querySelector(".sg-ed-sug")?.textContent).toContain(
      "This week"
    );
  });
});

describe("lanes", () => {
  it("closes a lane with two tiles into a bar with Done, and opens it again", () => {
    draw();
    dragTo("a", "today");
    expect(host.querySelector('[data-sg="lane-done"]')).toBeNull();
    dragTo("d", "today");
    act(() =>
      host.querySelector<HTMLButtonElement>('[data-sg="lane-done"]')?.click()
    );
    const bar = lane("today");
    expect(bar.className).toContain("is-solved");
    expect(bar.textContent).toContain("Today · 2");
    expect(bar.textContent).toContain("Call Anna · Reply to buyers");
    act(() => bar.click());
    expect(lane("today").className).not.toContain("is-solved");
  });

  it("opens a solved bar from the keyboard", () => {
    draw();
    dragTo("a", "today");
    dragTo("d", "today");
    act(() =>
      host.querySelector<HTMLButtonElement>('[data-sg="lane-done"]')?.click()
    );
    act(() => {
      lane("today").dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
    });
    expect(lane("today").className).not.toContain("is-solved");
  });

  it("offers one suggestion per empty lane after four sorted tiles", () => {
    draw();
    for (const [id, g] of [
      ["a", "today"],
      ["d", "today"],
      ["b", "week"],
    ] as const) {
      dragTo(id, g);
    }
    expect(host.querySelector("[data-sg-hint]")).toBeNull();
    dragTo("c", "week");
    const habit = host.querySelector('[data-sg-hint="habit"]');
    expect(habit?.textContent).toContain("Read 20 pages");
    expect(
      host.querySelector('[data-sg-hint="project"]')?.textContent
    ).toContain("Autumn stock");
    // no suggestion from the agent for a lane: just the drop line
    expect(host.querySelector('[data-sg-hint="today"]')).toBeNull();
  });

  it("+ Add puts the suggestion in its lane, with the agent's first step kept", () => {
    draw();
    for (const [id, g] of [
      ["a", "today"],
      ["d", "today"],
      ["b", "week"],
      ["c", "week"],
    ] as const) {
      dragTo(id, g);
    }
    act(() =>
      host
        .querySelector<HTMLButtonElement>(
          '[data-sg-hint="project"] [data-sg="add-suggestion"]'
        )
        ?.click()
    );
    expect(names("project")).toEqual(["Autumn stock"]);
    act(() =>
      host.querySelector<HTMLButtonElement>('[data-sg="create"]')?.click()
    );
    const all = onCreate.mock.calls[0][0] as SgTile[];
    expect(all.find((x) => x.t === "Autumn stock")).toMatchObject({
      g: "project",
      firstStep: "List what is left",
    });
  });
});

describe("Sort the rest for me", () => {
  it("puts each tile where the agent suggested, one after another", () => {
    draw();
    act(() =>
      host.querySelector<HTMLButtonElement>('[data-sg="sort-rest"]')?.click()
    );
    expect(host.textContent).toContain("6 left to sort");
    act(() => {
      jest.advanceTimersByTime(110 * 6);
    });
    expect(host.textContent).toContain("All sorted.");
    // every lane is a solved bar now
    expect(host.querySelectorAll(".sg-lane.is-solved")).toHaveLength(4);
    expect(lane("week").textContent).toContain("Write report");
    expect(lane("habit").textContent).toContain("Duolingo");
    expect(lane("project").textContent).toContain("German course");
    expect(host.querySelector('[data-sg="sort-rest"]')).toBeNull();
  });
});

describe("Create", () => {
  it("is off until something is sorted, then says what it makes", () => {
    draw();
    const create = () =>
      host.querySelector<HTMLButtonElement>('[data-sg="create"]')!;
    expect(create().disabled).toBe(true);
    dragTo("a", "today");
    dragTo("e", "habit");
    dragTo("f", "project");
    expect(create().disabled).toBe(false);
    expect(create().textContent).toBe("Create 1 task, 1 habit, 1 project");
    act(() => create().click());
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(
      (onCreate.mock.calls[0][0] as SgTile[]).filter((x) => x.g)
    ).toHaveLength(3);
  });

  it("shows Creating… and cannot be pressed twice", () => {
    draw({ creating: true });
    dragTo("a", "today");
    const create = host.querySelector<HTMLButtonElement>('[data-sg="create"]')!;
    expect(create.textContent).toBe("Creating…");
    expect(create.disabled).toBe(true);
  });
});
