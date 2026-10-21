import {
  earlyLine,
  earlyMinutes,
  effectiveFullTime,
  fullTimeAuto,
  fullTimeHint,
  fullTimePatch,
} from "../full-time";
import { taskFromApi, taskPatchToApi } from "../map";

describe("effectiveFullTime", () => {
  it("a one-off follows the person's own choice, off by default", () => {
    expect(effectiveFullTime({})).toBe(false);
    expect(effectiveFullTime({ fullTime: null })).toBe(false);
    expect(effectiveFullTime({ fullTime: false })).toBe(false);
    expect(effectiveFullTime({ fullTime: true })).toBe(true);
    expect(effectiveFullTime({ habitId: null, isRecurring: false })).toBe(
      false
    );
  });

  it("a habit's task and a repeating one are FORCED on; a stored false does not undo it", () => {
    for (const fullTime of [undefined, null, true, false]) {
      expect(effectiveFullTime({ fullTime, habitId: "h1" })).toBe(true);
      expect(effectiveFullTime({ fullTime, isRecurring: true })).toBe(true);
      expect(effectiveFullTime({ fullTime, recurrenceMasterId: "m1" })).toBe(
        true
      );
    }
  });

  it("names the reason the switch is locked: habit before repeat, none for a one-off", () => {
    expect(fullTimeAuto({ habitId: "h1" })).toBe("habit");
    expect(fullTimeAuto({ habitId: "h1", isRecurring: true })).toBe("habit");
    expect(fullTimeAuto({ isRecurring: true })).toBe("repeat");
    expect(fullTimeAuto({ recurrenceMasterId: "m1" })).toBe("repeat");
    expect(fullTimeAuto({ fullTime: true })).toBeNull();
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

  it("says what the switch does, and why a locked one is on", () => {
    expect(fullTimeHint({ fullTimeOn: false })).toBe(
      "Done ends the focus right away"
    );
    expect(fullTimeHint({ fullTimeOn: true })).toBe(
      "Done before the time is up asks first"
    );
    expect(fullTimeHint({ fullTimeOn: true, fullTimeAuto: "habit" })).toBe(
      "Habits always run the full time"
    );
    expect(fullTimeHint({ fullTimeOn: true, fullTimeAuto: "repeat" })).toBe(
      "Repeating tasks run the full time"
    );
  });

  it("reads and writes through the task mapping", () => {
    const base = { id: "t1", title: "German", status: "todo" };
    const habit = taskFromApi({ ...base, habitId: "h1" }, "UTC");
    expect(habit.fullTime).toBeNull();
    expect(habit.fullTimeOn).toBe(true);
    expect(habit.fullTimeAuto).toBe("habit");
    // a stored false cannot turn a habit's task off
    const stale = taskFromApi(
      { ...base, habitId: "h1", fullTime: false },
      "UTC"
    );
    expect(stale.fullTimeOn).toBe(true);
    const oneOff = taskFromApi({ ...base, fullTime: false }, "UTC");
    expect(oneOff.fullTimeOn).toBe(false);
    expect(oneOff.fullTimeAuto).toBeNull();
    expect(taskPatchToApi({ fullTime: true }, "UTC")).toEqual({
      fullTime: true,
    });
    expect(taskPatchToApi({ fullTime: null }, "UTC")).toEqual({
      fullTime: null,
    });
  });
});
