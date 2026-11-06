import {
  daysSinceCheckIn,
  habitReminderDue,
  inPresenceWindow,
  localClock,
  milestoneToAnnounce,
  presenceTag,
  presenceText,
  reengageDue,
} from "@/services/habits/presence";

const d = (iso: string) => new Date(iso);

describe("localClock", () => {
  it("reads the wall clock, day and weekday in the person's zone", () => {
    // 2026-11-04 is a Wednesday.
    expect(localClock(d("2026-11-04T22:30:00Z"), "Europe/Zurich")).toEqual({
      dayKey: "2026-11-04",
      minutes: 23 * 60 + 30,
      weekday: 3,
    });
    // Same instant in Tokyo is already Thursday morning.
    expect(localClock(d("2026-11-04T22:30:00Z"), "Asia/Tokyo")).toEqual({
      dayKey: "2026-11-05",
      minutes: 7 * 60 + 30,
      weekday: 4,
    });
  });

  it("falls back to UTC for an unknown zone", () => {
    expect(localClock(d("2026-11-04T10:00:00Z"), "Nope/Zone").minutes).toBe(
      600
    );
  });

  it("Sunday is 0", () => {
    expect(localClock(d("2026-11-01T12:00:00Z"), "UTC").weekday).toBe(0);
  });
});

describe("inPresenceWindow", () => {
  const clock = (minutes: number) => ({ dayKey: "x", minutes, weekday: 1 });

  it("opens at the time and closes an hour later", () => {
    expect(inPresenceWindow("18:00", clock(17 * 60 + 59))).toBe(false);
    expect(inPresenceWindow("18:00", clock(18 * 60))).toBe(true);
    expect(inPresenceWindow("18:00", clock(18 * 60 + 59))).toBe(true);
    expect(inPresenceWindow("18:00", clock(19 * 60))).toBe(false);
  });

  it("is closed for a missing or malformed time", () => {
    expect(inPresenceWindow(null, clock(600))).toBe(false);
    expect(inPresenceWindow("25:00", clock(600))).toBe(false);
    expect(inPresenceWindow("9:00", clock(600))).toBe(false);
  });

  it("a wall time skipped by the spring change still fires after it", () => {
    // Zurich 2026-03-29: 02:00 jumps to 03:00. A habit at 02:30 is due at
    // 03:05 local (01:05Z).
    const after = localClock(d("2026-03-29T01:05:00Z"), "Europe/Zurich");
    expect(after.minutes).toBe(3 * 60 + 5);
    expect(inPresenceWindow("02:30", after)).toBe(true);
    const before = localClock(d("2026-03-29T00:55:00Z"), "Europe/Zurich");
    expect(inPresenceWindow("02:30", before)).toBe(false);
  });

  it("is due on the person's clock across the autumn change", () => {
    // 18:00 in Zurich is 17:00Z on 24 Oct (CEST) and 17:00Z... +1h on 26 Oct.
    expect(
      inPresenceWindow(
        "18:00",
        localClock(d("2026-10-24T16:10:00Z"), "Europe/Zurich")
      )
    ).toBe(true);
    expect(
      inPresenceWindow(
        "18:00",
        localClock(d("2026-10-26T16:10:00Z"), "Europe/Zurich")
      )
    ).toBe(false);
    expect(
      inPresenceWindow(
        "18:00",
        localClock(d("2026-10-26T17:10:00Z"), "Europe/Zurich")
      )
    ).toBe(true);
  });
});

