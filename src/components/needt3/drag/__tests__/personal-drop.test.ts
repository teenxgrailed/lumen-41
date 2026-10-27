import { fromZonedTime } from "@/lib/date-utils";
import type { DayBand } from "@/lib/personal-time-days";

import {
  PERSONAL_MIN_MINUTES,
  bandGesturePatch,
  bandIsDraggable,
  dayDeltaBetween,
  personalHitForPlacement,
  resizeDeltaHours,
  shiftedRule,
} from "../personal-drop";

const band = (over: Partial<DayBand> = {}): DayBand => ({
  key: "k",
  blockId: "lunch",
  kind: "lunch",
  title: "Lunch",
  emoji: "🍽️",
  tone: "info",
  date: "2026-10-19",
  from: 13,
  to: 14,
  repeating: true,
  linked: false,
  ...over,
});

const bands = new Map([["2026-10-19", [band()]]]);

describe("personalHitForPlacement", () => {
  it("catches a drop that starts inside the block", () => {
    expect(
      personalHitForPlacement(bands, "2026-10-19T13:15", "2026-10-19T14:15")
    ).toMatchObject({ blockId: "lunch" });
  });

  it("catches a drop that ends inside it", () => {
    expect(
      personalHitForPlacement(bands, "2026-10-19T12:15", "2026-10-19T13:15")
    ).not.toBeNull();
  });

  it("lets a drop that only touches the edge through", () => {
    expect(
      personalHitForPlacement(bands, "2026-10-19T12:00", "2026-10-19T13:00")
    ).toBeNull();
    expect(
      personalHitForPlacement(bands, "2026-10-19T14:00", "2026-10-19T15:00")
    ).toBeNull();
  });

  it("only looks at the day it lands on", () => {
    expect(
      personalHitForPlacement(bands, "2026-10-20T13:15", "2026-10-20T14:15")
    ).toBeNull();
  });

  it("ignores a task with no time", () => {
    expect(personalHitForPlacement(bands, null, null)).toBeNull();
    expect(personalHitForPlacement(bands, undefined, undefined)).toBeNull();
  });

  it("treats a start with no end as a short stretch from the start", () => {
    expect(
      personalHitForPlacement(bands, "2026-10-19T13:30", null)
    ).not.toBeNull();
  });
});

/* A band moved or resized by hand. Zurich is UTC+2 until 25 Oct 2026. */
const TZ = "Europe/Zurich";
const zurich = (day: string, clock: string) =>
  fromZonedTime(`${day}T${clock}:00`, TZ).toISOString();
const block = (from: string, to: string, extra: object = {}) => ({
  start: zurich("2026-10-19", from),
  end: zurich("2026-10-19", to),
  sourceEventId: null as string | null,
  ...extra,
});

describe("bandGesturePatch: move", () => {
  it("shifts start and end together by the distance, keeping the length", () => {
    expect(bandGesturePatch(block("13:00", "14:00"), TZ, "move", 1)).toEqual({
      start: zurich("2026-10-19", "14:00"),
      end: zurich("2026-10-19", "15:00"),
    });
    expect(bandGesturePatch(block("13:00", "14:30"), TZ, "move", -2)).toEqual({
      start: zurich("2026-10-19", "11:00"),
      end: zurich("2026-10-19", "12:30"),
    });
  });

  it("snaps to the quarter hour like a task does", () => {
    // 7 minutes is under half a step, 8 rounds up to 15
    expect(
      bandGesturePatch(block("13:00", "14:00"), TZ, "move", 7 / 60)
    ).toBeNull();
    expect(
      bandGesturePatch(block("13:00", "14:00"), TZ, "move", 8 / 60)
    ).toEqual({
      start: zurich("2026-10-19", "13:15"),
      end: zurich("2026-10-19", "14:15"),
    });
  });

  it("puts the new start of a block that began off the grid on the grid", () => {
    expect(bandGesturePatch(block("13:10", "14:10"), TZ, "move", 0.25)).toEqual(
      {
        start: zurich("2026-10-19", "13:30"),
        end: zurich("2026-10-19", "14:30"),
      }
    );
    // a hand that did not travel a step leaves it exactly where it was
    expect(bandGesturePatch(block("13:10", "14:10"), TZ, "move", 0)).toBeNull();
  });

  it("does nothing when it did not move", () => {
    expect(bandGesturePatch(block("13:00", "14:00"), TZ, "move", 0)).toBeNull();
  });

  it("keeps the start inside its day", () => {
    expect(bandGesturePatch(block("01:00", "02:00"), TZ, "move", -5)).toEqual({
      start: zurich("2026-10-19", "00:00"),
      end: zurich("2026-10-19", "01:00"),
    });
    expect(bandGesturePatch(block("20:00", "21:00"), TZ, "move", 9)).toEqual({
      start: zurich("2026-10-19", "23:45"),
      end: zurich("2026-10-20", "00:45"),
    });
  });

  it("lets the end run past midnight", () => {
    expect(bandGesturePatch(block("22:00", "23:00"), TZ, "move", 1.5)).toEqual({
      start: zurich("2026-10-19", "23:30"),
      end: zurich("2026-10-20", "00:30"),
    });
  });

  it("moves a block that already crosses midnight, keeping its length", () => {
    const night = {
      start: zurich("2026-10-19", "22:00"),
      end: zurich("2026-10-20", "01:00"),
      sourceEventId: null,
    };
    expect(bandGesturePatch(night, TZ, "move", -12)).toEqual({
      start: zurich("2026-10-19", "10:00"),
      end: zurich("2026-10-19", "13:00"),
    });
  });

  it("stays on the block's own first day, so a repeat keeps its weekdays", () => {
    const series = block("13:00", "14:00", {
      start: zurich("2026-10-12", "13:00"),
      end: zurich("2026-10-12", "14:00"),
    });
    expect(bandGesturePatch(series, TZ, "move", 1)).toEqual({
      start: zurich("2026-10-12", "14:00"),
      end: zurich("2026-10-12", "15:00"),
    });
  });
});

