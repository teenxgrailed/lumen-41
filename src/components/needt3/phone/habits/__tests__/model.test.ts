import { type Checkin, addDays } from "@/lib/needt3/derive";

import { FREE_HABITS } from "../../../habits/derive";
import {
  BLANK_HABIT_FORM,
  HABITS_PAYWALL_FEATURE,
  type HabitForm,
  SINCE_ERROR,
  TIME_ERROR,
  checkHabitForm,
  clockFacts,
  dayLine,
  formFields,
  formFromHabit,
  habitQuota,
  historyDots,
  keptToday,
  phoneHabitRow,
  searchHabits,
  shortDay,
  sinceInstant,
  streakFigure,
  streakLabel,
} from "../model";

const TODAY = "2026-09-01";
const ci = (habitId: string, dates: string[]): Checkin[] =>
  dates.map((date) => ({ habitId, date, done: true }));
const daily = { id: "h", title: "Read", schedule: { perWeek: null } };

describe("phoneHabitRow", () => {
  it("is kept today with the 14-day count, and undoes on tap", () => {
    const r = phoneHabitRow(daily, ci("h", ["2026-08-31", TODAY]), TODAY);
    expect(r.on).toBe(true);
    expect(r.meta).toBe("Kept today · 2 of 14");
    expect(r.say).toBe("Read — kept today, tap to undo");
  });
  it("is not yet today and offers to mark it", () => {
    const r = phoneHabitRow(daily, [], TODAY);
    expect(r.meta).toBe("Not yet today · 0 of 14");
    expect(r.say).toBe("Read — mark kept today");
  });
  it("a perWeek habit whose week is met steps back", () => {
    const h = { ...daily, schedule: { perWeek: 3 } };
    const r = phoneHabitRow(
      h,
      ci("h", ["2026-08-27", "2026-08-29", "2026-08-31"]),
      TODAY
    );
    expect(r.rest).toBe(true);
    expect(r.meta).toBe("Week done · 3/3 this week");
  });
});

describe("keptToday", () => {
  it("counts the habits kept today", () => {
    const list = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(
      keptToday(list, [...ci("a", [TODAY]), ...ci("b", ["2026-08-31"])], TODAY)
    ).toBe(1);
  });
});

describe("historyDots", () => {
  it("is fourteen days, oldest first, today last", () => {
    const dots = historyDots("h", ci("h", ["2026-08-19", TODAY]), TODAY);
    expect(dots).toHaveLength(14);
    expect(dots[0]).toMatchObject({ day: "2026-08-19", kind: "on" });
    expect(dots[13]).toMatchObject({
      day: TODAY,
      kind: "on",
      today: true,
      label: "1 Sep · kept",
    });
    expect(dots[5]).toMatchObject({ kind: "miss", today: false });
    expect(dots.filter((d) => d.today)).toHaveLength(1);
  });
  it("labels a missed day", () => {
    expect(historyDots("h", [], TODAY)[12].label).toBe("31 Aug · missed");
  });
});

describe("streakFigure", () => {
  it("counts days in a row; today still open does not break it", () => {
    expect(
      streakFigure("h", ci("h", ["2026-08-30", "2026-08-31"]), TODAY)
    ).toEqual({ n: 2, text: "2" });
  });
  it("says 14+ when it fills the window we can see", () => {
    const all = Array.from({ length: 14 }, (_, i) => addDays(TODAY, -i));
    expect(streakFigure("h", ci("h", all), TODAY)).toEqual({
      n: 14,
      text: "14+",
    });
  });
  it("labels with the right plural", () => {
    expect(streakLabel(1)).toBe("1 day in a row");
    expect(streakLabel(0)).toBe("0 days in a row");
  });
});

