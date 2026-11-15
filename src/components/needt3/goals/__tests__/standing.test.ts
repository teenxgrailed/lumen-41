import type { GoalView } from "@/lib/goals";

import { goalPlan, goalStanding, inNextWeek, sortByRisk } from "../standing";

const TODAY = "2026-11-15";

const goal = (
  id: string,
  fields: {
    deadline?: string | null;
    createdAt?: string;
    percent?: number | null;
    status?: GoalView["status"];
  } = {}
) =>
  ({
    id,
    status: fields.status ?? "active",
    deadline: fields.deadline ?? null,
    createdAt: fields.createdAt ?? "2026-10-01T00:00:00.000Z",
    progress: { percent: fields.percent ?? null },
  }) as unknown as GoalView;

describe("goalStanding", () => {
  it("is at risk when the deadline is within 30 days and progress lags", () => {
    const s = goalStanding(
      goal("a", {
        deadline: "2026-11-25T00:00:00.000Z",
        createdAt: "2026-10-16T00:00:00.000Z",
        percent: 20,
      }),
      TODAY
    );
    expect(s.atRisk).toBe(true);
    expect(s.daysLeft).toBe(10);
    expect(s.label).toBe("At risk · 10d left");
  });

  it("is on track when progress keeps up with the time gone", () => {
    const s = goalStanding(
      goal("a", {
        deadline: "2026-11-25T00:00:00.000Z",
        createdAt: "2026-10-16T00:00:00.000Z",
        percent: 80,
      }),
      TODAY
    );
    expect(s.atRisk).toBe(false);
    expect(s.label).toBe("On track");
  });

  it("is on track beyond 30 days, however far behind", () => {
    const s = goalStanding(
      goal("a", {
        deadline: "2027-02-01T00:00:00.000Z",
        createdAt: "2026-10-01T00:00:00.000Z",
        percent: 0,
      }),
      TODAY
    );
    expect(s.atRisk).toBe(false);
  });

  it("reads a goal past its deadline as at risk, overdue", () => {
    const s = goalStanding(
      goal("a", { deadline: "2026-11-10T00:00:00.000Z", percent: 50 }),
      TODAY
    );
    expect(s.atRisk).toBe(true);
    expect(s.label).toBe("At risk · overdue");
  });

  it("says nothing without a deadline, or without progress to compare", () => {
    expect(goalStanding(goal("a", { percent: 50 }), TODAY).label).toBeNull();
    expect(
      goalStanding(goal("a", { deadline: "2026-12-30T00:00:00.000Z" }), TODAY)
        .label
    ).toBeNull();
  });

  it("reads a deadline that falls today as on track when keeping up", () => {
    const s = goalStanding(
      goal("a", { deadline: "2026-11-15T00:00:00.000Z", percent: 99 }),
      TODAY
    );
    expect(s.daysLeft).toBe(0);
    expect(s.label).toBe("On track");
  });

  it("reads a deadline that falls today as at risk, 0d left, when behind", () => {
    const s = goalStanding(
      goal("a", { deadline: "2026-11-15T00:00:00.000Z", percent: 10 }),
      TODAY
    );
    expect(s.atRisk).toBe(true);
    expect(s.label).toBe("At risk · 0d left");
  });
});

describe("sortByRisk", () => {
  const late = (id: string, deadline: string) =>
    goal(id, {
      deadline,
      createdAt: "2026-10-01T00:00:00.000Z",
      percent: 10,
    });

  it("leads with at-risk goals, the soonest deadline first, the rest in order", () => {
    const order = sortByRisk(
      [
        goal("calm-1"),
        late("later", "2026-12-10T00:00:00.000Z"),
        goal("calm-2"),
        late("sooner", "2026-11-20T00:00:00.000Z"),
      ],
      TODAY
    ).map((g) => g.id);
    expect(order).toEqual(["sooner", "later", "calm-1", "calm-2"]);
  });
});

describe("inNextWeek", () => {
  it("covers today and the six days after it", () => {
    expect(inNextWeek("2026-11-15", TODAY)).toBe(true);
    expect(inNextWeek("2026-11-21", TODAY)).toBe(true);
    expect(inNextWeek("2026-11-22", TODAY)).toBe(false);
    expect(inNextWeek("2026-11-14", TODAY)).toBe(false);
    expect(inNextWeek(null, TODAY)).toBe(false);
  });
});

describe("goalPlan", () => {
  const byId = new Map([
    ["due", { dueDate: "2026-11-17", scheduledStart: null, repeat: null }],
    ["far", { dueDate: "2026-12-30", scheduledStart: null, repeat: null }],
    [
      "placed",
      {
        dueDate: null,
        scheduledStart: "2026-11-16T10:00",
        repeat: null,
      },
    ],
    ["none", { dueDate: null, scheduledStart: null, repeat: null }],
  ]);
  const open = (id: string) => ({ id, status: "todo" });

  it("takes a step that only has a due date as already on that day", () => {
    const plan = goalPlan([open("due")], { id: "due" }, byId, TODAY);
    expect(plan.stepDay).toBe("2026-11-17");
    expect(plan.planned).toBe(true);
  });

  it("reads a scheduled block as the day too", () => {
    expect(goalPlan([open("placed")], { id: "placed" }, byId, TODAY)).toEqual({
      stepDay: "2026-11-16",
      planned: true,
    });
  });

  it("has no day for an unplaced step, and nothing planned", () => {
    expect(goalPlan([open("none")], { id: "none" }, byId, TODAY)).toEqual({
      stepDay: null,
      planned: false,
    });
  });

  it("does not count a far day or a finished task as planned", () => {
    expect(goalPlan([open("far")], { id: "far" }, byId, TODAY).planned).toBe(
      false
    );
    expect(
      goalPlan([{ id: "due", status: "completed" }], null, byId, TODAY).planned
    ).toBe(false);
  });
});
