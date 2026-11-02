import { CAP_DAYS, decide } from "../decide";
import { GIFT_RULE, RULES } from "../rules";
import { TUESDAY_10_UTC, daysAfter, daysBefore, makePerson } from "./helpers";

const NOW = TUESDAY_10_UTC;
const day2 = RULES["onboard-day2"];

function run(
  person = makePerson(),
  rule = day2,
  now = NOW,
  extra: {
    footerResolved?: boolean;
    existing?: Parameters<typeof decide>[0]["existing"];
  } = {}
) {
  return decide({
    rule,
    person,
    now,
    footerResolved: extra.footerResolved ?? true,
    existing: extra.existing,
  });
}

describe("decide: sending and waiting", () => {
  it("sends a due onboarding step on a weekday morning", () => {
    expect(run()).toEqual({ kind: "send" });
  });

  it("waits when the step is not due yet", () => {
    const person = makePerson({ verifiedAt: daysBefore(NOW, 1) });
    expect(run(person)).toEqual({ kind: "wait" });
  });

  it("waits for a person who never verified (no due date)", () => {
    expect(run(makePerson({ verifiedAt: null }))).toEqual({ kind: "wait" });
  });

  it("drops a step that is too old to make sense", () => {
    const person = makePerson({ verifiedAt: daysBefore(NOW, 20) });
    expect(run(person)).toEqual({
      kind: "skip",
      reason: "stale",
      record: true,
    });
  });
});

describe("decide: skip if the step is done", () => {
  it("skips the calendar step once a calendar is connected", () => {
    const person = makePerson({
      facts: {
        connectedCalendar: true,
        taskCount: 0,
        scheduledTaskCount: 0,
        lastMonthActivity: 0,
      },
    });
    expect(run(person)).toEqual({
      kind: "skip",
      reason: "step-done",
      record: true,
    });
  });

  it("skips the calendar step once the person has a task", () => {
    const person = makePerson({
      facts: {
        connectedCalendar: false,
        taskCount: 2,
        scheduledTaskCount: 0,
        lastMonthActivity: 0,
      },
    });
    expect(run(person).kind).toBe("skip");
  });

  it("skips the planning step once a task is scheduled", () => {
    const person = makePerson({
      verifiedAt: daysBefore(NOW, 6),
      facts: {
        connectedCalendar: false,
        taskCount: 3,
        scheduledTaskCount: 1,
        lastMonthActivity: 0,
      },
    });
    expect(run(person, RULES["onboard-day5"])).toEqual({
      kind: "skip",
      reason: "step-done",
      record: true,
    });
  });

  it("skips the habit step for a paying person", () => {
    const person = makePerson({ verifiedAt: daysBefore(NOW, 10), paid: true });
    expect(run(person, RULES["onboard-day9"])).toEqual({
      kind: "skip",
      reason: "paid-already",
      record: true,
    });
  });
});

describe("decide: who is never mailed", () => {
  it("leaves no row while the flag is off", () => {
    expect(run(makePerson({ flagOn: false }))).toEqual({
      kind: "skip",
      reason: "flag-off",
      record: false,
    });
  });

  it("leaves no row while the operator footer is unset", () => {
    expect(run(makePerson(), day2, NOW, { footerResolved: false })).toEqual({
      kind: "skip",
      reason: "no-operator",
      record: false,
    });
  });

  it.each([
    ["sandbox", { sandbox: true }],
    ["no-email", { email: null }],
    ["deleting", { deleting: true }],
    ["suppressed", { suppressed: true }],
  ])("skips %s accounts", (reason, patch) => {
    expect(run(makePerson(patch))).toEqual({
      kind: "skip",
      reason,
      record: true,
    });
  });

  it("skips an unverified address", () => {
    const winback = RULES["winback-14d"];
    const person = makePerson({
      verifiedAt: null,
      lastActiveAt: daysBefore(NOW, 15),
    });
    expect(run(person, winback)).toEqual({
      kind: "skip",
      reason: "unverified",
      record: true,
    });
  });

  it("skips when the category is switched off", () => {
    const base = makePerson();
    const person = makePerson({
      preferences: {
        ...base.preferences,
        categories: { ...base.preferences.categories, tips: false },
      },
    });
    expect(run(person)).toEqual({
      kind: "skip",
      reason: "category-off",
      record: true,
    });
  });

  it("skips everything optional while email is paused", () => {
    const base = makePerson();
    const person = makePerson({
      preferences: { ...base.preferences, paused: true },
    });
    expect(run(person).kind).toBe("skip");
  });

  it("a trial-ending mail follows the offers category, not tips", () => {
    const base = makePerson();
    const person = makePerson({
      trial: {
        startedAt: daysBefore(NOW, 11),
        endsAt: daysAfter(NOW, 3),
        legacyThreeDaySentAt: null,
      },
      preferences: {
        ...base.preferences,
        categories: { ...base.preferences.categories, offers: false },
      },
    });
    expect(run(person, RULES["trial-ending-3d"])).toEqual({
      kind: "skip",
      reason: "category-off",
      record: true,
    });
  });
});

