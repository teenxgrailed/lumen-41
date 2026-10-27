import { goalAreaLabel, goalProgressLabel, stripGoalPrefix } from "@/lib/goals";

import { lastCheckInSlot } from "../check-in";
import { computeGoalProgress, manualRatio } from "../progress";

const blank = {
  status: "active",
  targetValue: null,
  currentValue: null,
  manualPercent: null,
  unit: null,
};

describe("computeGoalProgress", () => {
  it("prefers linked tasks over everything else", () => {
    const progress = computeGoalProgress(
      { ...blank, manualPercent: 90 },
      { done: 1, total: 4 },
      [
        {
          status: "active",
          progress: computeGoalProgress(blank, { done: 0, total: 0 }),
        },
      ]
    );
    expect(progress).toMatchObject({
      source: "tasks",
      ratio: 0.25,
      percent: 25,
      done: 1,
      total: 4,
    });
  });

  it("uses current / target, clamped, before a percentage", () => {
    expect(
      computeGoalProgress(
        {
          ...blank,
          targetValue: 2500,
          currentValue: 2500,
          unit: "CHF",
          manualPercent: 10,
        },
        { done: 0, total: 0 }
      )
    ).toMatchObject({ source: "manual", percent: 100, unit: "CHF" });
    expect(
      manualRatio({ targetValue: 100, currentValue: 150, manualPercent: null })
    ).toBe(1);
    expect(
      manualRatio({ targetValue: 100, currentValue: -5, manualPercent: null })
    ).toBe(0);
    expect(
      manualRatio({ targetValue: 0, currentValue: 5, manualPercent: 30 })
    ).toBe(0.3);
    expect(
      manualRatio({ targetValue: 100, currentValue: null, manualPercent: null })
    ).toBeNull();
  });

  it("averages subgoals: dropped left out, achieved as complete, none as zero", () => {
    const none = computeGoalProgress(blank, { done: 0, total: 0 });
    const half = computeGoalProgress(
      { ...blank, manualPercent: 50 },
      { done: 0, total: 0 }
    );
    const progress = computeGoalProgress(blank, { done: 0, total: 0 }, [
      { status: "active", progress: half },
      { status: "active", progress: none },
      { status: "achieved", progress: none },
      { status: "dropped", progress: half },
    ]);
    expect(progress).toMatchObject({ source: "subgoals", percent: 50 });
  });

  it("lets the parent's own manual value win over its subgoals", () => {
    const full = computeGoalProgress(
      { ...blank, manualPercent: 100 },
      { done: 0, total: 0 }
    );
    expect(
      computeGoalProgress(
        { ...blank, manualPercent: 20 },
        { done: 0, total: 0 },
        [{ status: "active", progress: full }]
      )
    ).toMatchObject({ source: "manual", percent: 20 });
  });

  it("has nothing to say without tasks, value or subgoals; achieved is complete", () => {
    expect(computeGoalProgress(blank, { done: 0, total: 0 })).toMatchObject({
      source: "none",
      ratio: null,
      percent: null,
    });
    expect(
      computeGoalProgress(
        { ...blank, status: "achieved" },
        { done: 0, total: 0 }
      )
    ).toMatchObject({ source: "none", ratio: 1, percent: 100 });
  });
});

describe("goal labels", () => {
  it("strips a GOAL: prefix and keeps a title that is only the prefix", () => {
    expect(stripGoalPrefix("GOAL: Save 2 500 CHF")).toBe("Save 2 500 CHF");
    expect(stripGoalPrefix("goal - Learn German")).toBe("Learn German");
    expect(stripGoalPrefix("Goalkeeper training")).toBe("Goalkeeper training");
  });

  it("labels progress by its source", () => {
    expect(
      goalProgressLabel(
        computeGoalProgress(
          { ...blank, targetValue: 2500, currentValue: 1000, unit: "CHF" },
          { done: 0, total: 0 }
        )
      )
    ).toBe("1 000 / 2 500 CHF");
    expect(
      goalProgressLabel(computeGoalProgress(blank, { done: 3, total: 7 }))
    ).toBe("3 of 7 tasks");
    expect(
      goalProgressLabel(computeGoalProgress(blank, { done: 0, total: 0 }))
    ).toBeNull();
    expect(goalAreaLabel("money")).toBe("Money");
    expect(goalAreaLabel("Side business")).toBe("Side business");
  });
});

describe("lastCheckInSlot", () => {
  const zone = "Europe/Zurich";

  it("is this Monday 09:00 once it has passed", () => {
    // Tuesday 2026-10-27 10:00 in Zurich (UTC+1 after the clock change).
    const slot = lastCheckInSlot(
      new Date("2026-10-27T09:00:00.000Z"),
      zone,
      1,
      9
    );
    expect(slot.dayKey).toBe("2026-10-26");
    expect(slot.at.toISOString()).toBe("2026-10-26T08:00:00.000Z");
  });

  it("is last week's Monday before 09:00 on a Monday", () => {
    const slot = lastCheckInSlot(
      new Date("2026-10-26T07:30:00.000Z"),
      zone,
      1,
      9
    );
    expect(slot.dayKey).toBe("2026-10-19");
  });

  it("is today at the hour itself", () => {
    const slot = lastCheckInSlot(
      new Date("2026-10-26T08:00:00.000Z"),
      zone,
      1,
      9
    );
    expect(slot.dayKey).toBe("2026-10-26");
  });
});
