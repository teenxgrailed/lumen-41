/**
 * @jest-environment jsdom
 *
 * The small "This week" card hides itself with nothing to say and opens the
 * full view on a tap; the full view shows its parts and hides Focus when no
 * session was stored.
 */
import { act, createElement as h } from "react";

import type { Stats } from "@/services/stats/home-stats";
import { type Root, createRoot } from "react-dom/client";

import { StatsBody, StatsCard } from "../Stats";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../phone/kit", () => ({ PkSheet: () => null }));
jest.mock("../../root/V3Root", () => ({ useDesignV3: () => true }));
jest.mock("../../ctx/PortalScope", () => ({
  useV3PortalContainer: () => null,
}));

const DAYS = [
  "2026-08-26",
  "2026-08-27",
  "2026-08-28",
  "2026-08-29",
  "2026-08-30",
  "2026-08-31",
  "2026-09-01",
];
const stats = (done: number[], over: Partial<Stats> = {}): Stats => ({
  range: "week",
  from: DAYS[0] as string,
  to: DAYS[6] as string,
  timeZone: "UTC",
  total: done.reduce((a, b) => a + b, 0),
  days: DAYS.map((date, i) => ({ date, done: done[i] ?? 0, focusMinutes: 0 })),
  bestDay: null,
  byProject: [],
  byWeekday: Array.from({ length: 7 }, (_, weekday) => ({ weekday, done: 0 })),
  bestWeekday: null,
  focusMinutes: null,
  focusSessions: 0,
  ...over,
});

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
const render = (el: unknown) =>
  act(async () => root.render(el as Parameters<Root["render"]>[0]));

describe("StatsCard", () => {
  const card = (s: Stats | undefined, streak = 0, onOpen = jest.fn()) =>
    h(StatsCard, { stats: s, streak, onOpen });

  it("draws nothing while loading or with nothing to say", async () => {
    await render(card(undefined, 4));
    expect(host.innerHTML).toBe("");
    await render(card(stats([0, 0, 0, 0, 0, 0, 0]), 0));
    expect(host.innerHTML).toBe("");
  });

  it("shows the count, seven bars with the best marked, and the streak", async () => {
    await render(
      card(stats([1, 0, 3, 0, 0, 2, 1], { bestDay: "2026-08-28" }), 5)
    );
    expect(
      host.querySelector("[data-st-total]")?.getAttribute("data-st-total")
    ).toBe("7");
    expect(host.querySelectorAll("[data-st-bar]")).toHaveLength(7);
    expect(
      host.querySelector("[data-st-best]")?.getAttribute("data-st-bar")
    ).toBe("2026-08-28");
    expect(host.textContent).toContain("5-day streak");
  });

  it("falls back to the best day when there is no streak", async () => {
    await render(
      card(stats([0, 0, 2, 0, 0, 0, 0], { bestDay: "2026-08-28" }), 0)
    );
    expect(host.textContent).toContain("Best day Fri");
  });

  it("opens the full view on a tap", async () => {
    const onOpen = jest.fn();
    await render(card(stats([0, 0, 0, 0, 0, 0, 2]), 0, onOpen));
    (host.querySelector("[data-st-card]") as HTMLButtonElement).click();
    expect(onOpen).toHaveBeenCalled();
  });
});

describe("StatsBody", () => {
  const body = (s: Stats | undefined, over = {}) =>
    h(StatsBody, {
      stats: s,
      range: "week",
      loading: false,
      onRange: jest.fn(),
      ...over,
    });

  it("shows done per day, projects and the best weekday", async () => {
    const byWeekday = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      done: weekday === 2 ? 4 : 0,
    }));
    await render(
      body(
        stats([1, 0, 0, 0, 0, 0, 4], {
          byProject: [
            { projectId: "p1", name: "Launch", color: null, done: 4 },
            { projectId: null, name: "No project", color: null, done: 1 },
          ],
          byWeekday,
          bestWeekday: 2,
          bestDay: "2026-09-01",
        })
      )
    );
    expect(host.querySelector("[data-st-days]")).not.toBeNull();
    expect(host.querySelectorAll(".st-project")).toHaveLength(2);
    expect(host.querySelector("[data-st-weekday]")?.textContent).toContain(
      "Best weekday · Tuesday"
    );
  });

  it("hides Focus when no session was stored, shows it when there was one", async () => {
    await render(body(stats([1, 0, 0, 0, 0, 0, 0])));
    expect(host.querySelector("[data-st-focus]")).toBeNull();
    await render(
      body(stats([1, 0, 0, 0, 0, 0, 0], { focusMinutes: 90, focusSessions: 3 }))
    );
    expect(host.querySelector("[data-st-focus]")?.textContent).toContain(
      "1 h 30 in 3 sessions"
    );
  });

  it("switches between week and month", async () => {
    const onRange = jest.fn();
    await render(body(stats([1, 0, 0, 0, 0, 0, 0]), { onRange }));
    (
      host.querySelector('[data-st-range="month"]') as HTMLButtonElement
    ).click();
    expect(onRange).toHaveBeenCalledWith("month");
    expect(
      host.querySelector('[data-st-range="week"]')?.getAttribute("aria-checked")
    ).toBe("true");
  });

  it("says it is loading before the first answer", async () => {
    await render(body(undefined, { loading: true }));
    expect(host.textContent).toContain("Loading");
  });
});
