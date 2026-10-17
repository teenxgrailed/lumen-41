import {
  addRange,
  copyToWeekdays,
  legacyFromWeek,
  parseWeek,
  setDayOn,
  timeChoices,
  weekFromLegacy,
  weekToWindows,
  windowsToWeek,
} from "../work-week";

describe("work-week", () => {
  const week = weekFromLegacy([1, 2, 3, 4, 5], 9, 17);

  it("round-trips windows with a lunch break", () => {
    const morning = week.map((d) =>
      d.day === 1 ? { ...d, ranges: [{ start: "09:00", end: "13:00" }] } : d
    );
    const split = addRange(morning, 1);
    expect(split[1].ranges).toEqual([
      { start: "09:00", end: "13:00" },
      { start: "14:00", end: "18:00" },
    ]);
    const back = windowsToWeek(weekToWindows(split));
    expect(back[1].ranges).toHaveLength(2);
    expect(back[0].on).toBe(false);
  });

  it("summarises the week for the single-range columns", () => {
    expect(legacyFromWeek(week)).toEqual({
      workDays: [1, 2, 3, 4, 5],
      workHourStart: 9,
      workHourEnd: 17,
    });
  });

  it("copies one day to the weekdays and toggles days", () => {
    const edited = week.map((d) =>
      d.day === 3 ? { ...d, ranges: [{ start: "08:00", end: "12:00" }] } : d
    );
    expect(copyToWeekdays(edited, 3)[1].ranges[0].start).toBe("08:00");
    expect(setDayOn(week, 6, true)[6].ranges).toHaveLength(1);
  });

  it("rejects overlaps, a third range and a reversed range", () => {
    const bad = (ranges: unknown[]) => () =>
      parseWeek([{ day: 1, on: true, ranges }]);
    expect(
      bad([
        { start: "09:00", end: "12:00" },
        { start: "11:00", end: "14:00" },
      ])
    ).toThrow();
    expect(
      bad([
        { start: "08:00", end: "09:00" },
        { start: "10:00", end: "11:00" },
        { start: "12:00", end: "13:00" },
      ])
    ).toThrow();
    expect(bad([{ start: "17:00", end: "09:00" }])).toThrow();
  });

  it("offers only times that keep the day valid", () => {
    const choices = timeChoices(week, 1, 0, "start");
    expect(choices).toContain("09:00");
    expect(choices).not.toContain("17:30");
  });
});
