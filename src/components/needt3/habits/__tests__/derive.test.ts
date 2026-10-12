import { type Checkin, daysBetween } from "@/lib/needt3/derive";
import { PLAN_LIMITS } from "@/lib/plan-limits";

import checkinFixtures from "../../../../../docs/port/prototype/port/fixtures/habitCheckins.json";
import habitFixtures from "../../../../../docs/port/prototype/port/fixtures/habits.json";
import {
  FREE_HABITS,
  activeDays,
  capHabits,
  habitCard,
  habitGate,
  monthRows,
  normTime,
  streakText,
  timeLeft,
  timeOk,
} from "../derive";

const TODAY = "2026-09-01";
const ci = (habitId: string, dates: string[]): Checkin[] =>
  dates.map((date) => ({ habitId, date, done: true }));
const daily = { id: "h", title: "Read", schedule: { perWeek: null } };

describe("habitCard", () => {
  it("reads kept today with the 14-day share and the streak", () => {
    const c = habitCard(
      daily,
      ci("h", ["2026-08-29", "2026-08-30", "2026-08-31", "2026-09-01"]),
      TODAY
    );
    expect(c.on).toBe(true);
    expect(c.status).toBe("Kept today");
    expect(c.streak).toBe(4);
    expect(c.label).toBe("4 of 14 · 4 in a row");
    expect(c.days).toHaveLength(14);
    expect(c.days[13]).toBe(1);
    expect(c.say).toMatch(/press to undo/);
  });
  it("an open today does not break the streak", () => {
    const c = habitCard(daily, ci("h", ["2026-08-30", "2026-08-31"]), TODAY);
    expect(c.on).toBe(false);
    expect(c.status).toBe("Not yet today");
    expect(c.streak).toBe(2);
  });
  it("one day is not a streak", () => {
    const c = habitCard(daily, ci("h", ["2026-08-31"]), TODAY);
    expect(c.label).toBe("1 of 14");
  });
  it("a perWeek habit whose week is met steps back", () => {
    const c = habitCard(
      { id: "g", title: "Gym", schedule: { perWeek: 3 } },
      ci("g", ["2026-08-27", "2026-08-29", "2026-08-31"]),
      TODAY
    );
    expect(c.rest).toBe(true);
    expect(c.status).toBe("Week done");
    expect(c.label).toBe("3/3 this week");
    expect(c.say).toMatch(/week done/);
  });
  it("works on the prototype fixtures", () => {
    for (const h of habitFixtures) {
      const c = habitCard(h, checkinFixtures as Checkin[], TODAY);
      expect(c.days).toHaveLength(14);
      expect(c.streak).toBeGreaterThanOrEqual(0);
      expect(c.streak).toBeLessThanOrEqual(14);
    }
  });
});

describe("streakText", () => {
  it("says a streak from two days and marks a full window as open-ended", () => {
    expect(streakText(0)).toBe("");
    expect(streakText(1)).toBe("");
    expect(streakText(5)).toBe("5 in a row");
    expect(streakText(14)).toBe("14+ in a row");
  });
});

describe("capHabits", () => {
  const list = Array.from({ length: 20 }, (_, i) => i);
  it("shows twelve and offers the rest past fourteen", () => {
    expect(capHabits(list, false).shown).toHaveLength(12);
    expect(capHabits(list, false).over).toBe(true);
    expect(capHabits(list, true).shown).toHaveLength(20);
  });
  it("shows fourteen or fewer whole", () => {
    expect(capHabits(list.slice(0, 14), false)).toEqual({
      over: false,
      shown: list.slice(0, 14),
    });
  });
});

describe("habitGate", () => {
  it("uses the limit the API enforces", () => {
    expect(FREE_HABITS).toBe(PLAN_LIMITS.FREE.habits);
    expect(FREE_HABITS).toBe(3);
  });

  it("stops Free at three habits", () => {
    expect(habitGate("free", FREE_HABITS - 1).atLimit).toBe(false);
    expect(habitGate("free", FREE_HABITS)).toEqual({
      atLimit: true,
      used: FREE_HABITS,
      max: FREE_HABITS,
    });
  });
  it("does not gate Pro, trial or an unknown plan", () => {
    for (const kind of ["monthly", "yearly", "lifetime", "trial", undefined]) {
      expect(habitGate(kind, 10)).toEqual({
        atLimit: false,
        used: 10,
        max: null,
      });
    }
  });
});

