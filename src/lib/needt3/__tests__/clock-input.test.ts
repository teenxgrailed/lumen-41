import {
  clockSteps,
  formatClock,
  nearestStep,
  parseClock,
  snapQuarter,
} from "../clock-input";

describe("parseClock", () => {
  it.each([
    ["9", 540],
    ["09", 540],
    ["0", 0],
    ["930", 570],
    ["0930", 570],
    ["1430", 870],
    ["9:30", 570],
    ["9.30", 570],
    ["14:30", 870],
    ["14:05", 845],
    ["2pm", 840],
    ["2 PM", 840],
    ["2:30pm", 870],
    ["2:30 p.m.", 870],
    ["9a", 540],
    ["12am", 0],
    ["12pm", 720],
    ["12:15 am", 15],
    ["11:45pm", 1425],
    ["24:00", 1440],
    ["24", 1440],
    ["  8:15  ", 495],
  ])("reads %j as %i minutes", (text, minutes) => {
    expect(parseClock(text)).toBe(minutes);
  });

  it.each([
    "",
    "   ",
    "abc",
    "25",
    "24:30",
    "9:60",
    "960",
    "13pm",
    "0pm",
    "9:3:0",
    "1:2:3 pm",
    "-5",
  ])("rejects %j", (text) => {
    expect(parseClock(text)).toBeNull();
  });
});

describe("formatClock", () => {
  it("writes a 24-hour clock", () => {
    expect(formatClock(0, false)).toBe("00:00");
    expect(formatClock(570, false)).toBe("09:30");
    expect(formatClock(1425, false)).toBe("23:45");
    expect(formatClock(1440, false)).toBe("24:00");
  });

  it("writes a 12-hour clock", () => {
    expect(formatClock(0, true)).toBe("12:00 am");
    expect(formatClock(570, true)).toBe("9:30 am");
    expect(formatClock(720, true)).toBe("12:00 pm");
    expect(formatClock(1425, true)).toBe("11:45 pm");
    expect(formatClock(1440, true)).toBe("12:00 am");
  });

  it("round-trips through parseClock", () => {
    for (const use12h of [false, true]) {
      // 24:00 on a 12-hour clock reads "12:00 am", which is the day's start
      for (const m of clockSteps(0, use12h ? 1425 : 1440)) {
        expect(parseClock(formatClock(m, use12h))).toBe(m);
      }
    }
  });
});

describe("steps", () => {
  it("lists quarter hours across a day by default", () => {
    const all = clockSteps();
    expect(all).toHaveLength(96);
    expect(all[0]).toBe(0);
    expect(all[all.length - 1]).toBe(1425);
  });

  it("can start after a given time and end at midnight", () => {
    const after = clockSteps(615, 1440);
    expect(after[0]).toBe(615);
    expect(after[after.length - 1]).toBe(1440);
  });

  it("finds the closest step and snaps to a quarter", () => {
    const all = clockSteps();
    expect(all[nearestStep(all, 547)]).toBe(540);
    expect(all[nearestStep(all, 553)]).toBe(555);
    expect(nearestStep([], 10)).toBe(-1);
    expect(snapQuarter(547)).toBe(540);
    expect(snapQuarter(548)).toBe(555);
  });
});