describe("bandGesturePatch: resize", () => {
  it("moves only the end", () => {
    expect(
      bandGesturePatch(block("13:00", "14:00"), TZ, "resize", 0.5)
    ).toEqual({ end: zurich("2026-10-19", "14:30") });
    expect(
      bandGesturePatch(block("13:00", "14:00"), TZ, "resize", -0.5)
    ).toEqual({ end: zurich("2026-10-19", "13:30") });
  });

  it("snaps the end to the quarter hour", () => {
    expect(
      bandGesturePatch(block("13:00", "14:00"), TZ, "resize", 0.4)
    ).toEqual({ end: zurich("2026-10-19", "14:30") });
    expect(
      bandGesturePatch(block("13:00", "14:00"), TZ, "resize", 0.1)
    ).toBeNull();
  });

  it("never makes a block shorter than 15 minutes", () => {
    expect(PERSONAL_MIN_MINUTES).toBe(15);
    expect(bandGesturePatch(block("13:00", "14:00"), TZ, "resize", -3)).toEqual(
      { end: zurich("2026-10-19", "13:15") }
    );
    // already at the minimum: pulling up changes nothing
    expect(
      bandGesturePatch(block("13:00", "13:15"), TZ, "resize", -1)
    ).toBeNull();
  });

  it("can pull the end past midnight, but not to a full day", () => {
    expect(bandGesturePatch(block("22:00", "23:00"), TZ, "resize", 2)).toEqual({
      end: zurich("2026-10-20", "01:00"),
    });
    const long = bandGesturePatch(block("01:00", "02:00"), TZ, "resize", 40);
    expect(long).toEqual({ end: zurich("2026-10-20", "00:45") });
  });
});

describe("bandGesturePatch: what cannot be dragged", () => {
  it("leaves a block marked on an event to the event", () => {
    const linked = block("13:00", "14:00", { sourceEventId: "evt-1" });
    expect(bandGesturePatch(linked, TZ, "move", 1)).toBeNull();
    expect(bandGesturePatch(linked, TZ, "resize", 1)).toBeNull();
    expect(bandIsDraggable({ linked: true })).toBe(false);
    expect(bandIsDraggable({ linked: false })).toBe(true);
  });

  it("refuses a block a day long or more, or one that ends before it starts", () => {
    const day = {
      start: zurich("2026-10-19", "00:00"),
      end: zurich("2026-10-20", "00:00"),
      sourceEventId: null,
    };
    expect(bandGesturePatch(day, TZ, "move", 1)).toBeNull();
    const backwards = block("14:00", "13:00");
    expect(bandGesturePatch(backwards, TZ, "move", 1)).toBeNull();
  });
});

describe("resizeDeltaHours", () => {
  it("turns pixels into snapped hours", () => {
    // 52px an hour: 13px is a quarter, 26px half, 52px an hour
    expect(resizeDeltaHours(13, 52)).toBe(0.25);
    expect(resizeDeltaHours(26, 52)).toBe(0.5);
    expect(resizeDeltaHours(52, 52)).toBe(1);
    expect(resizeDeltaHours(-52, 52)).toBe(-1);
  });

  it("rounds to the nearest quarter and ignores a hand that barely moved", () => {
    expect(resizeDeltaHours(5, 52)).toBe(0);
    expect(resizeDeltaHours(20, 52)).toBe(0.5);
    expect(resizeDeltaHours(100, 0)).toBe(0);
  });
});

describe("dayDeltaBetween", () => {
  it("counts calendar days across a week, a month and the DST change", () => {
    expect(dayDeltaBetween("2026-10-19", "2026-10-20")).toBe(1);
    expect(dayDeltaBetween("2026-10-21", "2026-10-19")).toBe(-2);
    expect(dayDeltaBetween("2026-10-24", "2026-10-26")).toBe(2);
    expect(dayDeltaBetween("2026-10-30", "2026-11-02")).toBe(3);
    expect(dayDeltaBetween("2026-10-19", "2026-10-19")).toBe(0);
  });
});

