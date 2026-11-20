import type { PlanView } from "@/services/day-plan/plan";

import {
  dayHeader,
  dayPart,
  freeAfterHour,
  greetingParts,
  greetingText,
  greetingWord,
  groupByDayPart,
  planStats,
} from "../day-plan-view";

const input = (o: Partial<Parameters<typeof greetingParts>[0]> = {}) => ({
  hour: 8,
  meetings: 3,
  tasks: 2,
  habits: 1,
  freeAfter: "16:00",
  ...o,
});

describe("greetingWord", () => {
  it("follows the hour", () => {
    expect(greetingWord(5)).toBe("Good morning");
    expect(greetingWord(11.9)).toBe("Good morning");
    expect(greetingWord(12)).toBe("Good afternoon");
    expect(greetingWord(17.5)).toBe("Good afternoon");
    expect(greetingWord(18)).toBe("Good evening");
  });
});

describe("greetingParts", () => {
  it("builds the full sentence with a free window", () => {
    expect(greetingText(greetingParts(input()))).toBe(
      "Good morning. You have 3 meetings, 2 tasks and 1 habit today. You're mostly free after 16:00."
    );
  });

  it("marks the facts, not the connective words", () => {
    const facts = greetingParts(input()).filter((p) => p.kind === "fact");
    expect(facts.map((f) => f.text)).toEqual([
      "3 meetings",
      "2 tasks",
      "1 habit",
    ]);
    expect(facts.map((f) => f.kind === "fact" && f.fact)).toEqual([
      "meetings",
      "tasks",
      "habits",
    ]);
  });

  it("uses the singular for one", () => {
    expect(
      greetingText(greetingParts(input({ meetings: 1, tasks: 1, habits: 1 })))
    ).toContain("1 meeting, 1 task and 1 habit today");
  });

  it("leaves out what is zero and joins two with and", () => {
    expect(
      greetingText(greetingParts(input({ meetings: 0, freeAfter: null })))
    ).toBe("Good morning. You have 2 tasks and 1 habit today.");
  });

  it("a single fact has no joiner", () => {
    expect(
      greetingText(
        greetingParts(input({ meetings: 0, habits: 0, freeAfter: null }))
      )
    ).toBe("Good morning. You have 2 tasks today.");
  });

  it("drops the free line when there is no free window", () => {
    expect(greetingText(greetingParts(input({ freeAfter: null })))).not.toMatch(
      /free/
    );
  });

  it("says so when nothing is planned", () => {
    expect(
      greetingText(
        greetingParts(
          input({ meetings: 0, tasks: 0, habits: 0, freeAfter: null, hour: 14 })
        )
      )
    ).toBe("Good afternoon. Nothing is planned for today.");
  });
});

describe("freeAfterHour", () => {
  it("is when the last meeting ends, rounded up to a quarter", () => {
    expect(
      freeAfterHour(
        [
          { at: 9, len: 60 },
          { at: 14, len: 70 },
        ],
        8,
        18
      )
    ).toBe(15.25);
  });

  it("ignores meetings already over", () => {
    expect(freeAfterHour([{ at: 9, len: 60 }], 11, 18)).toBeNull();
  });

  it("is null with no meetings", () => {
    expect(freeAfterHour([], 8, 18)).toBeNull();
  });

  it("is null when the last meeting runs to the end of work", () => {
    expect(freeAfterHour([{ at: 16, len: 120 }], 8, 18)).toBeNull();
    expect(freeAfterHour([{ at: 16.5, len: 60 }], 8, 18)).toBeNull();
  });
});

describe("planStats", () => {
  const plan = (o: Partial<PlanView>) =>
    ({ taskCount: 3, limit: 5, focusMinutes: 120, ...o }) as PlanView;

  it("gives the limit used and the focus total", () => {
    expect(planStats(plan({}))).toEqual({ used: "3 of 5", focus: "2 h focus" });
  });

  it("spells minutes and mixed durations", () => {
    expect(planStats(plan({ focusMinutes: 45 })).focus).toBe("45 min focus");
    expect(planStats(plan({ focusMinutes: 130 })).focus).toBe(
      "2 h 10 min focus"
    );
    expect(planStats(plan({ focusMinutes: 0 })).focus).toBe("0 min focus");
  });
});

describe("dayPart and groupByDayPart", () => {
  it("cuts the day", () => {
    expect(dayPart(null)).toBe("anytime");
    expect(dayPart(8.5)).toBe("morning");
    expect(dayPart(12)).toBe("day");
    expect(dayPart(16.99)).toBe("day");
    expect(dayPart(17)).toBe("evening");
  });

  it("groups in day order, sorts by time, drops empty parts", () => {
    const items = [
      { id: "a", h: 19 },
      { id: "b", h: null },
      { id: "c", h: 10 },
      { id: "d", h: 9 },
    ];
    const g = groupByDayPart(items, (i) => i.h);
    expect(g.map((x) => x.part)).toEqual(["anytime", "morning", "evening"]);
    expect(g[1].items.map((i) => i.id)).toEqual(["d", "c"]);
  });
});

describe("dayHeader", () => {
  it("is the short weekday, the date and the year in the person's zone", () => {
    const now = new Date("2026-11-20T23:30:00Z");
    expect(dayHeader(now, "Europe/Zurich")).toEqual({
      weekday: "Sat",
      date: "21 Nov",
      year: "2026",
    });
    expect(dayHeader(now, "UTC")).toEqual({
      weekday: "Fri",
      date: "20 Nov",
      year: "2026",
    });
  });
});
