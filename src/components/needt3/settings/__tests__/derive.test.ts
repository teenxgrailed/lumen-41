import { newDate } from "@/lib/date-utils";

import {
  FREE_ACCENT,
  HOUR_OPTIONS,
  NAV_FLAT,
  SECTION_TITLES,
  SETTINGS_NAV,
  accentLocked,
  fmtHour,
  hourOf,
  hourOptions,
  isPro,
  parseWorkDays,
  planInfo,
  planningSummary,
  plansWeekends,
  renewsText,
  sectionFromHash,
  sectionOf,
  settingsNotices,
  settingsRedirectTarget,
  themeLocked,
  timeNow,
  trialBarPct,
  withWeekends,
  workHourChoices,
  workHoursValid,
} from "../derive";
import {
  PREF_DEFAULTS,
  accentFromPrefs,
  importRunSummary,
  readPref,
} from "../derive";

describe("deep links", () => {
  it("opens the section a hash names, with or without #", () => {
    expect(sectionFromHash("#plan")).toBe("plan");
    expect(sectionFromHash("appearance")).toBe("appearance");
    expect(sectionFromHash("#ALERTS")).toBe("alerts");
  });
  it("maps the old anchors", () => {
    expect(sectionFromHash("#billing")).toBe("plan");
    expect(sectionFromHash("#notifications")).toBe("alerts");
    expect(sectionFromHash("#schedule")).toBe("day");
  });
  it("is null for nothing or nonsense, and the sheet falls back to Account", () => {
    expect(sectionFromHash("")).toBeNull();
    expect(sectionFromHash(null)).toBeNull();
    expect(sectionFromHash("#nope")).toBeNull();
    expect(sectionOf("#nope")).toBe("account");
    expect(sectionOf(null)).toBe("account");
    expect(sectionOf("plan")).toBe("plan");
  });
  it("every nav row is a titled section or a jump", () => {
    for (const g of SETTINGS_NAV)
      for (const i of g.items)
        expect(
          i.jump ?? SECTION_TITLES[i.id as keyof typeof SECTION_TITLES]
        ).toBeTruthy();
    expect(NAV_FLAT).not.toContain("connections");
    expect(NAV_FLAT).toHaveLength(Object.keys(SECTION_TITLES).length);
  });
});

describe("what Free locks", () => {
  it("trial and every paid plan are Pro", () => {
    expect(isPro("free")).toBe(false);
    expect(isPro(undefined)).toBe(false);
    for (const k of ["trial", "monthly", "yearly", "lifetime"])
      expect(isPro(k)).toBe(true);
  });
  it("Free keeps Blue only", () => {
    expect(accentLocked(FREE_ACCENT, "free")).toBe(false);
    expect(accentLocked("pink", "free")).toBe(true);
    expect(accentLocked("aurora", "free")).toBe(true);
    expect(accentLocked("pink", "trial")).toBe(false);
  });
  it("Time is the one locked theme", () => {
    expect(themeLocked("time", "free")).toBe(true);
    expect(themeLocked("time", "yearly")).toBe(false);
    expect(themeLocked("dark", "free")).toBe(false);
    expect(themeLocked("system", "free")).toBe(false);
  });
  it("names the plan", () => {
    expect(planInfo("free")).toEqual({ name: "Free", badge: "Free" });
    expect(planInfo("lifetime").badge).toBe("Lifetime");
    expect(planInfo("trial").name).toBe("Pro trial");
  });
  it("the trial bar", () => {
    expect(trialBarPct(9, 14)).toBe(64);
    expect(trialBarPct(14, 14)).toBe(100);
    expect(trialBarPct(0, 14)).toBe(0);
    expect(trialBarPct(null, 14)).toBe(0);
    expect(trialBarPct(20, 14)).toBe(100);
  });
});