describe("shiftedRule", () => {
  it("moves each weekday and wraps the week", () => {
    expect(shiftedRule("FREQ=WEEKLY;BYDAY=MO", 1)).toBe("FREQ=WEEKLY;BYDAY=TU");
    expect(shiftedRule("FREQ=WEEKLY;BYDAY=SU", 1)).toBe("FREQ=WEEKLY;BYDAY=MO");
    expect(shiftedRule("FREQ=WEEKLY;BYDAY=MO", -1)).toBe(
      "FREQ=WEEKLY;BYDAY=SU"
    );
    expect(shiftedRule("FREQ=WEEKLY;BYDAY=MO,WE,SU", 2)).toBe(
      "FREQ=WEEKLY;BYDAY=TU,WE,FR"
    );
    expect(shiftedRule("FREQ=WEEKLY;BYDAY=TU", 8)).toBe("FREQ=WEEKLY;BYDAY=WE");
  });

  it("leaves daily and custom rules alone", () => {
    expect(shiftedRule("FREQ=DAILY", 3)).toBe("FREQ=DAILY");
    expect(shiftedRule("FREQ=MONTHLY;BYMONTHDAY=3", 3)).toBe(
      "FREQ=MONTHLY;BYMONTHDAY=3"
    );
    expect(shiftedRule(null, 3)).toBeNull();
  });
});

describe("bandGesturePatch: move to another day", () => {
  it("moves a one-off block to the dropped date, keeping the time", () => {
    expect(bandGesturePatch(block("13:00", "14:00"), TZ, "move", 0, 2)).toEqual(
      {
        start: zurich("2026-10-21", "13:00"),
        end: zurich("2026-10-21", "14:00"),
      }
    );
  });

  it("changes day and time in one drop", () => {
    expect(
      bandGesturePatch(block("13:00", "14:00"), TZ, "move", 1, -1)
    ).toEqual({
      start: zurich("2026-10-18", "14:00"),
      end: zurich("2026-10-18", "15:00"),
    });
  });

  it("rotates a weekly block's weekdays by the day delta", () => {
    const weekly = block("13:00", "14:00", { rrule: "FREQ=WEEKLY;BYDAY=MO" });
    expect(bandGesturePatch(weekly, TZ, "move", 0, 1)).toEqual({
      start: zurich("2026-10-20", "13:00"),
      end: zurich("2026-10-20", "14:00"),
      rrule: "FREQ=WEEKLY;BYDAY=TU",
    });
  });

  it("wraps SU to MO across the week boundary, both ways", () => {
    const sunday = {
      start: zurich("2026-10-18", "09:00"),
      end: zurich("2026-10-18", "10:00"),
      sourceEventId: null,
      rrule: "FREQ=WEEKLY;BYDAY=SU",
    };
    expect(bandGesturePatch(sunday, TZ, "move", 0, 1)).toEqual({
      start: zurich("2026-10-19", "09:00"),
      end: zurich("2026-10-19", "10:00"),
      rrule: "FREQ=WEEKLY;BYDAY=MO",
    });
    const monday = block("09:00", "10:00", { rrule: "FREQ=WEEKLY;BYDAY=MO" });
    expect(bandGesturePatch(monday, TZ, "move", 0, -1)?.rrule).toBe(
      "FREQ=WEEKLY;BYDAY=SU"
    );
  });

  it("ignores the day delta for a daily repeat (time only)", () => {
    const daily = block("13:00", "14:00", { rrule: "FREQ=DAILY" });
    expect(bandGesturePatch(daily, TZ, "move", 0, 3)).toBeNull();
    expect(bandGesturePatch(daily, TZ, "move", 1, 3)).toEqual({
      start: zurich("2026-10-19", "14:00"),
      end: zurich("2026-10-19", "15:00"),
    });
  });

  it("keeps the wall-clock time across the DST change", () => {
    // Sat 24 Oct (UTC+2) to Mon 26 Oct (UTC+1): 13:00 stays 13:00 in Zurich
    const sat = {
      start: zurich("2026-10-24", "13:00"),
      end: zurich("2026-10-24", "14:00"),
      sourceEventId: null,
    };
    const patch = bandGesturePatch(sat, TZ, "move", 0, 2);
    expect(patch).toEqual({
      start: zurich("2026-10-26", "13:00"),
      end: zurich("2026-10-26", "14:00"),
    });
    expect(patch?.start).toBe("2026-10-26T12:00:00.000Z");
  });

  it("leaves linked blocks alone and ignores the day on a resize", () => {
    expect(
      bandGesturePatch(
        block("13:00", "14:00", { sourceEventId: "e1" }),
        TZ,
        "move",
        0,
        1
      )
    ).toBeNull();
    expect(
      bandGesturePatch(block("13:00", "14:00"), TZ, "resize", 0.5, 2)
    ).toEqual({ end: zurich("2026-10-19", "14:30") });
  });
});
