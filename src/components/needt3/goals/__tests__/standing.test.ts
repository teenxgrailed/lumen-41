import type { GoalView } from "@/lib/goals";

import { goalStanding, inNextWeek, sortByRisk } from "../standing";

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

  it("has no standing against time without a deadline", () => {
    expect(goalStanding(goal("a"), TODAY).atRisk).toBe(false);
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