describe("the Free allowance", () => {
  it("is FREE_HABITS, read from the one rule, and shows the count", () => {
    const q = habitQuota("free", 2);
    expect(q.max).toBe(FREE_HABITS);
    expect(q.text).toBe(`2 of ${FREE_HABITS} habits`);
    expect(q.atLimit).toBe(false);
    expect(q.full).toBe(false);
  });
  it("blocks a new habit at the limit and offers the upgrade", () => {
    const q = habitQuota("free", FREE_HABITS);
    expect(q.atLimit).toBe(true);
    expect(q.full).toBe(true);
    expect(q.text).toBe(`${FREE_HABITS} of ${FREE_HABITS} habits`);
  });
  it("names an over-limit list the prototype's way", () => {
    expect(habitQuota("free", FREE_HABITS + 1).text).toBe(
      `${FREE_HABITS + 1} habits · Free includes ${FREE_HABITS}`
    );
  });
  it("gates nothing on Pro, a trial, or while the plan is unknown", () => {
    for (const kind of ["monthly", "yearly", "lifetime", "trial", undefined]) {
      const q = habitQuota(kind, 50);
      expect(q).toMatchObject({ max: null, text: null, atLimit: false });
    }
  });
  it("names the number once, in the paywall line", () => {
    expect(HABITS_PAYWALL_FEATURE).toBe(`more than ${FREE_HABITS} habits`);
  });
});

describe("the habit form", () => {
  it("needs a name and a valid time", () => {
    expect(checkHabitForm(BLANK_HABIT_FORM).ok).toBe(false);
    expect(checkHabitForm({ ...BLANK_HABIT_FORM, title: "Run" }).ok).toBe(true);
    const bad = checkHabitForm({
      ...BLANK_HABIT_FORM,
      title: "Run",
      time: "25:00",
    });
    expect(bad).toEqual({ ok: false, timeOk: false, timeError: TIME_ERROR });
    expect(
      checkHabitForm({ ...BLANK_HABIT_FORM, title: "Run", time: "8:05" }).ok
    ).toBe(true);
  });
  it("writes trimmed, normalised fields", () => {
    expect(
      formFields({
        ...BLANK_HABIT_FORM,
        title: "  Run ",
        time: "8:05",
        perWeek: 3,
        projectId: "p1",
      })
    ).toEqual({
      title: "Run",
      projectId: "p1",
      schedule: { time: "08:05", perWeek: 3 },
    });
    expect(formFields({ ...BLANK_HABIT_FORM, title: "Run" }).schedule).toEqual({
      time: null,
      perWeek: null,
    });
  });
  it("an edit form speaks the database", () => {
    expect(
      formFromHabit(
        {
          id: "h",
          title: "Read",
          projectId: null,
          schedule: { time: "07:30", perWeek: 5 },
        },
        "UTC"
      )
    ).toEqual({
      editId: "h",
      title: "Read",
      time: "07:30",
      perWeek: 5,
      projectId: null,
      kind: "BUILD",
      quitSince: "",
      reason: "",
      timeZone: "UTC",
      initial: null,
    });
  });
});

describe("days and the clock", () => {
  it("formats the person's today", () => {
    expect(dayLine("2026-10-11")).toBe("Sunday, 11 October");
    expect(dayLine("2026-09-01")).toBe("Tuesday, 1 September");
    expect(shortDay("2026-09-01")).toBe("1 Sep");
  });
  it("reads the clock in the person's zone", () => {
    const at = "2026-12-31T23:30:00Z";
    expect(clockFacts(at, "UTC")).toMatchObject({
      year: 2026,
      dayOfYear: 364,
      hour: 23,
      minute: 30,
    });
    // 23:30 UTC is already the next year in Auckland (UTC+13)
    expect(clockFacts(at, "Pacific/Auckland")).toMatchObject({
      year: 2027,
      dayOfYear: 0,
      hour: 12,
    });
  });
});

describe("searchHabits", () => {
  const list = [{ title: "Read" }, { title: "Run" }, { title: "Stretch" }];
  it("matches by name, case-blind, and an empty query finds nothing", () => {
    expect(searchHabits(list, " ru ")).toEqual([{ title: "Run" }]);
    expect(searchHabits(list, "")).toEqual([]);
  });
  it("is capped at five", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ title: `Walk ${i}` }));
    expect(searchHabits(many, "walk")).toHaveLength(5);
  });
});

