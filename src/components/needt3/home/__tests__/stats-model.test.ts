import type { Stats } from "@/services/stats/home-stats";

import {
  bars,
  bestDayLine,
  dayBars,
  hasStatsToShow,
  statsSummary,
  weekdayBars,
  weekdayOf,
} from "../stats-model";

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
  days: DAYS.map((date, i) => ({
    date,
    done: done[i] ?? 0,
    focusMinutes: 0,
  })),
  bestDay: null,
  byProject: [],
  byWeekday: Array.from({ length: 7 }, (_, weekday) => ({ weekday, done: 0 })),
  bestWeekday: null,
  focusMinutes: null,
  focusSessions: 0,
  ...over,
});

describe("bars", () => {
  it("scales against the tallest and keeps a sliver for a small value", () => {
    const b = bars(
      [
        { key: "a", value: 10, label: "A" },
        { key: "b", value: 1, label: "B" },
        { key: "c", value: 0, label: "C" },
      ],
      "a"
    );
    expect(b.map((x) => x.h)).toEqual([1, 0.1, 0]);
    expect(b[0]?.best).toBe(true);
  });
  it("never marks a zero as best, and handles all zeros", () => {
    const b = bars([{ key: "a", value: 0, label: "A" }], "a");
    expect(b[0]).toMatchObject({ h: 0, best: false });
  });
});

describe("the week card", () => {
  it("marks the best day among seven bars", () => {
    const s = stats([1, 0, 3, 0, 0, 2, 1], { bestDay: "2026-08-28" });
    const b = dayBars(s);
    expect(b).toHaveLength(7);
    expect(b.filter((x) => x.best).map((x) => x.key)).toEqual(["2026-08-28"]);
    expect(bestDayLine(s)).toBe("Best day Fri");
  });

  it("has nothing to say with no closed tasks and no streak", () => {
    expect(hasStatsToShow(undefined, 3)).toBe(false);
    expect(hasStatsToShow(stats([0, 0, 0, 0, 0, 0, 0]), 0)).toBe(false);
    expect(hasStatsToShow(stats([0, 0, 0, 0, 0, 0, 1]), 0)).toBe(true);
    expect(hasStatsToShow(stats([0, 0, 0, 0, 0, 0, 0]), 2)).toBe(true);
    expect(bestDayLine(stats([0, 0, 0, 0, 0, 0, 0]))).toBe("");
  });

  it("reads for a screen reader", () => {
    expect(statsSummary(stats([1, 0, 0, 0, 0, 0, 2]))).toBe(
      "3 done in the last 7 days. Wed 1, Thu 0, Fri 0, Sat 0, Sun 0, Mon 0, Tue 2"
    );
  });
});

describe("weekdayBars", () => {
  it("starts on Monday and marks the best weekday", () => {
    const byWeekday = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      done: weekday === 3 ? 5 : 1,
    }));
    const b = weekdayBars(stats([], { byWeekday, bestWeekday: 3 }));
    expect(b.map((x) => x.label)).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
    expect(b.filter((x) => x.best).map((x) => x.label)).toEqual(["Wed"]);
  });
  it("weekdayOf is the calendar's weekday", () => {
    expect(weekdayOf("2026-09-01")).toBe(2);
  });
});
