import {
  PERSONAL_PRESETS,
  daysOfRule,
  expandPersonalBlocks,
  isValidRule,
  weeklyRule,
} from "../personal-time";
import { dayBands, quickStart } from "../personal-time-days";

const lunch = (over: Record<string, unknown> = {}) => ({
  id: "lunch",
  kind: "lunch",
  title: "Lunch",
  emoji: null,
  color: null,
  start: new Date("2026-10-19T13:00:00.000Z"),
  end: new Date("2026-10-19T14:00:00.000Z"),
  rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
  sourceEventId: null,
  ...over,
});

const week = {
  from: new Date("2026-10-19T00:00:00.000Z"),
  to: new Date("2026-10-26T00:00:00.000Z"),
};

describe("expandPersonalBlocks", () => {
  it("repeats on the chosen weekdays only", () => {
    const found = expandPersonalBlocks([lunch()], { ...week, timeZone: "UTC" });
    expect(found.map((o) => o.date)).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
    ]);
    expect(found[0].emoji).toBe("🍽️");
    expect(found[0].tone).toBe("info");
  });

  it("keeps the wall-clock hour across a daylight saving change", () => {
    // Zurich leaves summer time on Sunday 25 Oct 2026: 13:00 stays 13:00.
    const block = lunch({
      start: new Date("2026-10-23T11:00:00.000Z"), // Fri 13:00 CEST
      end: new Date("2026-10-23T12:00:00.000Z"),
    });
    const found = expandPersonalBlocks([block], {
      from: new Date("2026-10-23T00:00:00.000Z"),
      to: new Date("2026-10-28T00:00:00.000Z"),
      timeZone: "Europe/Zurich",
    });
    expect(found.map((o) => o.start.toISOString())).toEqual([
      "2026-10-23T11:00:00.000Z",
      "2026-10-26T12:00:00.000Z", // Mon 13:00 CET
      "2026-10-27T12:00:00.000Z",
    ]);
  });

  it("a one-off block shows only inside its range", () => {
    const once = lunch({ rrule: null });
    expect(
      expandPersonalBlocks([once], { ...week, timeZone: "UTC" })
    ).toHaveLength(1);
    expect(
      expandPersonalBlocks([once], {
        from: new Date("2026-10-26T00:00:00.000Z"),
        to: new Date("2026-11-02T00:00:00.000Z"),
        timeZone: "UTC",
      })
    ).toHaveLength(0);
  });

  it("a block linked to an event takes the event's live time and ignores its own repeat", () => {
    const linked = lunch({ sourceEventId: "ev", rrule: null });
    const found = expandPersonalBlocks([linked], {
      ...week,
      timeZone: "UTC",
      events: new Map([
        [
          "ev",
          {
            start: new Date("2026-10-21T07:00:00.000Z"),
            end: new Date("2026-10-21T08:00:00.000Z"),
          },
        ],
      ]),
    });
    expect(found).toHaveLength(1);
    expect(found[0].start.toISOString()).toBe("2026-10-21T07:00:00.000Z");
    expect(found[0].linked).toBe(true);
  });

  it("survives a rule it cannot read", () => {
    const found = expandPersonalBlocks([lunch({ rrule: "NOPE" })], {
      ...week,
      timeZone: "UTC",
    });
    expect(found).toHaveLength(1);
  });
});

describe("rules", () => {
  it("round-trips weekdays", () => {
    expect(weeklyRule([1, 2, 3, 4, 5])).toBe(
      "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"
    );
    expect(weeklyRule([0, 1, 2, 3, 4, 5, 6])).toBe("FREQ=DAILY");
    expect(weeklyRule([])).toBeNull();
    expect(daysOfRule("FREQ=WEEKLY;BYDAY=MO,WE")).toEqual([1, 3]);
    expect(daysOfRule("FREQ=MONTHLY")).toBeNull();
    expect(isValidRule("FREQ=DAILY")).toBe(true);
  });

  it("every preset has an emoji, a length and a tint that is not the accent", () => {
    for (const preset of PERSONAL_PRESETS) {
      expect(preset.emoji.length).toBeGreaterThan(0);
      expect(preset.minutes).toBeGreaterThan(0);
      expect(["info", "success", "neutral"]).toContain(preset.tone);
    }
  });
});

describe("dayBands", () => {
  it("cuts an overnight block into both days", () => {
    const party = lunch({
      kind: "party",
      title: "Party",
      rrule: null,
      start: new Date("2026-10-23T21:00:00.000Z"),
      end: new Date("2026-10-24T02:00:00.000Z"),
    });
    const occ = expandPersonalBlocks([party], { ...week, timeZone: "UTC" });
    const bands = dayBands(occ, "UTC");
    expect(bands.get("2026-10-23")).toMatchObject([{ from: 21, to: 24 }]);
    expect(bands.get("2026-10-24")).toMatchObject([{ from: 0, to: 2 }]);
  });
});

describe("quickStart", () => {
  it("lands on the next half hour today", () => {
    const start = quickStart(
      new Date("2026-10-19T10:10:00.000Z"),
      "UTC",
      60,
      "13:00"
    );
    expect(start.toISOString()).toBe("2026-10-19T10:30:00.000Z");
  });

  it("moves to tomorrow at the preset hour when it would run past midnight", () => {
    const start = quickStart(
      new Date("2026-10-19T23:10:00.000Z"),
      "UTC",
      60,
      "13:00"
    );
    expect(start.toISOString()).toBe("2026-10-20T13:00:00.000Z");
  });
});
