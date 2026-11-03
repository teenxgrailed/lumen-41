import { HubError } from "../errors";
import {
  assertRecurrence,
  describeRule,
  nextOccurrence,
} from "../recurrence-rule";

const NY = "America/New_York";
const KYIV = "Europe/Kyiv";
const iso = (date: Date | null) => date?.toISOString() ?? null;

describe("nextOccurrence", () => {
  it("runs a weekly Monday 09:00 rule on the wall clock", () => {
    // Tue 2026-11-03; the next Monday is 2026-11-09, 09:00 EST = 14:00Z.
    const next = nextOccurrence(
      "FREQ=WEEKLY;BYDAY=MO;BYHOUR=9",
      NY,
      new Date("2026-11-03T13:16:00Z")
    );
    expect(iso(next)).toBe("2026-11-09T14:00:00.000Z");
  });

  it("keeps 09:00 local across the spring-forward change (23 hour day)", () => {
    const rule = "FREQ=DAILY;BYHOUR=9";
    const before = nextOccurrence(rule, NY, new Date("2027-03-13T12:00:00Z"));
    expect(iso(before)).toBe("2027-03-13T14:00:00.000Z"); // 09:00 EST
    const after = nextOccurrence(rule, NY, before as Date);
    expect(iso(after)).toBe("2027-03-14T13:00:00.000Z"); // 09:00 EDT
    expect(iso(nextOccurrence(rule, NY, after as Date))).toBe(
      "2027-03-15T13:00:00.000Z"
    );
  });

  it("keeps 09:00 local across the fall-back change (25 hour day)", () => {
    const rule = "FREQ=DAILY;BYHOUR=9";
    const before = nextOccurrence(rule, NY, new Date("2026-10-31T12:00:00Z"));
    expect(iso(before)).toBe("2026-10-31T13:00:00.000Z"); // 09:00 EDT
    expect(iso(nextOccurrence(rule, NY, before as Date))).toBe(
      "2026-11-01T14:00:00.000Z" // 09:00 EST
    );
  });

  it("moves a weekly Monday rule in Kyiv from EET to EEST", () => {
    const rule = "FREQ=WEEKLY;BYDAY=MO;BYHOUR=9";
    const winter = nextOccurrence(rule, KYIV, new Date("2027-03-20T00:00:00Z"));
    expect(iso(winter)).toBe("2027-03-22T07:00:00.000Z"); // UTC+2
    expect(iso(nextOccurrence(rule, KYIV, winter as Date))).toBe(
      "2027-03-29T06:00:00.000Z" // UTC+3
    );
  });

  it("lands a wall time skipped by the clock change on that day, once", () => {
    const rule = "FREQ=DAILY;BYHOUR=2;BYMINUTE=30";
    const day = nextOccurrence(rule, NY, new Date("2027-03-14T00:00:00Z"));
    // 02:30 does not exist on 2027-03-14 in New York; it still fires that day.
    expect((day as Date).toISOString().slice(0, 10)).toBe("2027-03-14");
    const following = nextOccurrence(rule, NY, day as Date);
    expect(iso(following)).toBe("2027-03-15T06:30:00.000Z"); // 02:30 EDT
  });

  it("fires a repeated wall hour once on the fall-back day", () => {
    const rule = "FREQ=DAILY;BYHOUR=1;BYMINUTE=30";
    const first = nextOccurrence(rule, NY, new Date("2026-11-01T00:00:00Z"));
    const second = nextOccurrence(rule, NY, first as Date);
    expect(iso(first)).toBe("2026-11-01T05:30:00.000Z"); // 01:30 EDT, first pass
    expect(iso(second)).toBe("2026-11-02T06:30:00.000Z"); // next day 01:30 EST
  });

  it("returns null once a COUNT series is used up", () => {
    // 08:00 EST on the 3rd: today's 09:00 is the first of the two.
    const anchor = new Date("2026-11-03T13:00:00Z");
    const rule = "FREQ=DAILY;COUNT=2;BYHOUR=9";
    const one = nextOccurrence(rule, NY, anchor, anchor);
    const two = nextOccurrence(rule, NY, one as Date, anchor);
    expect(iso(one)).toBe("2026-11-03T14:00:00.000Z");
    expect(iso(two)).toBe("2026-11-04T14:00:00.000Z");
    expect(nextOccurrence(rule, NY, two as Date, anchor)).toBeNull();
  });

  it("uses the anchor's time of day when the rule names none", () => {
    const anchor = new Date("2026-11-03T15:45:00Z"); // 10:45 EST
    const next = nextOccurrence("FREQ=WEEKLY;BYDAY=FR", NY, anchor, anchor);
    expect(iso(next)).toBe("2026-11-06T15:45:00.000Z");
  });
});

describe("assertRecurrence", () => {
  it("accepts the documented example", () => {
    expect(() =>
      assertRecurrence("FREQ=WEEKLY;BYDAY=MO;BYHOUR=9", KYIV)
    ).not.toThrow();
  });

  it.each([
    ["FREQ=HOURLY", NY],
    ["FREQ=MINUTELY;INTERVAL=5", NY],
    ["not a rule", NY],
    ["FREQ=DAILY", "Mars/Olympus"],
  ])("refuses %s in %s", (rule, zone) => {
    expect(() => assertRecurrence(rule, zone)).toThrow(HubError);
  });
});

describe("describeRule", () => {
  it("reads like a sentence with the time", () => {
    expect(describeRule("FREQ=WEEKLY;BYDAY=MO;BYHOUR=9", NY)).toMatch(
      /Monday.* at 09:00$/
    );
  });
});