describe("habitReminderDue", () => {
  const wednesday = localClock(d("2026-11-04T17:10:00Z"), "Europe/Zurich"); // 18:10
  const habit = { at: "18:00", daysOfWeek: [] as number[] };

  it("is due in the window when not done", () => {
    expect(habitReminderDue(habit, wednesday, false)).toBe(true);
  });
  it("is not due when already done today", () => {
    expect(habitReminderDue(habit, wednesday, true)).toBe(false);
  });
  it("respects the habit's days", () => {
    expect(
      habitReminderDue({ ...habit, daysOfWeek: [1, 2] }, wednesday, false)
    ).toBe(false);
    expect(
      habitReminderDue({ ...habit, daysOfWeek: [3] }, wednesday, false)
    ).toBe(true);
  });
  it("a habit with no time has no reminder", () => {
    expect(
      habitReminderDue({ at: null, daysOfWeek: [] }, wednesday, false)
    ).toBe(false);
  });
});

describe("milestoneToAnnounce", () => {
  it.each([
    [{ currentStreak: 7, lastMilestone: 7 }, 7],
    [{ currentStreak: 8, lastMilestone: 7 }, 7],
    [{ currentStreak: 9, lastMilestone: 7 }, null],
    [{ currentStreak: 0, lastMilestone: null }, null],
    [{ currentStreak: 400, lastMilestone: 365 }, null],
  ])("%j", (input, expected) => {
    expect(milestoneToAnnounce(input)).toBe(expected);
  });
});

describe("re-engage", () => {
  it("counts days since the latest check-in, or the habit's age", () => {
    expect(
      daysSinceCheckIn("2026-11-04", ["2026-11-01", "2026-10-20"], "2026-09-01")
    ).toBe(3);
    expect(daysSinceCheckIn("2026-11-04", [], "2026-11-01")).toBe(3);
    expect(daysSinceCheckIn("2026-11-04", ["2026-11-04"], "2026-09-01")).toBe(
      0
    );
  });

  const noon = localClock(d("2026-11-04T11:10:00Z"), "Europe/Zurich"); // 12:10
  const base = {
    clock: noon,
    daysQuiet: 3,
    lastReengageAt: null,
    now: d("2026-11-04T11:10:00Z"),
  };

  it("is due after 3 quiet days at midday", () => {
    expect(reengageDue(base)).toBe(true);
  });
  it("is not due earlier, at night, or within the cooldown", () => {
    expect(reengageDue({ ...base, daysQuiet: 2 })).toBe(false);
    expect(
      reengageDue({
        ...base,
        clock: localClock(d("2026-11-04T21:10:00Z"), "Europe/Zurich"),
      })
    ).toBe(false);
    expect(
      reengageDue({ ...base, lastReengageAt: d("2026-10-31T11:00:00Z") })
    ).toBe(false);
    expect(
      reengageDue({ ...base, lastReengageAt: d("2026-10-27T11:00:00Z") })
    ).toBe(true);
  });
});

describe("texts", () => {
  it("are short and carry no pressure words", () => {
    const all = [
      presenceText.reminder("Read"),
      presenceText.checkin(1),
      presenceText.checkin(3),
      presenceText.milestone("No sugar", 1),
      presenceText.milestone("No sugar", 30),
      presenceText.reengage(),
    ];
    for (const text of all) {
      expect(text.title.length).toBeLessThan(40);
      expect(text.body.length).toBeLessThan(60);
      expect(`${text.title} ${text.body}`).not.toMatch(
        /don.?t|fail|lazy|streak|lost|miss|should|must|only/i
      );
    }
    expect(presenceText.checkin(1).body).toBe("1 habit is still open today.");
    expect(presenceText.milestone("x", 7).title).toBe("7 days in");
  });
});

describe("presenceTag", () => {
  it("names each moment as the island does", () => {
    expect(
      presenceTag({ kind: "reminder", habitId: "h", dayKey: "2026-11-04" })
    ).toBe("rem:h:2026-11-04");
    expect(
      presenceTag({ kind: "checkin", habitId: null, dayKey: "2026-11-04" })
    ).toBe("checkin:2026-11-04");
    expect(
      presenceTag({
        kind: "milestone",
        habitId: "q",
        dayKey: "2026-11-04",
        days: 14,
      })
    ).toBe("ms:q:14");
  });
});
