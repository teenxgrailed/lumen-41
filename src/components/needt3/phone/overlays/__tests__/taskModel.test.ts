/** The task sheet's rules, against Tue 1 Sep 2026. */
import {
  anyTimePatch,
  chunkPatch,
  chunkWords,
  dayIsOn,
  dayPatch,
  deadlinePatch,
  dueWords,
  durationPatch,
  hourPatch,
  noDayPatch,
  placementPatch,
  scheduleSummary,
  timeWords,
} from "../taskModel";

const TODAY = "2026-09-01";

const base = {
  dueDate: TODAY as string | null,
  scheduledStart: null as string | null,
  scheduledEnd: null as string | null,
  estimatedMinutes: 30 as number | null,
  isFixed: false,
  chunk: null as number | null,
  splitAllowed: true,
  deadline: null as string | null,
  hardDeadline: false,
};

describe("reading", () => {
  it("dueWords: Today, Tomorrow, else the short date", () => {
    expect(dueWords(TODAY, TODAY)).toBe("Today");
    expect(dueWords("2026-09-02", TODAY)).toBe("Tomorrow");
    expect(dueWords("2026-09-04", TODAY)).toBe("4 Sep");
    expect(dueWords(null, TODAY)).toBeNull();
  });

  it("timeWords is the placed clock, or null", () => {
    expect(timeWords({ scheduledStart: "2026-09-01T09:30" })).toBe("09:30");
    expect(timeWords({ scheduledStart: null })).toBeNull();
  });

  it("a late day is no longer 'Today' or any day choice", () => {
    expect(dayIsOn({ dueDate: TODAY }, 0, TODAY)).toBe(true);
    expect(dayIsOn({ dueDate: "2026-09-02" }, 1, TODAY)).toBe(true);
    expect(dayIsOn({ dueDate: "2026-08-30" }, 0, TODAY)).toBe(false);
    expect(dayIsOn({ dueDate: null }, 0, TODAY)).toBe(false);
  });

  it("the folded card says placement, split, deadline in one line", () => {
    expect(scheduleSummary(base, TODAY)).toBe("Auto");
    expect(
      scheduleSummary(
        {
          ...base,
          isFixed: true,
          scheduledStart: "2026-09-01T14:00",
          chunk: 45,
          deadline: "2026-09-04",
          hardDeadline: true,
        },
        TODAY
      )
    ).toBe("Fixed 14:00 · min block 45 min · hard deadline 4 Sep");
    expect(scheduleSummary({ ...base, splitAllowed: false }, TODAY)).toBe(
      "Auto · no split"
    );
  });

  it("the block row: don't split, the minimum, or auto", () => {
    expect(chunkWords({ chunk: null, splitAllowed: false })).toBe(
      "Don’t split"
    );
    expect(chunkWords({ chunk: 25, splitAllowed: true })).toBe("25 min");
    expect(chunkWords({ chunk: null, splitAllowed: true })).toBe("Auto");
  });
});

describe("writing", () => {
  it("another day keeps the hour", () => {
    expect(
      dayPatch(
        {
          ...base,
          scheduledStart: "2026-09-01T14:30",
          scheduledEnd: "2026-09-01T15:00",
        },
        2,
        TODAY
      )
    ).toEqual({
      dueDate: "2026-09-03",
      scheduledStart: "2026-09-03T14:30",
      scheduledEnd: "2026-09-03T15:00",
    });
    expect(dayPatch(base, 1, TODAY)).toEqual({ dueDate: "2026-09-02" });
  });

  it("no date clears the place, and 'Any time' only the hour", () => {
    expect(noDayPatch()).toEqual({
      dueDate: null,
      scheduledStart: null,
      scheduledEnd: null,
      isFixed: false,
    });
    expect(anyTimePatch()).toEqual({
      scheduledStart: null,
      scheduledEnd: null,
      isFixed: false,
    });
  });

  it("an hour fixes the task on its day, or on today when it has none", () => {
    expect(hourPatch(base, 11, TODAY)).toEqual({
      dueDate: TODAY,
      scheduledStart: "2026-09-01T11:00",
      scheduledEnd: "2026-09-01T11:30",
      isFixed: true,
    });
    expect(hourPatch({ ...base, dueDate: null }, 9, TODAY).dueDate).toBe(TODAY);
  });

  it("a new length moves a placed task's end, and only that", () => {
    expect(durationPatch(base, 90)).toEqual({ estimatedMinutes: 90 });
    expect(
      durationPatch({ ...base, scheduledStart: "2026-09-01T23:00" }, 90)
    ).toEqual({
      estimatedMinutes: 90,
      scheduledEnd: "2026-09-02T00:30",
    });
  });

  it("placement, split and deadline", () => {
    expect(placementPatch(true)).toEqual({ isFixed: true, auto: false });
    expect(placementPatch(false)).toEqual({ isFixed: false, auto: true });
    expect(chunkPatch(null)).toEqual({ splitAllowed: false });
    expect(chunkPatch(30)).toEqual({ splitAllowed: true, chunk: 30 });
    expect(deadlinePatch(7, TODAY)).toEqual({ deadline: "2026-09-08" });
    expect(deadlinePatch(null, TODAY)).toEqual({
      deadline: null,
      hardDeadline: false,
    });
  });
});
