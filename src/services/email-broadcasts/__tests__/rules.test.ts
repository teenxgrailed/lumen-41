import {
  TUESDAY_10_UTC,
  daysAfter,
  daysBefore,
  makePerson,
} from "@/services/email-lifecycle/__tests__/helpers";

import {
  BROADCAST_CAP_DAYS,
  DEFER_LIMIT_DAYS,
  MAX_LEAD_DAYS,
  MIN_LEAD_MINUTES,
  broadcastInputSchema,
  checkSchedule,
  decideBroadcastSend,
  exclusionReason,
  inSegment,
  isStudentEmail,
  validateButton,
} from "../rules";

const NOW = TUESDAY_10_UTC;
const minutes = (date: Date, count: number) =>
  new Date(date.getTime() + count * 60_000);

describe("isStudentEmail", () => {
  it.each([
    ["ana@mit.edu", true],
    ["ana@cs.stanford.edu", true],
    ["tom@ox.ac.uk", true],
    ["kei@u-tokyo.ac.jp", true],
    ["ana@gmail.com", false],
    ["ana@education.com", false],
    ["ana@campus.edu.example.com", false],
    ["not-an-address", false],
    [null, false],
  ])("%s -> %s", (email, expected) => {
    expect(isStudentEmail(email)).toBe(expected);
  });
});

describe("inSegment", () => {
  it("free excludes trials, paid and gifts", () => {
    expect(inSegment("free", makePerson(), NOW)).toBe(true);
    expect(inSegment("free", makePerson({ paid: true }), NOW)).toBe(false);
    expect(
      inSegment(
        "free",
        makePerson({ gift: { endsAt: daysAfter(NOW, 5) } }),
        NOW
      )
    ).toBe(false);
    expect(
      inSegment(
        "free",
        makePerson({
          trial: {
            startedAt: daysBefore(NOW, 2),
            endsAt: daysAfter(NOW, 5),
            legacyThreeDaySentAt: null,
          },
        }),
        NOW
      )
    ).toBe(false);
  });

  it("trial means a running trial of someone who has not paid", () => {
    const trial = {
      startedAt: daysBefore(NOW, 2),
      endsAt: daysAfter(NOW, 5),
      legacyThreeDaySentAt: null,
    };
    expect(inSegment("trial", makePerson({ trial }), NOW)).toBe(true);
    expect(inSegment("trial", makePerson({ trial, paid: true }), NOW)).toBe(
      false
    );
    expect(
      inSegment(
        "trial",
        makePerson({ trial: { ...trial, endsAt: daysBefore(NOW, 1) } }),
        NOW
      )
    ).toBe(false);
  });

  it("pro means paid or gifted", () => {
    expect(inSegment("pro", makePerson({ paid: true }), NOW)).toBe(true);
    expect(
      inSegment("pro", makePerson({ gift: { endsAt: daysAfter(NOW, 5) } }), NOW)
    ).toBe(true);
    expect(inSegment("pro", makePerson(), NOW)).toBe(false);
  });

  it("students are found by address at send time", () => {
    expect(
      inSegment("students", makePerson({ email: "ana@mit.edu" }), NOW)
    ).toBe(true);
    expect(inSegment("students", makePerson(), NOW)).toBe(false);
  });

  it("all includes everyone", () => {
    expect(inSegment("all", makePerson(), NOW)).toBe(true);
  });
});

describe("exclusionReason", () => {
  it("lets an ordinary person through", () => {
    expect(exclusionReason(makePerson(), "updates")).toBeNull();
  });

  it.each([
    ["flag-off", { flagOn: false }],
    ["sandbox", { sandbox: true }],
    ["no-email", { email: null }],
    ["unverified", { verifiedAt: null }],
    ["deleting", { deleting: true }],
    ["suppressed", { suppressed: true }],
  ])("excludes %s", (reason, patch) => {
    expect(exclusionReason(makePerson(patch), "updates")).toBe(reason);
  });

  it("honours the category and the pause", () => {
    const base = makePerson();
    expect(
      exclusionReason(
        makePerson({
          preferences: {
            ...base.preferences,
            categories: { ...base.preferences.categories, updates: false },
          },
        }),
        "updates"
      )
    ).toBe("category-off");
    expect(
      exclusionReason(
        makePerson({ preferences: { ...base.preferences, paused: true } }),
        "offers"
      )
    ).toBe("email-paused");
  });
});

describe("validateButton", () => {
  it("accepts no button and a complete https button", () => {
    expect(validateButton({})).toBeNull();
    expect(
      validateButton({ buttonLabel: "Open", buttonUrl: "https://needt.app/x" })
    ).toBeNull();
  });

  it("rejects half a button, http and nonsense", () => {
    expect(validateButton({ buttonLabel: "Open" })).toMatch(/both/);
    expect(validateButton({ buttonUrl: "https://needt.app" })).toMatch(/both/);
    expect(
      validateButton({ buttonLabel: "Open", buttonUrl: "http://needt.app" })
    ).toMatch(/https/);
    expect(
      validateButton({ buttonLabel: "Open", buttonUrl: "javascript:alert(1)" })
    ).toMatch(/https/);
    expect(validateButton({ buttonLabel: "Open", buttonUrl: "nope" })).toMatch(
      /valid/
    );
  });
});

