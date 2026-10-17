import {
  STRIP_BUFFER,
  STRIP_GLIDE,
  STRIP_SPAN,
  STRIP_TOTAL,
  columnWidth,
  drawnRange,
  glidePlan,
  jumpGoal,
  nearestIndex,
  nowScrollTop,
  offHours,
  offsetOf,
  stripDate,
  stripIndex,
  workHoursOf,
} from "../strip";

const ORIGIN = "2026-09-07";

describe("strip indexing", () => {
  it("puts the origin in the middle and counts days from it", () => {
    expect(stripIndex(ORIGIN, ORIGIN)).toBe(STRIP_SPAN);
    expect(stripIndex(ORIGIN, "2026-09-08")).toBe(STRIP_SPAN + 1);
    expect(stripIndex(ORIGIN, "2026-08-31")).toBe(STRIP_SPAN - 7);
  });

  it("round-trips a date through its index across a month and a year", () => {
    for (const d of ["2026-09-07", "2026-12-31", "2027-03-01", "2020-02-29"]) {
      expect(stripDate(ORIGIN, stripIndex(ORIGIN, d))).toBe(d);
    }
  });

  it("clamps a date beyond either end of the strip", () => {
    expect(stripIndex(ORIGIN, "1900-01-01")).toBe(0);
    expect(stripIndex(ORIGIN, "2999-01-01")).toBe(STRIP_TOTAL - 1);
  });
});

describe("snapping", () => {
  it("settles on the nearest day column", () => {
    expect(nearestIndex(0, 100)).toBe(0);
    expect(nearestIndex(149, 100)).toBe(1);
    expect(nearestIndex(151, 100)).toBe(2);
    expect(nearestIndex(offsetOf(4321, 137.5), 137.5)).toBe(4321);
  });

  it("is safe before the width is measured", () => {
    expect(nearestIndex(500, 0)).toBe(STRIP_SPAN);
  });

  it("splits the viewport minus the gutter between the columns", () => {
    expect(columnWidth(1056, 56, 7)).toBeCloseTo(1000 / 7);
    expect(columnWidth(656, 56, 3)).toBe(200);
    expect(columnWidth(20, 56, 7)).toBe(0);
  });
});

describe("virtualising", () => {
  it("draws the visible days plus a week either side", () => {
    expect(drawnRange(100, 7)).toEqual({
      from: 100 - STRIP_BUFFER,
      to: 100 + 6 + STRIP_BUFFER,
    });
  });

  it("never draws past the ends", () => {
    expect(drawnRange(2, 7).from).toBe(0);
    expect(drawnRange(STRIP_TOTAL - 1, 7).to).toBe(STRIP_TOTAL - 1);
  });

  it("keeps the drawn count independent of how far the strip is scrolled", () => {
    const a = drawnRange(10, 7);
    const b = drawnRange(7000, 7);
    expect(a.to - a.from).toBe(b.to - b.from);
  });
});

describe("jumping and gliding", () => {
  it("chains jumps from the goal of a glide still running", () => {
    expect(jumpGoal(jumpGoal(100, 7), 7)).toBe(114);
    expect(jumpGoal(100, -7)).toBe(93);
  });

  it("clamps a jump to the strip", () => {
    expect(jumpGoal(3, -7)).toBe(0);
    expect(jumpGoal(STRIP_TOTAL - 2, 7)).toBe(STRIP_TOTAL - 1);
  });

  it("glides a short move all the way", () => {
    expect(glidePlan(100, 107)).toEqual({ jumpTo: null, goal: 107 });
    expect(glidePlan(100, 100 + STRIP_GLIDE)).toEqual({
      jumpTo: null,
      goal: 100 + STRIP_GLIDE,
    });
  });

  it("sets a long move down short of the goal and glides only the rest", () => {
    expect(glidePlan(100, 900)).toEqual({
      jumpTo: 900 - STRIP_GLIDE,
      goal: 900,
    });
    expect(glidePlan(900, 100)).toEqual({
      jumpTo: 100 + STRIP_GLIDE,
      goal: 100,
    });
  });
});

