import { capacityByDay, workingWindowsForRange } from "../capacity";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/services/personal-time/service", () => ({
  personalBusyBlocks: jest.fn(),
}));
jest.mock("@/lib/work-week-server", () => ({ loadWeekHours: jest.fn() }));

const TZ = "UTC";
const start = new Date("2026-07-06T00:00:00.000Z"); // Monday
const week = [1, 2].map((day) => ({
  day,
  on: true,
  ranges: [{ start: "09:00", end: "17:00" }],
}));
const w = (s: string, e: string) => ({ start: new Date(s), end: new Date(e) });

describe("capacityByDay", () => {
  it("counts hours, meetings, tasks and over per day", () => {
    const windows = workingWindowsForRange(week, start, 3, TZ);
    const days = capacityByDay({
      rangeStart: start,
      days: 3,
      timeZone: TZ,
      windows,
      meetings: [
        w("2026-07-06T09:00:00Z", "2026-07-06T11:00:00Z"),
        // Evening event: outside hours, not counted against them.
        w("2026-07-06T19:00:00Z", "2026-07-06T20:00:00Z"),
      ],
      tasks: [
        w("2026-07-06T11:00:00Z", "2026-07-06T17:00:00Z"),
        w("2026-07-06T18:00:00Z", "2026-07-06T19:00:00Z"),
        w("2026-07-07T09:00:00Z", "2026-07-07T10:00:00Z"),
      ],
    });
    expect(days.map((d) => d.date)).toEqual([
      "2026-07-06",
      "2026-07-07",
      "2026-07-08",
    ]);
    expect(days[0]).toMatchObject({
      workingMinutes: 480,
      meetingMinutes: 120,
      taskMinutes: 420,
      outsideHoursMinutes: 60,
      freeMinutes: 0,
      plannedMinutes: 540,
      overMinutes: 60,
    });
    expect(days[1]).toMatchObject({
      workingMinutes: 480,
      taskMinutes: 60,
      freeMinutes: 420,
      overMinutes: 0,
    });
    // Wednesday is off in this week.
    expect(days[2]).toMatchObject({ workingMinutes: 0, plannedMinutes: 0 });
  });
});