describe("broadcastInputSchema", () => {
  const ok = {
    subject: "A small update",
    paragraphs: ["One short paragraph."],
    segment: "free",
  };

  it("defaults the category to updates and the preheader to empty", () => {
    const parsed = broadcastInputSchema.parse(ok);
    expect(parsed.category).toBe("updates");
    expect(parsed.preheader).toBe("");
  });

  it("rejects an empty subject, no paragraphs and an unknown segment", () => {
    expect(
      broadcastInputSchema.safeParse({ ...ok, subject: " " }).success
    ).toBe(false);
    expect(
      broadcastInputSchema.safeParse({ ...ok, paragraphs: [] }).success
    ).toBe(false);
    expect(
      broadcastInputSchema.safeParse({ ...ok, segment: "everyone" }).success
    ).toBe(false);
    expect(
      broadcastInputSchema.safeParse({ ...ok, category: "tips" }).success
    ).toBe(false);
  });
});

describe("checkSchedule", () => {
  const base = {
    at: minutes(NOW, 60),
    now: NOW,
    testedAt: minutes(NOW, -10),
    contentUpdatedAt: minutes(NOW, -30),
    footerResolved: true,
    segment: "free" as const,
    recipientCount: 40,
  };

  it("passes a tested broadcast an hour ahead", () => {
    expect(checkSchedule(base)).toEqual({ ok: true });
  });

  it("needs the operator footer", () => {
    const result = checkSchedule({ ...base, footerResolved: false });
    expect(result.ok).toBe(false);
  });

  it("needs a test", () => {
    expect(checkSchedule({ ...base, testedAt: null }).ok).toBe(false);
  });

  it("needs the test to be after the last edit", () => {
    expect(
      checkSchedule({ ...base, contentUpdatedAt: minutes(NOW, -5) }).ok
    ).toBe(false);
  });

  it("keeps a cancel window of at least 15 minutes", () => {
    expect(
      checkSchedule({ ...base, at: minutes(NOW, MIN_LEAD_MINUTES - 1) }).ok
    ).toBe(false);
    expect(
      checkSchedule({ ...base, at: minutes(NOW, MIN_LEAD_MINUTES) }).ok
    ).toBe(true);
  });

  it("refuses a date past 30 days", () => {
    expect(
      checkSchedule({ ...base, at: daysAfter(NOW, MAX_LEAD_DAYS + 1) }).ok
    ).toBe(false);
    expect(
      checkSchedule({ ...base, at: daysAfter(NOW, MAX_LEAD_DAYS) }).ok
    ).toBe(true);
  });

  it("refuses an empty audience", () => {
    expect(checkSchedule({ ...base, recipientCount: 0 }).ok).toBe(false);
  });

  it("makes the owner type the count to send to everyone", () => {
    const all = { ...base, segment: "all" as const, recipientCount: 120 };
    expect(checkSchedule(all).ok).toBe(false);
    expect(checkSchedule({ ...all, confirmCount: 119 }).ok).toBe(false);
    expect(checkSchedule({ ...all, confirmCount: 120 }).ok).toBe(true);
  });
});

describe("decideBroadcastSend", () => {
  const input = {
    person: makePerson(),
    category: "updates" as const,
    segment: "free" as const,
    now: NOW,
    startedAt: NOW,
    lastBroadcastAt: null as Date | null,
  };

  it("sends to an ordinary person on a weekday morning", () => {
    expect(decideBroadcastSend(input)).toEqual({ kind: "send" });
  });

  it("drops someone who left the segment since it was scheduled", () => {
    expect(
      decideBroadcastSend({ ...input, person: makePerson({ paid: true }) })
    ).toEqual({ kind: "skip", reason: "left-segment" });
  });

  it("drops someone who opted out since", () => {
    expect(
      decideBroadcastSend({
        ...input,
        person: makePerson({ suppressed: true }),
      })
    ).toEqual({ kind: "skip", reason: "suppressed" });
  });

  it("allows one broadcast per recipient per 7 days", () => {
    expect(
      decideBroadcastSend({
        ...input,
        lastBroadcastAt: daysBefore(NOW, BROADCAST_CAP_DAYS - 1),
      })
    ).toEqual({ kind: "skip", reason: "broadcast-cap" });
    expect(
      decideBroadcastSend({
        ...input,
        lastBroadcastAt: daysBefore(NOW, BROADCAST_CAP_DAYS),
      })
    ).toEqual({ kind: "send" });
  });

  it("waits for the 3-day gap after another optional mail", () => {
    const last = daysBefore(NOW, 1);
    expect(
      decideBroadcastSend({
        ...input,
        person: makePerson({ lastMarketingSentAt: last }),
      })
    ).toEqual({
      kind: "defer",
      until: daysAfter(last, 3),
      reason: "cap",
    });
  });

  it("gives up when the wait runs past the defer limit", () => {
    const last = daysAfter(NOW, DEFER_LIMIT_DAYS);
    expect(
      decideBroadcastSend({
        ...input,
        person: makePerson({
          lastMarketingSentAt: last,
          preferences: { ...makePerson().preferences, fewer: true },
        }),
      })
    ).toEqual({ kind: "skip", reason: "cap-expired" });
  });

  it("defers to the morning when the person is in quiet hours", () => {
    const early = new Date("2026-11-03T05:00:00.000Z");
    expect(
      decideBroadcastSend({ ...input, now: early, startedAt: early })
    ).toEqual({
      kind: "defer",
      until: new Date("2026-11-03T09:00:00.000Z"),
      reason: "window",
    });
  });

  it("gives up when no window exists", () => {
    const early = new Date("2026-11-03T05:00:00.000Z");
    expect(
      decideBroadcastSend({
        ...input,
        now: early,
        startedAt: early,
        person: makePerson({ quiet: { startMinute: 0, endMinute: 1439 } }),
      })
    ).toEqual({ kind: "skip", reason: "no-window" });
  });
});
