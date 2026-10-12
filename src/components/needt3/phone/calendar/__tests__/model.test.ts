import type { CalItem, CalTimed } from "../../../calendar/blocks";
import {
  combineQueries,
  dayLoad,
  dayMeta,
  dayOverlaps,
  dayPlan,
  eventFacts,
  monthGrid,
  stepMonth,
  swipeStep,
  visibleRange,
  weekLetters,
  weekOf,
} from "../model";

const TODAY = "2026-09-02"; // a Wednesday
const timed = (
  id: string,
  at: number,
  len: number,
  o: Partial<CalTimed> = {}
) =>
  ({
    id,
    date: TODAY,
    at,
    len,
    title: id,
    entry: {} as never,
    ...o,
  }) as CalTimed;
const ev = (id: string, at: number, len: number, o: Partial<CalTimed> = {}) =>
  timed(id, at, len, {
    event: true,
    entry: { kind: "event", calendarName: "Work" } as never,
    ...o,
  });

describe("dayOverlaps", () => {
  it("marks a task that collides with an event, both ways", () => {
    const { clash, pairs } = dayOverlaps([
      timed("t", 10, 60),
      ev("e", 10.5, 60),
    ]);
    expect(clash).toEqual({ t: ["e"], e: ["t"] });
    expect(pairs).toBe(1);
  });
  it("never marks two tasks that overlap each other", () => {
    expect(dayOverlaps([timed("a", 10, 60), timed("b", 10.5, 60)])).toEqual({
      clash: {},
      pairs: 0,
    });
  });
  it("back to back is not an overlap; two events are", () => {
    expect(dayOverlaps([ev("a", 9, 60), timed("b", 10, 30)]).pairs).toBe(0);
    expect(dayOverlaps([ev("a", 9, 60), ev("b", 9.5, 60)]).pairs).toBe(1);
  });
  it("counts pairs, not sides", () => {
    const { pairs } = dayOverlaps([
      ev("e", 10, 120),
      timed("t1", 10, 30),
      timed("t2", 11, 30),
    ]);
    expect(pairs).toBe(2);
  });
});

describe("dayPlan", () => {
  const items = [
    timed("early", 8, 60),
    ev("now", 14, 60),
    timed("soon", 16, 30),
    timed("late", 18, 60),
  ];
  const loose = [
    { id: "l", date: TODAY, at: null, len: 0, title: "l" } as CalItem,
    { id: "x", date: "2026-09-03", at: null, len: 0, title: "x" } as CalItem,
  ];
  it("today at 14:20: now is the plate, the past folds, the line sits before what is next", () => {
    const p = dayPlan(items, loose, TODAY, TODAY, 14.33);
    expect(p.plate?.id).toBe("now");
    expect(p.nowB?.id).toBe("now");
    expect(p.plateLine).toBe("until 15:00");
    expect(p.earlier.map((b) => b.id)).toEqual(["early"]);
    expect(p.coming.map((b) => b.id)).toEqual(["soon", "late"]);
    expect(p.nowAt).toBe(0);
    expect(p.allDay.map((b) => b.id)).toEqual(["l"]);
    expect(p.booked).toBe(210);
  });
  it("between items: the next one is the plate, in minutes or hours", () => {
    const p = dayPlan(items, [], TODAY, TODAY, 15.5);
    expect(p.nowB).toBeNull();
    expect(p.plate?.id).toBe("soon");
    expect(p.plateLine).toBe("in 30 min");
    expect(dayPlan(items, [], TODAY, TODAY, 13.0).plateLine).toBe("in 1 h");
  });
  it("after the last item the now line closes the timeline", () => {
    const p = dayPlan(items, [], TODAY, TODAY, 20);
    expect(p.plate).toBeNull();
    expect(p.coming).toEqual([]);
    expect(p.nowAt).toBe(-1);
    expect(p.earlier).toHaveLength(4);
  });
  it("a day ahead leads with its first item; a past day has no plate", () => {
    const next = items.map((b) => ({ ...b, date: "2026-09-03" }));
    const ahead = dayPlan(next, [], "2026-09-03", TODAY, 14);
    expect(ahead.plate?.id).toBe("early");
    expect(ahead.plateLine).toBe("");
    expect(ahead.earlier).toEqual([]);
    expect(ahead.nowAt).toBe(-1);
    const past = dayPlan(
      items.map((b) => ({ ...b, date: "2026-09-01" })),
      [],
      "2026-09-01",
      TODAY,
      14
    );
    expect(past.plate).toBeNull();
    expect(past.coming).toHaveLength(4);
  });
  it("the head line", () => {
    expect(dayMeta(dayPlan([], [], TODAY, TODAY, 9))).toBe("Nothing planned");
    expect(dayMeta(dayPlan(items, loose, TODAY, TODAY, 9))).toBe(
      "5 planned · 3 h 30 min booked"
    );
  });
});

