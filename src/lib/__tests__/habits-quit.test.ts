import {
  QUIT_MILESTONES,
  calendarDaysBetweenKeys,
  nextQuitMilestone,
  summarizeQuit,
  urgeDistribution,
} from "@/lib/habits-quit";

const d = (iso: string) => new Date(iso);

describe("QUIT_MILESTONES", () => {
  it("is the agreed ladder", () => {
    expect([...QUIT_MILESTONES]).toEqual([1, 3, 7, 14, 30, 90, 365]);
  });
});

describe("nextQuitMilestone", () => {
  it.each([
    [0, { days: 1, daysLeft: 1 }],
    [1, { days: 3, daysLeft: 2 }],
    [6, { days: 7, daysLeft: 1 }],
    [7, { days: 14, daysLeft: 7 }],
    [364, { days: 365, daysLeft: 1 }],
    [365, null],
    [1000, null],
  ])("streak %i", (streak, expected) => {
    expect(nextQuitMilestone(streak)).toEqual(expected);
  });
});

describe("summarizeQuit", () => {
  it("has no streak and no events when nothing was started", () => {
    const summary = summarizeQuit({
      quitStartedAt: null,
      events: [],
      now: d("2026-11-04T10:00:00Z"),
      timeZone: "Europe/Zurich",
    });
    expect(summary).toMatchObject({
      started: false,
      currentStreak: 0,
      bestStreak: 0,
      totalCleanDays: 0,
      lastMilestone: null,
      nextMilestone: { days: 1, daysLeft: 1 },
      counts: { URGE: 0, RESISTED: 0, RELAPSE: 0, MILESTONE: 0 },
      topUrgeTags: [],
    });
    expect(summary.urges.total).toBe(0);
    expect(summary.urges.byHour).toHaveLength(24);
    expect(summary.urges.byWeekday).toHaveLength(7);
  });

  it("counts from a start date in the past with zero events", () => {
    const summary = summarizeQuit({
      quitStartedAt: d("2026-10-25T08:00:00Z"),
      events: [],
      now: d("2026-11-04T10:00:00Z"),
      timeZone: "UTC",
    });
    expect(summary.currentStreak).toBe(10);
    expect(summary.bestStreak).toBe(10);
    expect(summary.totalCleanDays).toBe(10);
    expect(summary.lastMilestone).toBe(7);
    expect(summary.nextMilestone).toEqual({ days: 14, daysLeft: 4 });
  });

  it("is day 0 on the day the quit began and a future start is not a streak", () => {
    const sameDay = summarizeQuit({
      quitStartedAt: d("2026-11-04T06:00:00Z"),
      events: [],
      now: d("2026-11-04T20:00:00Z"),
      timeZone: "UTC",
    });
    expect(sameDay.currentStreak).toBe(0);
    expect(sameDay.started).toBe(true);
    const future = summarizeQuit({
      quitStartedAt: d("2026-11-10T06:00:00Z"),
      events: [],
      now: d("2026-11-04T20:00:00Z"),
      timeZone: "UTC",
    });
    expect(future.currentStreak).toBe(0);
    expect(future.totalCleanDays).toBe(0);
  });

  it("restarts the current streak at a relapse and keeps the best one", () => {
    const summary = summarizeQuit({
      quitStartedAt: d("2026-10-01T08:00:00Z"),
      events: [
        { type: "RELAPSE", at: d("2026-10-11T20:00:00Z") },
        { type: "RELAPSE", at: d("2026-10-16T09:00:00Z") },
      ],
      now: d("2026-10-20T12:00:00Z"),
      timeZone: "UTC",
    });
    // Oct 1 to 11 = 10, Oct 11 to 16 = 5, Oct 16 to 20 = 4.
    expect(summary.currentStreak).toBe(4);
    expect(summary.bestStreak).toBe(10);
    expect(summary.totalCleanDays).toBe(19);
    expect(summary.counts.RELAPSE).toBe(2);
    expect(summary.streakStartedAt).toEqual(d("2026-10-16T09:00:00Z"));
  });

  it("ignores relapses before the start and after now", () => {
    const summary = summarizeQuit({
      quitStartedAt: d("2026-10-10T08:00:00Z"),
      events: [
        { type: "RELAPSE", at: d("2026-10-01T08:00:00Z") },
        { type: "RELAPSE", at: d("2026-10-30T08:00:00Z") },
      ],
      now: d("2026-10-20T08:00:00Z"),
      timeZone: "UTC",
    });
    expect(summary.currentStreak).toBe(10);
    expect(summary.bestStreak).toBe(10);
  });

  it("a relapse the day after the start leaves a one day streak behind", () => {
    const summary = summarizeQuit({
      quitStartedAt: d("2026-10-01T08:00:00Z"),
      events: [{ type: "RELAPSE", at: d("2026-10-02T23:00:00Z") }],
      now: d("2026-10-02T23:30:00Z"),
      timeZone: "UTC",
    });
    expect(summary.currentStreak).toBe(0);
    expect(summary.bestStreak).toBe(1);
    expect(summary.totalCleanDays).toBe(1);
    expect(summary.lastMilestone).toBeNull();
  });

  it("does not need the events to arrive in order", () => {
    const events = [
      { type: "RELAPSE" as const, at: d("2026-10-16T09:00:00Z") },
      { type: "RELAPSE" as const, at: d("2026-10-11T20:00:00Z") },
    ];
    const summary = summarizeQuit({
      quitStartedAt: d("2026-10-01T08:00:00Z"),
      events,
      now: d("2026-10-20T12:00:00Z"),
      timeZone: "UTC",
    });
    expect(summary.currentStreak).toBe(4);
    expect(summary.bestStreak).toBe(10);
  });

  describe("time zones", () => {
    const base = {
      quitStartedAt: d("2026-11-01T23:30:00Z"),
      events: [],
      now: d("2026-11-04T00:30:00Z"),
    };

    it("moves the day boundary with the person's zone", () => {
      // UTC: Nov 1 to Nov 4 = 3. Zurich (UTC+1): 00:30 Nov 2 to 01:30 Nov 4 = 2.
      expect(summarizeQuit({ ...base, timeZone: "UTC" }).currentStreak).toBe(3);
      expect(
        summarizeQuit({ ...base, timeZone: "Europe/Zurich" }).currentStreak
      ).toBe(2);
      // Los Angeles (UTC-8 in November): Nov 1 15:30 to Nov 3 16:30 = 2.
      expect(
        summarizeQuit({ ...base, timeZone: "America/Los_Angeles" })
          .currentStreak
      ).toBe(2);
      // Auckland (UTC+13): Nov 2 12:30 to Nov 4 13:30 = 2.
      expect(
        summarizeQuit({ ...base, timeZone: "Pacific/Auckland" }).currentStreak
      ).toBe(2);
    });

    it("falls back to UTC for an unknown zone", () => {
      const summary = summarizeQuit({ ...base, timeZone: "Not/AZone" });
      expect(summary.timeZone).toBe("UTC");
      expect(summary.currentStreak).toBe(3);
    });
  });

  describe("daylight saving", () => {
    it("counts calendar days across the spring change (Zurich, 29.03.26)", () => {
      // 00:30 CET on 28 March to 00:10 CEST on 30 March: 46h40 of real time,
      // two calendar days.
      const summary = summarizeQuit({
        quitStartedAt: d("2026-03-27T23:30:00Z"),
        events: [],
        now: d("2026-03-29T22:10:00Z"),
        timeZone: "Europe/Zurich",
      });
      expect(summary.currentStreak).toBe(2);
    });

    it("counts calendar days across the autumn change (Zurich, 25.10.26)", () => {
      // 23:30 CEST on 24 October to 23:10 CET on 26 October: 49h40, two days.
      const summary = summarizeQuit({
        quitStartedAt: d("2026-10-24T21:30:00Z"),
        events: [],
        now: d("2026-10-26T22:10:00Z"),
        timeZone: "Europe/Zurich",
      });
      expect(summary.currentStreak).toBe(2);
    });

    it("puts a late evening relapse on the right local day", () => {
      const summary = summarizeQuit({
        quitStartedAt: d("2026-03-20T10:00:00Z"),
        events: [{ type: "RELAPSE", at: d("2026-03-28T23:30:00Z") }],
        now: d("2026-03-30T10:00:00Z"),
        timeZone: "Europe/Zurich",
      });
      // 23:30Z on 28 March is 00:30 CET on 29 March (the clocks change at
      // 02:00 that night), so the relapse belongs to the 29th.
      expect(summary.currentStreak).toBe(1);
      expect(summary.bestStreak).toBe(9);
    });
  });

  it("lists the most used urge tags first", () => {
    const summary = summarizeQuit({
      quitStartedAt: d("2026-10-01T00:00:00Z"),
      events: [
        { type: "URGE", at: d("2026-10-02T10:00:00Z"), tag: "stress" },
        { type: "URGE", at: d("2026-10-03T10:00:00Z"), tag: "coffee" },
        { type: "URGE", at: d("2026-10-04T10:00:00Z"), tag: "stress" },
        { type: "RESISTED", at: d("2026-10-04T10:05:00Z"), tag: "stress" },
        { type: "URGE", at: d("2026-10-05T10:00:00Z") },
      ],
      now: d("2026-10-10T00:00:00Z"),
      timeZone: "UTC",
    });
    expect(summary.topUrgeTags).toEqual([
      { tag: "stress", count: 2 },
      { tag: "coffee", count: 1 },
    ]);
    expect(summary.counts).toMatchObject({ URGE: 4, RESISTED: 1 });
  });
});

