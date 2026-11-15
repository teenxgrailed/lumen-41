import type { GoalView } from "@/lib/goals";

import {
  cellLabel,
  dayLevel,
  goalRisk,
  habitStack,
  monthGrid,
  nextStep,
} from "../model";

const TODAY = "2026-11-15"; // a Sunday
const habit = (id: string, perWeek: number | null = null) => ({
  id,
  title: id,
  schedule: { time: null, perWeek },
});
const done = (habitId: string, date: string) => ({
  habitId,
  date,
  done: true,
});

describe("habitStack", () => {
  it("holds the habits not kept today, in order, and drops the kept ones", () => {
    const list = [habit("a"), habit("b"), habit("c")];
    const stack = habitStack(list, [done("b", TODAY)], TODAY);
    expect(stack.map((h) => h.id)).toEqual(["a", "c"]);
  });

  it("a kept habit of yesterday is still in today's stack", () => {
    expect(
      habitStack([habit("a")], [done("a", "2026-11-14")], TODAY)
    ).toHaveLength(1);
  });

  it("leaves out a per-week habit whose week is already met", () => {
    const checkins = [
      done("w", "2026-11-14"),
      done("w", "2026-11-13"),
      done("w", "2026-11-12"),
    ];
    expect(habitStack([habit("w", 3)], checkins, TODAY)).toHaveLength(0);
    expect(habitStack([habit("w", 4)], checkins, TODAY)).toHaveLength(1);
  });

  it("is empty when everything is kept", () => {
    const list = [habit("a"), habit("b")];
    const checkins = [done("a", TODAY), done("b", TODAY)];
    expect(habitStack(list, checkins, TODAY)).toEqual([]);
  });
});

describe("dayLevel", () => {
  it("colours a day by how many habits were kept", () => {
    expect(dayLevel(0, 4)).toBe(0);
    expect(dayLevel(1, 4)).toBe(1);
    expect(dayLevel(2, 4)).toBe(2);
    expect(dayLevel(3, 4)).toBe(2);
    expect(dayLevel(4, 4)).toBe(3);
    expect(dayLevel(1, 1)).toBe(3);
    expect(dayLevel(1, 0)).toBe(0);
  });
});

describe("monthGrid", () => {
  const ids = ["a", "b", "c", "d"];
  const checkins = [
    done("a", "2026-11-01"),
    done("a", "2026-11-02"),
    done("b", "2026-11-02"),
    done("a", "2026-11-03"),
    done("b", "2026-11-03"),
    done("c", "2026-11-03"),
    done("d", "2026-11-03"),
    done("a", "2026-10-30"), // another month: not drawn
  ];
  const grid = monthGrid(TODAY, ids, checkins);
  const at = (date: string) => grid.cells.find((c) => c.date === date)!;

  it("is this month, Monday first: the 1st of Nov 2026 is a Sunday", () => {
    expect(grid.key).toBe("2026-11");
    expect(grid.cells).toHaveLength(30);
    expect(grid.lead).toBe(6);
  });

  it("colours each day by the share of habits kept", () => {
    expect(at("2026-11-01").level).toBe(1); // 1 of 4
    expect(at("2026-11-02").level).toBe(2); // 2 of 4
    expect(at("2026-11-03").level).toBe(3); // 4 of 4
    expect(at("2026-11-04").level).toBe(0); // none
    expect(at("2026-11-03").kept).toBe(4);
  });

  it("marks today and leaves the days to come without a level", () => {
    expect(at(TODAY).today).toBe(true);
    expect(at(TODAY).level).toBe(0);
    expect(at("2026-11-16").level).toBeNull();
    expect(at("2026-11-30").level).toBeNull();
  });

  it("a month that starts on a Monday has no lead", () => {
    expect(monthGrid("2026-06-10", ids, []).lead).toBe(0); // 1 June 2026
  });

  it("names a day for a screen reader", () => {
    expect(cellLabel(at("2026-11-02"), 4)).toBe("2: 2 of 4 habits");
    expect(cellLabel(at("2026-11-20"), 4)).toBe("20: not yet");
    expect(cellLabel({ ...at("2026-11-02"), kept: 1, level: 3 }, 1)).toBe(
      "2: 1 of 1 habit"
    );
  });
});

describe("nextStep", () => {
  it("is the first open linked task", () => {
    const tasks = [
      { id: "t1", title: "Done one", status: "completed" },
      { id: "t2", title: "Draft the outline", status: "todo" },
      { id: "t3", title: "Later", status: "in_progress" },
    ];
    expect(nextStep(tasks)).toEqual({ id: "t2", title: "Draft the outline" });
  });

  it("is null with no tasks, or when all are done", () => {
    expect(nextStep(undefined)).toBeNull();
    expect(nextStep([])).toBeNull();
    expect(
      nextStep([{ id: "t1", title: "x", status: "completed" }])
    ).toBeNull();
  });
});

describe("goalRisk", () => {
  const goal = (over: Partial<GoalView> & { percent?: number | null }) => {
    const { percent = null, ...rest } = over;
    return {
      status: "active",
      deadline: null,
      createdAt: "2026-10-01T00:00:00.000Z",
      progress: { percent } as GoalView["progress"],
      ...rest,
    } as Pick<GoalView, "status" | "deadline" | "createdAt" | "progress">;
  };

  it("says nothing without a deadline, or for a closed goal", () => {
    expect(goalRisk(goal({}), TODAY)).toBeNull();
    expect(
      goalRisk(goal({ status: "achieved", deadline: "2026-11-01" }), TODAY)
    ).toBeNull();
    expect(
      goalRisk(goal({ status: "dropped", deadline: "2026-11-01" }), TODAY)
    ).toBeNull();
  });

  it("is late past the deadline, unless it is complete", () => {
    expect(
      goalRisk(
        goal({ deadline: "2026-11-12T00:00:00.000Z", percent: 40 }),
        TODAY
      )
    ).toEqual({ level: "late", text: "Overdue by 3 days" });
    expect(
      goalRisk(
        goal({ deadline: "2026-11-14T00:00:00.000Z", percent: 40 }),
        TODAY
      )?.text
    ).toBe("Overdue by 1 day");
    expect(
      goalRisk(goal({ deadline: "2026-11-12", percent: 100 }), TODAY)
    ).toBeNull();
  });

  it("is behind when the time gone is well past the share done", () => {
    // 1 Oct → 30 Nov is 60 days; 45 days gone is 75%, 20% done
    const risk = goalRisk(
      goal({ deadline: "2026-11-30T00:00:00.000Z", percent: 20 }),
      TODAY
    );
    expect(risk?.level).toBe("behind");
    expect(risk?.text).toBe("Behind: 20% done, 75% of the time gone");
  });

  it("is on track when progress keeps up with time", () => {
    expect(
      goalRisk(
        goal({ deadline: "2026-11-30T00:00:00.000Z", percent: 70 }),
        TODAY
      )
    ).toBeNull();
  });

  it("is soon inside a week, and today", () => {
    expect(
      goalRisk(
        goal({ deadline: "2026-11-20T00:00:00.000Z", percent: 90 }),
        TODAY
      )
    ).toEqual({ level: "soon", text: "Due in 5 days" });
    expect(
      goalRisk(goal({ deadline: "2026-11-15T00:00:00.000Z" }), TODAY)?.text
    ).toBe("Due today");
  });

  it("a goal with nothing measuring it is only flagged by the calendar", () => {
    expect(
      goalRisk(goal({ deadline: "2026-12-20T00:00:00.000Z" }), TODAY)
    ).toBeNull();
  });
});
