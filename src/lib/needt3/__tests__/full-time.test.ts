import {
  earlyLine,
  earlyMinutes,
  effectiveFullTime,
  fullTimeHint,
  fullTimePatch,
} from "../full-time";
import { taskFromApi, taskPatchToApi } from "../map";

describe("effectiveFullTime", () => {
  it("an explicit choice wins over the defaults", () => {
    expect(effectiveFullTime({ fullTime: true })).toBe(true);
    expect(effectiveFullTime({ fullTime: false, habitId: "h1" })).toBe(false);
    expect(effectiveFullTime({ fullTime: false, isRecurring: true })).toBe(
      false
    );
  });

  it("auto: a habit's task or a repeating one is full time, a one-off is not", () => {
    expect(effectiveFullTime({})).toBe(false);
    expect(effectiveFullTime({ fullTime: null })).toBe(false);
    expect(effectiveFullTime({ habitId: "h1" })).toBe(true);
    expect(effectiveFullTime({ isRecurring: true })).toBe(true);
    expect(effectiveFullTime({ recurrenceMasterId: "m1" })).toBe(true);
    expect(effectiveFullTime({ habitId: null, isRecurring: false })).toBe(
      false
    );
  });
});

describe("earlyMinutes", () => {
  it("is the planned length minus what was focused, never negative", () => {
    expect(earlyMinutes(25, 13)).toBe(12);
    expect(earlyMinutes(25, 25)).toBe(0);
    expect(earlyMinutes(25, 30)).toBe(0);
  });

  it("an open-ended session has nothing to give back", () => {
    expect(earlyMinutes(null, 40)).toBe(0);
    expect(earlyMinutes(undefined, 40)).toBe(0);
  });

  it("names the minutes in one calm line", () => {
    expect(earlyLine(12)).toBe("Done 12 min early");
  });
});

describe("the toggle", () => {
  it("sets the opposite of what the task comes to now", () => {
    expect(fullTimePatch({ fullTimeOn: false })).toEqual({ fullTime: true });
    expect(fullTimePatch({ fullTimeOn: true })).toEqual({ fullTime: false });
    expect(fullTimePatch({})).toEqual({ fullTime: true });
  });

  it("says where an automatic 'on' came from", () => {
    expect(fullTimeHint({ fullTime: null, fullTimeOn: true })).toMatch(
      /habits and repeating/
    );
    expect(fullTimeHint({ fullTime: true, fullTimeOn: true })).toMatch(
      /whole length/
    );
  });

  it("reads and writes through the task mapping", () => {
    const base = { id: "t1", title: "German", status: "todo" };
    const habit = taskFromApi({ ...base, habitId: "h1" }, "UTC");
    expect(habit.fullTime).toBeNull();
    expect(habit.fullTimeOn).toBe(true);
    const off = taskFromApi({ ...base, habitId: "h1", fullTime: false }, "UTC");
    expect(off.fullTimeOn).toBe(false);
    expect(taskPatchToApi({ fullTime: true }, "UTC")).toEqual({
      fullTime: true,
    });
    expect(taskPatchToApi({ fullTime: null }, "UTC")).toEqual({
      fullTime: null,
    });
  });
});
