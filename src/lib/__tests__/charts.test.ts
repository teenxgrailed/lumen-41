import {
  CHART_H,
  CHART_W,
  chartCaption,
  chartDays,
  chartShape,
  formatMinutes,
  habitSeries,
  progressSeries,
  timeSeries,
} from "@/lib/charts";

describe("chartDays", () => {
  it("lists the range oldest first, across a month end", () => {
    expect(chartDays("2026-03-02", 4)).toEqual([
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
      "2026-03-02",
    ]);
  });
});

describe("progressSeries", () => {
  const days = ["2026-11-01", "2026-11-02", "2026-11-03"];
  it("counts running totals; tasks from before the range count from day one", () => {
    const s = progressSeries(days, [
      { created: "2026-10-20", completed: "2026-11-02" },
      { created: "2026-11-02", completed: null },
      { created: "2026-11-03", completed: "2026-11-03" },
    ]);
    expect(s.points).toEqual([
      { day: "2026-11-01", value: 0, total: 1 },
      { day: "2026-11-02", value: 1, total: 2 },
      { day: "2026-11-03", value: 2, total: 3 },
    ]);
    expect(s.summary).toEqual({
      metric: "task_progress",
      done: 2,
      total: 3,
      percent: 67,
    });
  });
  it("is 0% with no tasks", () => {
    expect(progressSeries(days, []).summary).toMatchObject({ percent: 0 });
  });
});

describe("habitSeries", () => {
  const days = chartDays("2026-11-12", 7);
  it("counts check-ins per day and the streak running to today", () => {
    const s = habitSeries(
      days,
      ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-12"],
      "2026-11-12"
    );
    expect(s.points.map((p) => p.value)).toEqual([0, 0, 0, 0, 1, 1, 2]);
    expect(s.summary).toEqual({
      metric: "habit_streak",
      current: 3,
      best: 3,
      daysKept: 3,
    });
  });
  it("keeps the streak while today is still open, and finds the best one past the range", () => {
    const history = [
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
      "2026-11-10",
      "2026-11-11",
    ];
    const s = habitSeries(days, history, "2026-11-12");
    expect(s.summary).toMatchObject({ current: 2, best: 4, daysKept: 2 });
  });
  it("drops the streak after a missed day", () => {
    const s = habitSeries(days, ["2026-11-09"], "2026-11-12");
    expect(s.summary).toMatchObject({ current: 0, best: 1 });
  });
});

describe("timeSeries", () => {
  it("sums minutes per day and averages over the range", () => {
    const s = timeSeries(
      ["2026-11-11", "2026-11-12"],
      [
        { day: "2026-11-11", minutes: 30 },
        { day: "2026-11-11", minutes: 45.4 },
        { day: "2026-11-12", minutes: 60 },
        { day: "2026-10-01", minutes: 999 },
      ]
    );
    expect(s.points.map((p) => p.value)).toEqual([75, 60]);
    expect(s.summary).toEqual({
      metric: "time_spent",
      totalMinutes: 135,
      averageMinutes: 68,
    });
  });
});

describe("captions", () => {
  it("reads each summary in one line", () => {
    expect(formatMinutes(80)).toBe("1h 20m");
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(120)).toBe("2h");
    expect(
      chartCaption({ metric: "task_progress", done: 3, total: 8, percent: 38 })
    ).toBe("3 of 8 done");
    expect(
      chartCaption({ metric: "habit_streak", current: 4, best: 9, daysKept: 5 })
    ).toBe("4-day streak · best 9");
    expect(
      chartCaption({
        metric: "time_spent",
        totalMinutes: 300,
        averageMinutes: 43,
      })
    ).toBe("5h · 43m a day");
  });
});

describe("chartShape", () => {
  const pts = [
    { day: "a", value: 0, total: 2 },
    { day: "b", value: 1, total: 2 },
    { day: "c", value: 2, total: 4 },
  ];
  it("draws a line from zero to the peak across the full width", () => {
    const s = chartShape(pts, "line");
    expect(s.peak).toBe(4);
    const xs = s.line.split(" ").map((p) => Number(p.split(",")[0]));
    expect(xs[0]).toBe(0);
    expect(xs[2]).toBe(CHART_W);
    expect(Number(s.line.split(" ")[0].split(",")[1])).toBe(CHART_H);
    expect(s.totalLine).not.toBeNull();
  });
  it("draws one bar per non-zero day, inside the box", () => {
    const s = chartShape(
      [
        { day: "a", value: 0 },
        { day: "b", value: 5 },
      ],
      "bar"
    );
    expect(s.bars).toHaveLength(1);
    expect(s.bars[0].y + s.bars[0].h).toBeCloseTo(CHART_H, 0);
    expect(s.bars[0].x + s.bars[0].w).toBeLessThanOrEqual(CHART_W);
  });
});
