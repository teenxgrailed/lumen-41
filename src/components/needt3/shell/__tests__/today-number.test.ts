import { dayOfMonthIn, msToNextMidnight } from "../today-number";

describe("the calendar mark's day number", () => {
  it("is today's day in the person's zone, not a fixed number", () => {
    const at = new Date("2026-11-15T12:00:00Z");
    expect(dayOfMonthIn(at, "Europe/Zurich")).toBe(15);
    // 23:30 UTC on the 15th is already the 16th in Zurich, still the 15th in New York
    const late = new Date("2026-11-15T23:30:00Z");
    expect(dayOfMonthIn(late, "Europe/Zurich")).toBe(16);
    expect(dayOfMonthIn(late, "America/New_York")).toBe(15);
  });

  it("waits exactly until the next local midnight", () => {
    // 22:00 in Zurich (UTC+1) is 21:00 UTC: two hours to midnight
    const at = new Date("2026-11-15T21:00:00Z");
    expect(msToNextMidnight(at, "Europe/Zurich")).toBe(2 * 60 * 60 * 1000);
    expect(msToNextMidnight(at, "UTC")).toBe(3 * 60 * 60 * 1000);
  });

  it("handles a clock change (Zurich, 29.03.2026 has 23 hours)", () => {
    const at = new Date("2026-03-28T23:00:00Z"); // 00:00 on the 29th in Zurich
    expect(msToNextMidnight(at, "Europe/Zurich")).toBe(23 * 60 * 60 * 1000);
  });
});
