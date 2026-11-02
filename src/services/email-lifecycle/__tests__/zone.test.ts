import {
  STANDARD_WINDOW,
  firstWeekdayOfMonth,
  isInWindow,
  isValidTimeZone,
  localMonthKey,
  localParts,
  minutesOfDay,
  nextWindowStart,
  safeTimeZone,
  zonedTimeToUtc,
} from "../zone";

const iso = (value: string) => new Date(value);

describe("time zones", () => {
  it("falls back to UTC for an unknown zone", () => {
    expect(isValidTimeZone("Europe/Berlin")).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(safeTimeZone("Not/AZone")).toEqual({ zone: "UTC", invalid: true });
    expect(safeTimeZone("")).toEqual({ zone: "UTC", invalid: true });
    expect(safeTimeZone("Europe/Berlin")).toEqual({
      zone: "Europe/Berlin",
      invalid: false,
    });
  });

  it("reads the wall clock of a zone", () => {
    expect(
      localParts(iso("2026-11-03T14:00:00.000Z"), "America/New_York")
    ).toEqual({
      year: 2026,
      month: 11,
      day: 3,
      hour: 9,
      minute: 0,
      weekday: 2,
    });
  });
});

describe("minutesOfDay", () => {
  it.each([
    ["00:00", 0],
    ["09:30", 570],
    ["23:59", 1439],
    ["24:00", null],
    ["9", null],
    ["", null],
    [null, null],
  ])("%s -> %s", (value, expected) => {
    expect(minutesOfDay(value as string | null)).toBe(expected);
  });
});

describe("zonedTimeToUtc", () => {
  it("handles standard time and daylight time", () => {
    expect(
      zonedTimeToUtc(
        { year: 2026, month: 1, day: 15, hour: 9, minute: 0 },
        "America/New_York"
      )
    ).toEqual(iso("2026-01-15T14:00:00.000Z"));
    expect(
      zonedTimeToUtc(
        { year: 2026, month: 7, day: 15, hour: 9, minute: 0 },
        "America/New_York"
      )
    ).toEqual(iso("2026-07-15T13:00:00.000Z"));
  });

  it("is right the day after the spring-forward change (8 March 2026)", () => {
    expect(
      zonedTimeToUtc(
        { year: 2026, month: 3, day: 9, hour: 9, minute: 0 },
        "America/New_York"
      )
    ).toEqual(iso("2026-03-09T13:00:00.000Z"));
    expect(
      zonedTimeToUtc(
        { year: 2026, month: 3, day: 6, hour: 9, minute: 0 },
        "America/New_York"
      )
    ).toEqual(iso("2026-03-06T14:00:00.000Z"));
  });
});

describe("send window", () => {
  const window = { ...STANDARD_WINDOW };

  it("is 09:00 (inclusive) to 19:00 (exclusive) on weekdays", () => {
    expect(isInWindow(iso("2026-11-03T08:59:00.000Z"), "UTC", window)).toBe(
      false
    );
    expect(isInWindow(iso("2026-11-03T09:00:00.000Z"), "UTC", window)).toBe(
      true
    );
    expect(isInWindow(iso("2026-11-03T18:59:00.000Z"), "UTC", window)).toBe(
      true
    );
    expect(isInWindow(iso("2026-11-03T19:00:00.000Z"), "UTC", window)).toBe(
      false
    );
  });

  it("excludes the weekend unless allowed", () => {
    const saturday = iso("2026-11-07T10:00:00.000Z");
    expect(isInWindow(saturday, "UTC", window)).toBe(false);
    expect(isInWindow(saturday, "UTC", { ...window, weekends: true })).toBe(
      true
    );
  });

  it("excludes the person's quiet hours, also across midnight", () => {
    const quiet = { startMinute: 12 * 60, endMinute: 14 * 60 };
    expect(
      isInWindow(iso("2026-11-03T13:00:00.000Z"), "UTC", { ...window, quiet })
    ).toBe(false);
    const overnight = { startMinute: 22 * 60, endMinute: 10 * 60 };
    expect(
      isInWindow(iso("2026-11-03T09:30:00.000Z"), "UTC", {
        ...window,
        quiet: overnight,
      })
    ).toBe(false);
    expect(
      isInWindow(iso("2026-11-03T10:00:00.000Z"), "UTC", {
        ...window,
        quiet: overnight,
      })
    ).toBe(true);
  });

  it("uses the person's zone", () => {
    expect(
      isInWindow(iso("2026-11-03T13:59:00.000Z"), "America/New_York", window)
    ).toBe(false);
    expect(
      isInWindow(iso("2026-11-03T14:00:00.000Z"), "America/New_York", window)
    ).toBe(true);
  });
});

describe("nextWindowStart", () => {
  const window = { ...STANDARD_WINDOW };

  it("returns the same instant when it is already inside", () => {
    const at = iso("2026-11-03T10:00:00.000Z");
    expect(nextWindowStart(at, "UTC", window)).toEqual(at);
  });

  it("rounds up to the next quarter hour", () => {
    expect(
      nextWindowStart(iso("2026-11-03T10:01:00.000Z"), "UTC", window)
    ).toEqual(iso("2026-11-03T10:15:00.000Z"));
  });

  it("moves a Friday evening to Monday morning", () => {
    expect(
      nextWindowStart(iso("2026-11-06T19:30:00.000Z"), "UTC", window)
    ).toEqual(iso("2026-11-09T09:00:00.000Z"));
  });

  it("returns null when quiet hours cover the whole day", () => {
    expect(
      nextWindowStart(iso("2026-11-03T05:00:00.000Z"), "UTC", {
        ...window,
        quiet: { startMinute: 0, endMinute: 1439 },
      })
    ).toBeNull();
  });
});

describe("month helpers", () => {
  it("finds the first weekday of the month at the given hour", () => {
    // 1 Nov 2026 is a Sunday, so the first weekday is Monday 2 November.
    expect(
      firstWeekdayOfMonth(iso("2026-11-20T12:00:00.000Z"), "UTC", 10)
    ).toEqual(iso("2026-11-02T10:00:00.000Z"));
    // 1 Dec 2026 is a Tuesday.
    expect(
      firstWeekdayOfMonth(iso("2026-12-20T12:00:00.000Z"), "UTC", 10)
    ).toEqual(iso("2026-12-01T10:00:00.000Z"));
  });

  it("names the local month", () => {
    expect(localMonthKey(iso("2026-11-30T23:30:00.000Z"), "UTC")).toBe(
      "2026-11"
    );
    expect(localMonthKey(iso("2026-11-30T23:30:00.000Z"), "Asia/Tokyo")).toBe(
      "2026-12"
    );
  });
});