describe("urgeDistribution", () => {
  const events = [
    // Wed 2026-11-04 22:15 UTC = 23:15 Zurich (Wed).
    { type: "URGE" as const, at: d("2026-11-04T22:15:00Z") },
    // Wed 2026-11-04 23:30 UTC = 00:30 Thu in Zurich.
    { type: "URGE" as const, at: d("2026-11-04T23:30:00Z") },
    // Sun 2026-11-01 12:00 UTC.
    { type: "URGE" as const, at: d("2026-11-01T12:00:00Z") },
    // Not an urge.
    { type: "RESISTED" as const, at: d("2026-11-02T12:00:00Z") },
  ];

  it("buckets by hour and weekday in the given zone", () => {
    const zurich = urgeDistribution(events, "Europe/Zurich");
    expect(zurich.total).toBe(3);
    expect(zurich.byHour[23]).toBe(1);
    expect(zurich.byHour[0]).toBe(1);
    expect(zurich.byHour[13]).toBe(1);
    expect(zurich.byWeekday[3]).toBe(1); // Wednesday
    expect(zurich.byWeekday[4]).toBe(1); // Thursday
    expect(zurich.byWeekday[0]).toBe(1); // Sunday
  });

  it("changes buckets when the zone changes", () => {
    const utc = urgeDistribution(events, "UTC");
    expect(utc.byHour[22]).toBe(1);
    expect(utc.byHour[23]).toBe(1);
    expect(utc.byHour[12]).toBe(1);
    expect(utc.byWeekday[3]).toBe(2);
    const tokyo = urgeDistribution(events, "Asia/Tokyo");
    expect(tokyo.byHour[7]).toBe(1); // 22:15Z + 9h = 07:15 Thu
    expect(tokyo.byWeekday[4]).toBe(2);
  });

  it("returns zeroes for no events", () => {
    const empty = urgeDistribution([], "UTC");
    expect(empty.total).toBe(0);
    expect(empty.byHour.every((n) => n === 0)).toBe(true);
    expect(empty.byWeekday.every((n) => n === 0)).toBe(true);
  });
});

describe("calendarDaysBetweenKeys", () => {
  it("counts across month and leap-year edges and never goes negative", () => {
    expect(calendarDaysBetweenKeys("2028-02-28", "2028-03-01")).toBe(2);
    expect(calendarDaysBetweenKeys("2026-12-31", "2027-01-01")).toBe(1);
    expect(calendarDaysBetweenKeys("2026-11-04", "2026-11-01")).toBe(0);
  });
});