describe("decide: one mail per three days", () => {
  it("defers a second mail to three days after the last", () => {
    const last = daysBefore(NOW, 1);
    const result = run(makePerson({ lastMarketingSentAt: last }));
    expect(result).toEqual({
      kind: "defer",
      until: daysAfter(last, CAP_DAYS.normal),
      reason: "cap",
    });
  });

  it("sends once the cap has passed", () => {
    const person = makePerson({ lastMarketingSentAt: daysBefore(NOW, 4) });
    expect(run(person)).toEqual({ kind: "send" });
  });

  it("stretches the gap to seven days for Fewer emails", () => {
    const base = makePerson();
    const last = daysBefore(NOW, 1);
    const person = makePerson({
      lastMarketingSentAt: last,
      preferences: { ...base.preferences, fewer: true },
    });
    expect(run(person)).toEqual({
      kind: "defer",
      until: daysAfter(last, CAP_DAYS.fewer),
      reason: "cap",
    });
  });

  it("does not hold back the gift notice and ignores the cap", () => {
    const gift = {
      id: "g1",
      startsAt: daysBefore(NOW, 0),
      endsAt: daysAfter(NOW, 30),
      revoked: false,
    };
    const person = makePerson({ lastMarketingSentAt: daysBefore(NOW, 0) });
    expect(
      decide({
        rule: GIFT_RULE,
        person,
        now: NOW,
        ctx: { gift },
        footerResolved: false,
      })
    ).toEqual({ kind: "send" });
  });

  it("sends a gift notice even when every optional category is off", () => {
    const person = makePerson({
      flagOn: false,
      preferences: {
        categories: {
          tips: false,
          offers: false,
          updates: false,
          recap: false,
        },
        fewer: true,
        paused: true,
      },
    });
    const gift = {
      id: "g1",
      startsAt: NOW,
      endsAt: daysAfter(NOW, 30),
      revoked: false,
    };
    expect(
      decide({
        rule: GIFT_RULE,
        person,
        now: NOW,
        ctx: { gift },
        footerResolved: false,
      }).kind
    ).toBe("send");
  });

  it("skips a gift that was revoked", () => {
    const gift = {
      id: "g1",
      startsAt: NOW,
      endsAt: daysAfter(NOW, 30),
      revoked: true,
    };
    expect(
      decide({
        rule: GIFT_RULE,
        person: makePerson(),
        now: NOW,
        ctx: { gift },
        footerResolved: true,
      })
    ).toEqual({ kind: "skip", reason: "revoked", record: true });
  });
});

describe("decide: quiet hours in the person's own zone", () => {
  it("defers a 05:00 UTC run to 09:00 the same day", () => {
    const early = new Date("2026-11-03T05:00:00.000Z");
    expect(run(makePerson(), day2, early)).toEqual({
      kind: "defer",
      until: new Date("2026-11-03T09:00:00.000Z"),
      reason: "window",
    });
  });

  it("defers after 19:00", () => {
    const late = new Date("2026-11-03T19:30:00.000Z");
    expect(run(makePerson(), day2, late)).toEqual({
      kind: "defer",
      until: new Date("2026-11-04T09:00:00.000Z"),
      reason: "window",
    });
  });

  it("holds an optional mail over the weekend", () => {
    const saturday = new Date("2026-11-07T10:00:00.000Z");
    const person = makePerson({
      verifiedAt: new Date("2026-11-05T10:00:00.000Z"),
    });
    expect(run(person, day2, saturday)).toEqual({
      kind: "defer",
      until: new Date("2026-11-09T09:00:00.000Z"),
      reason: "window",
    });
  });

  it("lets the trial-ending mail go out on a Saturday", () => {
    const saturday = new Date("2026-11-07T10:00:00.000Z");
    const person = makePerson({
      trial: {
        startedAt: new Date("2026-10-27T10:00:00.000Z"),
        endsAt: new Date("2026-11-10T10:00:00.000Z"),
        legacyThreeDaySentAt: null,
      },
    });
    expect(run(person, RULES["trial-ending-3d"], saturday)).toEqual({
      kind: "send",
    });
  });

  it("respects the person's own quiet hours", () => {
    const person = makePerson({
      quiet: { startMinute: 9 * 60, endMinute: 12 * 60 },
    });
    expect(run(person)).toEqual({
      kind: "defer",
      until: new Date("2026-11-03T12:00:00.000Z"),
      reason: "window",
    });
  });

  it("uses New York morning, not UTC morning", () => {
    const person = makePerson({ timeZone: "America/New_York" });
    // 14:00 UTC is 09:00 in New York on 3 November (standard time).
    expect(run(person, day2, new Date("2026-11-03T14:00:00.000Z"))).toEqual({
      kind: "send",
    });
    expect(run(person, day2, new Date("2026-11-03T13:45:00.000Z"))).toEqual({
      kind: "defer",
      until: new Date("2026-11-03T14:00:00.000Z"),
      reason: "window",
    });
  });

  it("treats an unknown time zone as UTC and does not throw", () => {
    const person = makePerson({ timeZone: "Not/AZone" });
    expect(run(person)).toEqual({ kind: "send" });
  });

  it("gives up when quiet hours leave no window at all", () => {
    const person = makePerson({
      quiet: { startMinute: 0, endMinute: 23 * 60 + 59 },
    });
    const early = new Date("2026-11-03T05:00:00.000Z");
    expect(run(person, day2, early)).toEqual({
      kind: "skip",
      reason: "no-window",
      record: true,
    });
  });
});