describe("eventFacts", () => {
  it("time, length, calendar and the overlaps", () => {
    const b = ev("e", 9, 90, { date: "2026-08-31" });
    expect(eventFacts(b, { e: ["Call Anna"] })).toEqual({
      title: "e",
      meta: "Monday 31 Aug",
      facts: [
        ["Time", "09:00–10:30"],
        ["Length", "1 h 30 min"],
        ["Calendar", "Work"],
        ["Overlaps", "Call Anna"],
      ],
    });
  });
  it("an all-day item has no length", () => {
    const b = { ...ev("e", 0, 0), at: null } as unknown as CalItem;
    expect(eventFacts(b, {}).facts[0]).toEqual(["Time", "All day"]);
    expect(eventFacts(b, {}).facts.map((f) => f[0])).not.toContain("Length");
  });
});

describe("the strip and the month", () => {
  it("letters and days follow the first day of the week", () => {
    expect(weekLetters("monday").join("")).toBe("MTWTFSS");
    expect(weekLetters("sunday").join("")).toBe("SMTWTFS");
    expect(weekOf(TODAY, "monday").map((d) => d.n)).toEqual([
      31, 1, 2, 3, 4, 5, 6,
    ]);
    expect(weekOf(TODAY, "sunday")[0].date).toBe("2026-08-30");
  });
  it("September 2026 from Monday 31 Aug, whole weeks", () => {
    const g = monthGrid(TODAY, "monday");
    expect(g.month).toBe("September");
    expect(g.year).toBe("2026");
    expect(g.cells).toHaveLength(35);
    expect(g.cells[0]).toMatchObject({ date: "2026-08-31", other: true });
    expect(g.cells[1]).toMatchObject({ date: "2026-09-01", other: false });
    expect(g.cells[34]).toMatchObject({ date: "2026-10-04", other: true });
  });
  it("a six-week month", () => {
    expect(monthGrid("2026-09-10", "monday").cells).toHaveLength(35);
    expect(monthGrid("2026-03-10", "monday").cells).toHaveLength(42);
    expect(monthGrid("2026-02-10", "sunday").cells).toHaveLength(28);
    expect(monthGrid("2027-05-10", "monday").cells).toHaveLength(42);
  });
  it("stepping a month keeps the day inside a shorter one", () => {
    expect(stepMonth("2026-01-31", 1)).toBe("2026-02-28");
    expect(stepMonth("2026-03-15", -1)).toBe("2026-02-15");
    expect(stepMonth("2026-12-10", 1)).toBe("2027-01-10");
    expect(stepMonth("2026-01-10", -1)).toBe("2025-12-10");
  });
  it("the events range is the six-week grid, the same for every week of the month", () => {
    const a = visibleRange("2026-09-02", "monday");
    expect(a).toEqual({ from: "2026-08-31", to: "2026-10-12" });
    expect(visibleRange("2026-09-29", "monday")).toEqual(a);
  });
  it("dots grow with the load", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(dayLoad)).toEqual([0, 1, 2, 2, 3, 3, 4]);
  });
});

describe("swipeStep", () => {
  it("a clear sideways swipe pages; a short, slanted or vertical one does not", () => {
    expect(swipeStep(-80, 5)).toBe(1);
    expect(swipeStep(80, -5)).toBe(-1);
    expect(swipeStep(-40, 0)).toBe(0);
    expect(swipeStep(-80, 70)).toBe(0);
    expect(swipeStep(5, -120)).toBe(0);
  });
});

describe("combineQueries", () => {
  interface FakeQuery {
    status: "pending" | "error" | "success";
    fetchStatus: "fetching" | "paused" | "idle";
    data: unknown;
    error: unknown;
    refetch: jest.Mock;
  }
  const q = (o: Partial<FakeQuery> = {}): FakeQuery => ({
    status: "success",
    fetchStatus: "idle",
    data: [],
    error: null,
    refetch: jest.fn(),
    ...o,
  });
  it("error beats pending beats success; no data until both have some", () => {
    expect(
      combineQueries(q({}), q({ status: "pending", data: undefined }))
    ).toMatchObject({ status: "pending", data: undefined });
    expect(
      combineQueries(q({ status: "error" }), q({ status: "pending" })).status
    ).toBe("error");
    expect(combineQueries(q({}), q({})).data).toBe(true);
  });
  it("paused (offline) wins and retry refetches both", () => {
    const a = q({});
    const b = q({ fetchStatus: "paused" });
    const c = combineQueries(a, b);
    expect(c.fetchStatus).toBe("paused");
    c.refetch();
    expect(a.refetch).toHaveBeenCalled();
    expect(b.refetch).toHaveBeenCalled();
  });
});