describe("a Quit habit in the form", () => {
  const quit = (patch: Partial<HabitForm>): HabitForm => ({
    ...BLANK_HABIT_FORM,
    title: "Smoking",
    kind: "QUIT",
    ...patch,
  });
  const now = new Date("2026-11-04T12:00:00Z");

  it("takes a past date and no time", () => {
    expect(
      checkHabitForm(quit({ quitSince: "2026-10-23T09:10" }), now).ok
    ).toBe(true);
    expect(checkHabitForm(quit({ quitSince: "", time: "nope" }), now).ok).toBe(
      true
    );
  });

  it("refuses a date in the future", () => {
    const check = checkHabitForm(quit({ quitSince: "2027-01-01T00:00" }), now);
    expect(check.ok).toBe(false);
    expect(check.timeError).toBe(SINCE_ERROR);
  });

  it("writes kind, the quit date and the reason, and no schedule", () => {
    const fields = formFields(
      quit({ quitSince: "2026-10-23T09:10", reason: "  run the 10k  " })
    );
    expect(fields).toMatchObject({
      title: "Smoking",
      kind: "QUIT",
      reason: "run the 10k",
    });
    expect("quitStartedAt" in fields).toBe(true);
    expect("schedule" in fields).toBe(false);
  });

  it("leaves the date to the server when it is empty", () => {
    expect("quitStartedAt" in formFields(quit({ quitSince: "" }))).toBe(false);
  });
});

describe("Since in the person's zone, not the browser's", () => {
  const zurich = "Europe/Zurich";
  const tokyo = "Asia/Tokyo";

  it("writes the wall time of the setting's zone", () => {
    const fields = formFields({
      ...BLANK_HABIT_FORM,
      title: "Smoking",
      kind: "QUIT",
      quitSince: "2026-11-04T00:30",
      timeZone: tokyo,
    });
    // 00:30 in Tokyo is 15:30 UTC the day before: the run starts on the 4th
    // for the person, wherever the browser is.
    expect(fields).toMatchObject({ quitStartedAt: "2026-11-03T15:30:00.000Z" });
  });

  it("reads a stored start back in that zone, across a clock change", () => {
    const form = formFromHabit(
      {
        id: "q",
        title: "Smoking",
        projectId: null,
        schedule: { time: null, perWeek: null },
        kind: "QUIT",
        quitStartedAt: "2026-10-24T22:30:00.000Z",
        reason: null,
      },
      zurich
    );
    // Summer time: UTC+2, so 00:30 on the 25th, the night the clocks go back.
    expect(form.quitSince).toBe("2026-10-25T00:30");
    expect(sinceInstant(form.quitSince, zurich)?.toISOString()).toBe(
      "2026-10-24T22:30:00.000Z"
    );
    // Unchanged on save: not sent at all.
    expect("quitStartedAt" in formFields(form)).toBe(false);
  });

  it("judges the future by the setting's zone", () => {
    const now = new Date("2026-11-04T12:00:00Z");
    // 20:00 in Tokyo is 11:00 UTC: already past.
    expect(
      checkHabitForm(
        {
          ...BLANK_HABIT_FORM,
          title: "Smoking",
          kind: "QUIT",
          quitSince: "2026-11-04T20:00",
          timeZone: tokyo,
        },
        now
      ).ok
    ).toBe(true);
    // 20:00 in Zurich is 19:00 UTC: still ahead.
    expect(
      checkHabitForm(
        {
          ...BLANK_HABIT_FORM,
          title: "Smoking",
          kind: "QUIT",
          quitSince: "2026-11-04T20:00",
          timeZone: zurich,
        },
        now
      ).timeError
    ).toBe(SINCE_ERROR);
  });

  it("refuses what is not a time", () => {
    expect(sinceInstant("yesterday", zurich)).toBeNull();
  });
});

describe("saving an edited Quit habit", () => {
  const kept = formFromHabit(
    {
      id: "q",
      title: "Smoking",
      projectId: null,
      schedule: { time: null, perWeek: null },
      kind: "QUIT",
      quitStartedAt: "2026-10-23T09:10:00.000Z",
      reason: "Run the 10k",
    },
    "UTC"
  );

  it("sends only the name and project when nothing Quit changed", () => {
    expect(formFields({ ...kept, title: "Cigarettes" })).toEqual({
      title: "Cigarettes",
      projectId: null,
    });
  });

  it("sends the date or the reason only when they changed, never kind", () => {
    const fields = formFields({
      ...kept,
      quitSince: "2026-10-22T09:10",
      reason: "Run the 10k in spring",
    });
    expect(fields).toEqual({
      title: "Smoking",
      projectId: null,
      quitStartedAt: "2026-10-22T09:10:00.000Z",
      reason: "Run the 10k in spring",
    });
    expect("kind" in fields).toBe(false);
  });
});