describe("time field", () => {
  it("accepts empty and 24-hour times", () => {
    expect(timeOk("")).toBe(true);
    expect(timeOk(" 8:05 ")).toBe(true);
    expect(timeOk("23:59")).toBe(true);
    expect(timeOk("24:00")).toBe(false);
    expect(timeOk("7pm")).toBe(false);
  });
  it("pads the hour", () => {
    expect(normTime("8:05")).toBe("08:05");
    expect(normTime("18:00")).toBe("18:00");
    expect(normTime("  ")).toBeNull();
  });
});

describe("timeLeft", () => {
  it("counts the hours left today and the days left in the year", () => {
    const t = timeLeft({ year: 2026, dayOfYear: 243, hour: 9, minute: 30 });
    expect(t.hoursLeft).toBe(14);
    expect(t.hours.filter((h) => h === "spent")).toHaveLength(9);
    expect(t.hours[9]).toBe("now");
    expect(t.days).toHaveLength(365);
    expect(t.daysLeft).toBe(121);
  });
  it("on the hour, the current hour is still whole", () => {
    expect(
      timeLeft({ year: 2026, dayOfYear: 0, hour: 0, minute: 0 }).hoursLeft
    ).toBe(24);
  });
  it("knows leap years", () => {
    expect(
      timeLeft({ year: 2028, dayOfYear: 0, hour: 0, minute: 0 }).days
    ).toHaveLength(366);
    expect(
      timeLeft({ year: 2100, dayOfYear: 0, hour: 0, minute: 0 }).days
    ).toHaveLength(365);
  });
});

describe("monthRows (Last four months)", () => {
  const kept = (habitId: string, date: string): Checkin => ({
    habitId,
    date,
    done: true,
  });

  it("is this month and the three before it, the current one last", () => {
    const rows = monthRows("2026-09-01", ["h"], []);
    expect(rows.map((r) => r.key)).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
    expect(rows.map((r) => r.dots.length)).toEqual([30, 31, 31, 30]);
    expect(rows.map((r) => r.current)).toEqual([false, false, false, true]);
  });

  it("counts a leap February and crosses the new year", () => {
    const rows = monthRows("2028-01-15", ["h"], []);
    expect(rows.map((r) => r.key)).toEqual([
      "2027-10",
      "2027-11",
      "2027-12",
      "2028-01",
    ]);
    expect(monthRows("2028-03-10", ["h"], [])[2].dots).toHaveLength(29);
    expect(monthRows("2027-03-10", ["h"], [])[2].dots).toHaveLength(28);
  });

  it("marks days past today as ahead and today as the only control", () => {
    const sep = monthRows("2026-09-10", ["h"], [])[3].dots;
    expect(sep[9]).toMatchObject({ day: 10, today: true, kind: "miss" });
    expect(sep[10].kind).toBe("ahead");
    expect(sep.filter((d) => d.today)).toHaveLength(1);
  });

  it("fills a day when any shown habit was kept, by the share kept", () => {
    const rows = monthRows(
      "2026-09-10",
      ["a", "b"],
      [
        kept("a", "2026-08-05"),
        kept("b", "2026-08-05"),
        kept("a", "2026-09-02"),
      ]
    );
    const aug5 = rows[2].dots[4];
    expect(aug5).toMatchObject({ kind: "on", kept: 2, ratio: 1 });
    expect(rows[3].dots[1]).toMatchObject({ kind: "on", kept: 1, ratio: 0.5 });
    expect(rows[3].dots[2].kind).toBe("miss");
  });

  it("ignores habits that are not shown and checkins that are off", () => {
    const rows = monthRows(
      "2026-09-10",
      ["a"],
      [
        kept("zzz", "2026-09-02"),
        { habitId: "a", date: "2026-09-03", done: false },
      ]
    );
    expect(rows[3].dots[1].kind).toBe("miss");
    expect(rows[3].dots[2].kind).toBe("miss");
    expect(activeDays(rows)).toBe(0);
  });

  it("counts this month's active days", () => {
    const rows = monthRows(
      "2026-09-10",
      ["a"],
      [
        kept("a", "2026-09-01"),
        kept("a", "2026-09-04"),
        kept("a", "2026-08-30"),
      ]
    );
    expect(activeDays(rows)).toBe(2);
  });

  it("never reaches further back than the history route's 124 days", () => {
    for (const today of [
      "2026-12-31",
      "2026-05-31",
      "2028-03-31",
      "2026-08-31",
    ]) {
      const first = monthRows(today, ["a"], [])[0].dots[0].date;
      expect(daysBetween(first, today) + 1).toBeLessThanOrEqual(124);
    }
  });
});
