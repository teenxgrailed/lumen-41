import {
  addCalendarDays,
  formatInTimeZone,
  fromZonedTime,
  startOfDayInTimeZone,
} from "../date-utils";

const show = (date: Date, zone: string) =>
  formatInTimeZone(date, zone, "yyyy-MM-dd HH:mm");

describe("addCalendarDays in a time zone", () => {
  it("steps over a 25-hour day keeping the wall-clock time", () => {
    const start = fromZonedTime("2026-10-25T00:00:00", "Europe/Zurich");
    expect(
      show(addCalendarDays(start, 1, "Europe/Zurich"), "Europe/Zurich")
    ).toBe("2026-10-26 00:00");
  });

  it("steps over a 23-hour day keeping the wall-clock time", () => {
    const start = fromZonedTime("2026-03-29T09:00:00", "Europe/Zurich");
    expect(
      show(addCalendarDays(start, 1, "Europe/Zurich"), "Europe/Zurich")
    ).toBe("2026-03-30 09:00");
  });

  it("handles America/New_York and negative steps", () => {
    const zone = "America/New_York";
    const start = fromZonedTime("2026-11-01T00:00:00", zone);
    expect(show(addCalendarDays(start, 1, zone), zone)).toBe(
      "2026-11-02 00:00"
    );
    expect(show(addCalendarDays(start, -1, zone), zone)).toBe(
      "2026-10-31 00:00"
    );
  });

  it("startOfDayInTimeZone returns local midnight on a clock-change day", () => {
    const instant = fromZonedTime("2026-10-25T15:00:00", "Europe/Zurich");
    const start = startOfDayInTimeZone(instant, "Europe/Zurich");
    expect(show(start, "Europe/Zurich")).toBe("2026-10-25 00:00");
    // 00:00 -> 15:00 on a 25-hour day is 16 real hours.
    expect(instant.getTime() - start.getTime()).toBe(16 * 3_600_000);
  });
});
