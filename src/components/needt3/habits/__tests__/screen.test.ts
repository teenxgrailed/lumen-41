/**
 * The Habits desktop screen (places.jsx `HabitsScreen`): the Free line in the
 * header, the Today cards, and "Last four months" beside the time-left cards.
 * Server markup; the controller is a plain object.
 */
import { createElement as h } from "react";

import { renderToStaticMarkup } from "react-dom/server";

import type { Checkin } from "@/lib/needt3/derive";
import type { V3Habit } from "@/lib/needt3/map";

import { HabitsScreen } from "../HabitsScreen";
import { FREE_HABITS } from "../derive";
import type { HabitsController } from "../useHabitsController";

jest.mock("../../root/V3Root", () => ({ useDesignV3: () => false }));
let planKind = "free";
jest.mock("@/lib/needt3/hooks/plan", () => ({
  usePlan: () => ({ data: { kind: planKind } }),
}));
let history: Checkin[] | undefined;
jest.mock("@/lib/needt3/hooks/habits", () => ({
  useCheckinHistory: () => ({ data: history }),
}));

const TODAY = "2026-09-01";
const habit = (id: string, title: string): V3Habit => ({
  id,
  title,
  projectId: null,
  color: null,
  icon: null,
  schedule: { time: null, perWeek: null },
  archivedAt: null,
});

const ctl = (n: number) => {
  const list = Array.from({ length: n }, (_, i) =>
    habit(`h${i}`, `Habit ${i}`)
  );
  return {
    habits: {
      status: "success",
      fetchStatus: "idle",
      data: list,
      error: null,
      refetch: jest.fn(),
    },
    list,
    shown: list,
    over: false,
    all: false,
    setAll: jest.fn(),
    checkins: [{ habitId: "h0", date: TODAY, done: true }],
    projects: [],
    today: TODAY,
    tz: "UTC",
    kept: 1,
    form: null,
    tick: jest.fn(),
    openNew: jest.fn(),
  } as unknown as HabitsController;
};

const render = (n: number) =>
  renderToStaticMarkup(h(HabitsScreen, { ctl: ctl(n) }));

describe("Habits screen", () => {
  beforeEach(() => {
    planKind = "free";
    history = undefined;
  });

  it('Free over the limit reads "N habits · Free includes 3" with Upgrade for more', () => {
    const out = render(FREE_HABITS + 1);
    expect(out).toContain(
      `${FREE_HABITS + 1} habits · Free includes ${FREE_HABITS}`
    );
    expect(out).toContain("Upgrade for more");
    expect(out).not.toContain("on Free");
  });

  it('Free under the limit reads "2 of 3 habits" with no upgrade link', () => {
    const out = render(2);
    expect(out).toContain(`2 of ${FREE_HABITS} habits`);
    expect(out).not.toContain("Upgrade for more");
  });

  it("Pro reads the count and what the screen promises", () => {
    planKind = "yearly";
    const out = render(4);
    expect(out).toContain("4 habits · nothing carries over");
    expect(out).not.toContain("pro-limit");
  });

  it("lays out Today, Last four months and the time-left cards", () => {
    const out = render(2);
    expect(out).toContain("hb-today-grid");
    expect(out).toContain("Last four months");
    expect(out).toContain("data-hb-months");
    // "All" and one pick per habit, a row per month
    expect(out.match(/class="hb-pick( is-on)?"/g)).toHaveLength(3);
    expect(out.match(/class="hb-month( is-current)?"/g)).toHaveLength(4);
    expect(out).toContain("hb-left-card");
    expect(out).toMatch(/is-today/);
  });

  it("draws the long history it is given, not just the cards' fourteen days", () => {
    history = [
      { habitId: "h0", date: "2026-06-10", done: true },
      { habitId: "h1", date: "2026-07-04", done: true },
    ];
    const out = render(2);
    const on = out.match(/class="hb-dot is-on"/g) ?? [];
    expect(on).toHaveLength(2);
  });
});