describe("Your day", () => {
  it("reads whole hours only", () => {
    expect(hourOf("09:00")).toBe(9);
    expect(hourOf("8:00")).toBe(8);
    expect(hourOf("08:30")).toBeNull();
    expect(hourOf("25:00")).toBeNull();
  });
  it("offers whole hours and keeps the stored one", () => {
    expect(hourOptions(9).map(([v]) => v)).not.toContain("08:30");
    expect(hourOptions(6).map(([v]) => v)).toContain("06:00");
    expect(hourOptions(null).length).toBe(
      HOUR_OPTIONS.filter(([v]) => hourOf(v) !== null).length
    );
  });
  it("weekends", () => {
    expect(parseWorkDays("[1,2,3,4,5]")).toEqual([1, 2, 3, 4, 5]);
    expect(parseWorkDays("garbage")).toEqual([]);
    expect(parseWorkDays('[1,9,"x"]')).toEqual([1]);
    expect(plansWeekends([1, 2, 6])).toBe(true);
    expect(plansWeekends([1, 2, 3])).toBe(false);
    expect(withWeekends([1, 2, 3, 4, 5], true)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(withWeekends([0, 1, 2, 6], false)).toEqual([1, 2]);
  });
  it("summary", () => {
    expect(planningSummary({ weekends: false, bufferMinutes: 15 })).toBe(
      "Weekdays only · 15-min gap"
    );
  });
});

describe("prefs", () => {
  it("reads a saved value of the right type", () => {
    expect(readPref({ len: "90" }, "len")).toBe("90");
    expect(readPref({ parts: false }, "parts")).toBe(false);
  });
  it("falls back for missing or wrong-typed values", () => {
    expect(readPref({}, "len")).toBe(PREF_DEFAULTS.len);
    expect(readPref(null, "offline")).toBe(true);
    expect(readPref({ len: 90 }, "len")).toBe("50");
    expect(readPref({ parts: "yes" }, "parts")).toBe(true);
  });
  it("accent", () => {
    expect(accentFromPrefs({ accent: "pink" })).toBe("pink");
    expect(accentFromPrefs({ accent: 3 })).toBeUndefined();
    expect(accentFromPrefs(undefined)).toBeUndefined();
  });
});

describe("/settings redirect with design_v3", () => {
  it("sends anchors that moved out of Settings to Connections", () => {
    expect(settingsRedirectTarget("#calendars")).toEqual({
      kind: "screen",
      href: "/connections",
    });
    expect(settingsRedirectTarget("#integrations")).toEqual({
      kind: "screen",
      href: "/connections",
    });
    expect(settingsRedirectTarget("#ai")).toEqual({
      kind: "screen",
      href: "/connections#ai",
    });
  });
  it("opens the sheet for everything else", () => {
    expect(settingsRedirectTarget("#billing")).toEqual({
      kind: "sheet",
      section: "plan",
    });
    expect(settingsRedirectTarget("")).toEqual({
      kind: "sheet",
      section: null,
    });
  });
  it("turns the query a redirect brought back into notices", () => {
    expect(
      settingsNotices("?calendarSuccess=connected&provider=google")
    ).toEqual([
      expect.objectContaining({
        tone: "success",
        title: "Google Calendar connected",
      }),
    ]);
    expect(
      settingsNotices("?calendarError=consent_denied&provider=outlook")[0]
    ).toMatchObject({
      tone: "error",
      title: "Outlook Calendar wasn’t connected",
    });
    expect(settingsNotices("?billing=success")[0]).toMatchObject({
      tone: "success",
      title: "Checkout complete",
    });
    expect(settingsNotices("?emailVerification=verified")).toEqual([
      { tone: "success", title: "Email confirmed" },
    ]);
    expect(settingsNotices("")).toEqual([]);
  });
});

describe("working hours", () => {
  it("the day starts before it ends", () => {
    expect(workHoursValid(9, 17)).toBe(true);
    expect(workHoursValid(17, 17)).toBe(false);
    expect(workHoursValid(18, 9)).toBe(false);
  });
  it("offers only start hours before the end, and end hours after the start", () => {
    const starts = workHourChoices("start", 9, 10).map(([v]) => v);
    expect(starts).toEqual(["07:00", "08:00", "09:00"]);
    const ends = workHourChoices("end", 17, 18).map(([v]) => v);
    expect(ends).toEqual(["17:00", "19:00", "20:00"]);
  });
});

describe("import notices and summary", () => {
  it("says what the Todoist callback came back with", () => {
    expect(settingsNotices("?import=todoist-started")[0]).toMatchObject({
      tone: "success",
      title: "Todoist import started",
    });
    expect(settingsNotices("?import=todoist-failed")[0].tone).toBe("error");
    expect(settingsNotices("?import=unknown")).toEqual([]);
  });

  it("summarises a run in one line", () => {
    const counts = { total: 20, done: 12, skipped: 3, failed: 1 };
    expect(importRunSummary({ status: "running", counts, warnings: [] })).toBe(
      "Importing: 16 of 20."
    );
    expect(importRunSummary({ status: "done", counts, warnings: [] })).toBe(
      "Last import: 12 imported, 3 skipped, 1 failed."
    );
    expect(
      importRunSummary({
        status: "failed",
        counts,
        warnings: [
          { code: "plan_limit", message: "limit" },
          { code: "todoist_rate_limited", message: "Try again later." },
        ],
      })
    ).toBe("Last import failed. Try again later.");
  });
});

describe("the Time card's reading (Drift.jsx `line`)", () => {
  const place = {
    tz: "Europe/Zurich",
    name: "Zürich",
    lat: 47,
    lon: 8,
    exact: true,
  };
  const times = {
    noon: 13,
    sunrise: 7.5,
    sunset: 19.7,
    dawn: 7,
    dusk: 20.2,
    polar: null,
  } as const;

  it("formats local hours as HH:MM", () => {
    expect(fmtHour(7.5)).toBe("07:30");
    expect(fmtHour(19.7)).toBe("19:42");
    expect(fmtHour(null)).toBe("—");
  });

  it("by day it names the sunset, with the sun glyph", () => {
    expect(timeNow({ phase: "Day", times, place })).toEqual({
      line: "Now: Day · sunset 19:42 · Zürich",
      icon: "sun",
    });
  });

  it("at night and dawn it names the sunrise", () => {
    expect(timeNow({ phase: "Night", times, place })).toEqual({
      line: "Now: Night · sunrise 07:30 · Zürich",
      icon: "sunset",
    });
    expect(timeNow({ phase: "Dawn", times, place }).icon).toBe("sunrise");
  });

  it("says so when the sun does not rise or set", () => {
    const polar = {
      ...times,
      sunrise: null,
      sunset: null,
      polar: "set",
    } as const;
    expect(timeNow({ phase: "Day", times: polar, place }).line).toContain(
      "no sunset today"
    );
    expect(timeNow({ phase: "Night", times: polar, place }).line).toContain(
      "no sunrise today"
    );
  });
});

describe("renewsText", () => {
  const now = newDate("2026-10-12T12:00:00Z");
  it("is empty without a date", () => {
    expect(renewsText(null, now)).toBe("");
    expect(renewsText("not a date", now)).toBe("");
  });
  it("drops the year when the renewal is within the next 11 months", () => {
    expect(renewsText("2026-11-07T12:00:00Z", now)).toBe("renews 7 Nov");
  });
  it("keeps the year further out", () => {
    expect(renewsText("2027-10-07T12:00:00Z", now)).toBe("renews 7 Oct 2027");
  });
  it("says it ends, not renews, when it is set to cancel", () => {
    expect(renewsText("2026-11-07T12:00:00Z", now, true)).toBe("ends 7 Nov");
    expect(renewsText("2027-10-07T12:00:00Z", now, true)).toBe(
      "ends 7 Oct 2027"
    );
    expect(renewsText("2026-11-07T12:00:00Z", now, false)).toBe("renews 7 Nov");
  });
});
