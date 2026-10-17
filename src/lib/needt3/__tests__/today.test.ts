import { daySpan, spanLabel } from "@/components/needt3/calendar/layout";

import { dayAt, todayLine, weekNumber } from "@/lib/needt3/today";

/** The owner's screenshot: Saturday 17 Oct 2026, 12:56 in Zurich (CEST, UTC+2). */
const SAT_NOON = new Date("2026-10-17T10:56:00Z");

describe("the day follows the person's zone", () => {
  it("Saturday 12:56 in Zurich is Saturday 17 October, not Friday", () => {
    expect(dayAt(SAT_NOON, "Europe/Zurich")).toBe("2026-10-17");
    expect(todayLine(SAT_NOON, "Europe/Zurich").date).toBe(
      "Saturday, 17 October"
    );
  });

  it("the same instant is still Friday where it is Friday", () => {
    expect(dayAt(new Date("2026-10-16T23:30:00Z"), "America/New_York")).toBe(
      "2026-10-16"
    );
    expect(dayAt(new Date("2026-10-16T23:30:00Z"), "Europe/Zurich")).toBe(
      "2026-10-17"
    );
  });

  it("the day changes at the person's midnight", () => {
    expect(dayAt(new Date("2026-10-16T21:59:00Z"), "Europe/Zurich")).toBe(
      "2026-10-16"
    );
    expect(dayAt(new Date("2026-10-16T22:00:00Z"), "Europe/Zurich")).toBe(
      "2026-10-17"
    );
  });
});

describe("the week number", () => {
  it("11-17 Oct (Sunday first) and 12-18 Oct (Monday first) are week 42", () => {
    for (const d of ["2026-10-11", "2026-10-14", "2026-10-17"]) {
      expect(weekNumber(d, "sunday")).toBe(42);
    }
    for (const d of ["2026-10-12", "2026-10-15", "2026-10-18"]) {
      expect(weekNumber(d, "monday")).toBe(42);
    }
  });

  it("a Sunday belongs to the week it starts when weeks start on Sunday", () => {
    expect(weekNumber("2026-10-11", "monday")).toBe(41);
    expect(weekNumber("2026-10-11", "sunday")).toBe(42);
  });

  it("follows the ISO numbering at the turn of the year", () => {
    expect(weekNumber("2026-01-01", "monday")).toBe(1);
    expect(weekNumber("2026-12-31", "monday")).toBe(53);
    expect(weekNumber("2027-01-01", "monday")).toBe(53);
    expect(weekNumber("2027-01-04", "monday")).toBe(1);
  });

  it("the Home header says Saturday, 17 October · week 42", () => {
    expect(todayLine(SAT_NOON, "Europe/Zurich", "monday").line).toBe(
      "Saturday, 17 October · week 42"
    );
    expect(todayLine(SAT_NOON, "Europe/Zurich", "sunday").line).toBe(
      "Saturday, 17 October · week 42"
    );
  });
});

describe("the calendar's span label agrees with the Home header", () => {
  it("11-17 Oct, Sunday first, is week 42 (it said 41)", () => {
    expect(spanLabel(daySpan("2026-10-11", 7), true)).toBe(
      "11 Oct – 17 Oct · week 42"
    );
  });
  it("12-18 Oct, Monday first, is week 42", () => {
    expect(spanLabel(daySpan("2026-10-12", 7), true)).toBe(
      "12 Oct – 18 Oct · week 42"
    );
  });
  it("a short span has no week", () => {
    expect(spanLabel(daySpan("2026-10-12", 3), false)).toBe("12 Oct – 14 Oct");
  });
});
