import {
  anytimeOpen,
  lateMovable,
  spreadDay,
  spreadLeads,
  spreadSummary,
} from "../spread";
import { TODAY, task } from "./fixtures";

describe("what a spread takes", () => {
  it("today: the open untimed tasks, never a fixed or a done one", () => {
    const anytime = task();
    const staleBlock = task({ scheduledStart: "2026-08-31T19:00" });
    const timed = task({ scheduledStart: `${TODAY}T10:00` });
    const fixed = task({ isFixed: true });
    const done = task({ done: true });
    expect(
      anytimeOpen([anytime, staleBlock, timed, fixed, done], TODAY).map(
        (t) => t.id
      )
    ).toEqual([anytime.id, staleBlock.id]);
  });

  it("overdue: every open one that is not fixed", () => {
    const late = task({ dueDate: "2026-08-28" });
    const fixed = task({ dueDate: "2026-08-28", isFixed: true });
    expect(lateMovable([late, fixed]).map((t) => t.id)).toEqual([late.id]);
  });

  it("Spread leads only when today is already overbooked", () => {
    expect(spreadLeads(true, 3)).toBe(true);
    expect(spreadLeads(false, 3)).toBe(false);
    expect(spreadLeads(true, 0)).toBe(false);
  });
});

describe("what a spread says", () => {
  const row = (title: string, date: string) => ({
    taskId: title,
    title,
    date,
  });

  it("names the day: Today, Tomorrow, else the weekday and date", () => {
    expect(spreadDay(TODAY, TODAY)).toBe("Today");
    expect(spreadDay("2026-09-02", TODAY)).toBe("Tomorrow");
    expect(spreadDay("2026-09-04", TODAY)).toBe("Fri 4 Sep");
  });

  it("says how many moved, where the first few went, and what did not fit", () => {
    const s = spreadSummary({
      today: TODAY,
      moved: [
        row("Taxes", "2026-09-02"),
        row("Call Ana", "2026-09-02"),
        row("Slides", "2026-09-04"),
        row("Invoice", "2026-09-07"),
      ],
      stayed: [],
      unplaced: [{ taskId: "big", title: "Big" }],
    });
    expect(s.headline).toBe(
      "4 tasks moved to days with room. 1 task did not fit this week"
    );
    expect(s.detail).toBe(
      "Taxes → Tomorrow · Call Ana → Tomorrow · Slides → Fri 4 Sep · +1 more"
    );
  });

  it("overdue that fits today says so", () => {
    expect(
      spreadSummary({
        today: TODAY,
        moved: [row("Late", TODAY)],
        stayed: [],
        unplaced: [],
      }).headline
    ).toBe("1 task moved to today");
  });

  it("nothing moved says why", () => {
    const empty = { today: TODAY, moved: [], stayed: [], unplaced: [] };
    expect(
      spreadSummary({ ...empty, unplaced: [{ taskId: "a", title: "A" }] })
    ).toEqual({ headline: "No day this week has room for these" });
    expect(spreadSummary({ ...empty, stayed: [row("A", TODAY)] })).toEqual({
      headline: "Nothing to move: these fit today",
    });
    expect(spreadSummary(empty)).toEqual({ headline: "Nothing to spread" });
  });
});