describe("opening position", () => {
  it("puts now a third down the viewport", () => {
    expect(nowScrollTop(12, 52, 600, 24 * 52)).toBe(12 * 52 - 200);
  });

  it("does not scroll past the top or the bottom", () => {
    expect(nowScrollTop(0.5, 52, 600, 24 * 52)).toBe(0);
    expect(nowScrollTop(23.9, 52, 600, 24 * 52)).toBe(24 * 52 - 600);
    expect(nowScrollTop(12, 52, 2000, 24 * 52)).toBe(0);
  });
});

describe("working hours", () => {
  const nineToFive = { days: [1, 2, 3, 4, 5], start: 9, end: 17 };

  it("shades before and after the working hours of a working day", () => {
    expect(offHours(3, nineToFive)).toEqual([
      [0, 9],
      [17, 24],
    ]);
  });

  it("shades a whole day that is not a working day", () => {
    expect(offHours(0, nineToFive)).toEqual([[0, 24]]);
    expect(offHours(6, nineToFive)).toEqual([[0, 24]]);
  });

  it("shades nothing for a day worked round the clock, or without data", () => {
    expect(offHours(2, { days: [2], start: 0, end: 24 })).toEqual([]);
    expect(offHours(2, null)).toEqual([]);
    expect(offHours(2, undefined)).toEqual([]);
  });

  it("reads the schedule row, whose workDays is a JSON string", () => {
    expect(
      workHoursOf({
        workDays: "[1,2,3]",
        workHourStart: 8,
        workHourEnd: 18,
      })
    ).toEqual({ days: [1, 2, 3], start: 8, end: 18 });
  });

  it("falls back to a Monday-Friday week for a broken workDays", () => {
    expect(
      workHoursOf({ workDays: "nope", workHourStart: 9, workHourEnd: 17 })?.days
    ).toEqual([1, 2, 3, 4, 5]);
  });

  it("treats an end that is not after the start as the end of the day", () => {
    expect(
      workHoursOf({ workDays: "[1]", workHourStart: 9, workHourEnd: 9 })
    ).toEqual({ days: [1], start: 9, end: 24 });
    expect(workHoursOf(undefined)).toBeNull();
  });
});

describe("per-day working hours", () => {
  const week = [
    { day: 0, on: false, ranges: [] },
    {
      day: 1,
      on: true,
      ranges: [
        { start: "09:00", end: "13:00" },
        { start: "14:00", end: "18:00" },
      ],
    },
    { day: 2, on: true, ranges: [{ start: "10:00", end: "16:30" }] },
    { day: 3, on: true, ranges: [{ start: "00:00", end: "24:00" }] },
  ];
  const row = {
    workDays: "[1,2,3,4,5]",
    workHourStart: 9,
    workHourEnd: 17,
    weekHours: week,
  };

  it("shades outside each day's own ranges and the lunch break", () => {
    const hours = workHoursOf(row);
    expect(offHours(1, hours)).toEqual([
      [0, 9],
      [13, 14],
      [18, 24],
    ]);
    expect(offHours(2, hours)).toEqual([
      [0, 10],
      [16.5, 24],
    ]);
  });

  it("shades days off fully, even ones the old fields call working days", () => {
    const hours = workHoursOf(row);
    expect(offHours(0, hours)).toEqual([[0, 24]]);
    expect(offHours(4, hours)).toEqual([[0, 24]]);
  });

  it("shades nothing on a day worked round the clock", () => {
    expect(offHours(3, workHoursOf(row))).toEqual([]);
  });

  it("falls back to the old fields when there are no windows", () => {
    for (const weekHours of [undefined, null, [], [week[0]]]) {
      const hours = workHoursOf({ ...row, weekHours });
      expect(hours?.byDay).toBeUndefined();
      expect(offHours(3, hours)).toEqual([
        [0, 9],
        [17, 24],
      ]);
      expect(offHours(6, hours)).toEqual([[0, 24]]);
    }
  });

  it("ignores unusable ranges", () => {
    const hours = workHoursOf({
      ...row,
      weekHours: [
        { day: 1, on: true, ranges: [{ start: "xx", end: "10:00" }] },
        { day: 2, on: true, ranges: [{ start: "12:00", end: "11:00" }] },
      ],
    });
    expect(hours?.byDay).toBeUndefined();
  });
});