describe("decide: the ledger", () => {
  it.each(["sent", "skipped", "cancelled", "claimed"])(
    "does nothing again after a %s row",
    (status) => {
      expect(
        run(makePerson(), day2, NOW, { existing: { status, deferUntil: null } })
      ).toEqual({ kind: "skip", reason: "already", record: false });
    }
  );

  it("waits while a deferral is still in the future", () => {
    expect(
      run(makePerson(), day2, NOW, {
        existing: { status: "deferred", deferUntil: daysAfter(NOW, 1) },
      })
    ).toEqual({ kind: "wait" });
  });

  it("decides again once a deferral has passed", () => {
    expect(
      run(makePerson(), day2, NOW, {
        existing: { status: "deferred", deferUntil: daysBefore(NOW, 1) },
      })
    ).toEqual({ kind: "send" });
  });
});

describe("decide: the other rules", () => {
  it("does not send win-back while a trial is about to end", () => {
    const person = makePerson({
      lastActiveAt: daysBefore(NOW, 15),
      trial: {
        startedAt: daysBefore(NOW, 12),
        endsAt: daysAfter(NOW, 2),
        legacyThreeDaySentAt: null,
      },
    });
    expect(run(person, RULES["winback-14d"])).toEqual({
      kind: "skip",
      reason: "ending-soon",
      record: true,
    });
  });

  it("sends win-back after 14 quiet days, and not to a paying person", () => {
    const quiet = makePerson({ lastActiveAt: daysBefore(NOW, 15) });
    expect(run(quiet, RULES["winback-14d"])).toEqual({ kind: "send" });
    expect(run({ ...quiet, paid: true }, RULES["winback-14d"]).kind).toBe(
      "skip"
    );
  });

  it("does not send the 3-day trial mail the old sender already sent", () => {
    const person = makePerson({
      trial: {
        startedAt: daysBefore(NOW, 11),
        endsAt: daysAfter(NOW, 3),
        legacyThreeDaySentAt: daysBefore(NOW, 0),
      },
    });
    expect(run(person, RULES["trial-ending-3d"])).toEqual({
      kind: "skip",
      reason: "legacy-sent",
      record: true,
    });
  });

  it("asks 'still want these?' after 90 days away", () => {
    const person = makePerson({ lastActiveAt: daysBefore(NOW, 95) });
    expect(run(person, RULES["still-want"])).toEqual({ kind: "send" });
    expect(RULES["still-want"].dedupeKey(person, {}, NOW)).toMatch(/:q1$/);
  });

  it("asks 'still want these?' while any optional category is on, even with offers off", () => {
    const categories = (offers: boolean, tips: boolean) => ({
      ...makePerson().preferences,
      categories: {
        ...makePerson().preferences.categories,
        offers,
        tips,
        updates: false,
        recap: false,
      },
    });
    const away = { lastActiveAt: daysBefore(NOW, 95) };
    expect(
      run(
        makePerson({ ...away, preferences: categories(false, true) }),
        RULES["still-want"]
      )
    ).toEqual({ kind: "send" });
    expect(
      run(
        makePerson({ ...away, preferences: categories(false, false) }),
        RULES["still-want"]
      )
    ).toEqual({ kind: "skip", reason: "category-off", record: true });
  });

  it("sends the recap only with real activity", () => {
    const base = makePerson();
    const withRecap = (activity: number) =>
      makePerson({
        preferences: {
          ...base.preferences,
          categories: { ...base.preferences.categories, recap: true },
        },
        facts: { ...base.facts, lastMonthActivity: activity },
      });
    expect(run(withRecap(2), RULES["recap-monthly"])).toEqual({
      kind: "skip",
      reason: "thin-data",
      record: true,
    });
    expect(run(withRecap(3), RULES["recap-monthly"])).toEqual({ kind: "send" });
  });

  it("keeps the recap off unless the person turned it on", () => {
    const person = makePerson({
      facts: { ...makePerson().facts, lastMonthActivity: 10 },
    });
    expect(run(person, RULES["recap-monthly"])).toEqual({
      kind: "skip",
      reason: "category-off",
      record: true,
    });
  });
});
