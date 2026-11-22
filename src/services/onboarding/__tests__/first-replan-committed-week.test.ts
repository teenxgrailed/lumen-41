import { demoSlot, freeGapAfter, overlaps } from "../first-replan-demo";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));

/**
 * `/start` writes next week's tasks (`nextWeekStart`) and then the demo is
 * seeded. These check the demo against a committed week: the demo never lands
 * on one of its blocks, and the move after the meeting never does either.
 */
describe("first-replan demo next to a week committed by /start", () => {
  const zone = "Europe/Zurich";
  const hours = { startHour: 8, endHour: 18, days: [1, 2, 3, 4, 5] };
  const d = (iso: string) => new Date(iso);
  // The committed week: Monday 23.11.2026, 09:00 to 12:00 Zurich in blocks.
  const week = [
    { start: d("2026-11-23T08:00:00Z"), end: d("2026-11-23T09:00:00Z") },
    { start: d("2026-11-23T09:15:00Z"), end: d("2026-11-23T10:15:00Z") },
    { start: d("2026-11-24T08:00:00Z"), end: d("2026-11-24T09:30:00Z") },
  ];

  it("on a weekday the demo is this week, before any committed block", () => {
    // Wed 18.11.2026 10:10 Zurich.
    const slot = demoSlot(d("2026-11-18T09:10:00Z"), zone, hours);
    for (const block of week) {
      expect(
        overlaps({ start: slot.taskStart, end: slot.meetingEnd }, block)
      ).toBe(false);
    }
  });

  it("the move after the meeting skips the committed blocks", () => {
    // Friday evening: the demo falls on Monday 23.11 and meets the week.
    const now = d("2026-11-20T17:30:00Z");
    const slot = demoSlot(now, zone, hours);
    expect(slot.taskStart.getTime()).toBeGreaterThan(now.getTime());
    const target = freeGapAfter({
      after: slot.meetingEnd,
      now,
      zone,
      hours,
      busy: week,
    });
    expect(target).not.toBeNull();
    expect(target!.start.getTime()).toBeGreaterThanOrEqual(
      slot.meetingEnd.getTime()
    );
    for (const block of week) {
      expect(overlaps(target!, block)).toBe(false);
    }
  });
});
