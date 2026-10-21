import {
  defaultAnswers,
  onboardingAnswersSchema,
  planBlocker,
  planTasks,
  rankedAreas,
  startingAnswers,
} from "../answers";
import { CATALOG_TASKS } from "../catalog";

describe("onboardingAnswersSchema", () => {
  it("fills every default", () => {
    const a = defaultAnswers();
    expect(a.workdays).toEqual([0, 1, 2, 3, 4]);
    expect(a.buffer).toBe(10);
    expect(a.reminders).toBe("5");
  });

  it("refuses unknown areas, tasks and odd hours", () => {
    expect(onboardingAnswersSchema.safeParse({ areas: ["nope"] }).success).toBe(
      false
    );
    expect(onboardingAnswersSchema.safeParse({ picks: ["x9"] }).success).toBe(
      false
    );
    expect(
      onboardingAnswersSchema.safeParse({ hours: { start: 9.1, end: 18 } })
        .success
    ).toBe(false);
    expect(onboardingAnswersSchema.safeParse({ maxBlock: 50 }).success).toBe(
      false
    );
  });

  it("has a catalog of 12 areas worth of tasks", () => {
    expect(CATALOG_TASKS.length).toBeGreaterThan(55);
  });
});

describe("planBlocker", () => {
  it("needs an area, a workday and real hours", () => {
    expect(planBlocker(defaultAnswers())).toMatch(/area/);
    const ok = startingAnswers();
    expect(planBlocker(ok)).toBeNull();
    expect(planBlocker({ ...ok, workdays: [] })).toMatch(/workday/);
    expect(planBlocker({ ...ok, hours: { start: 9, end: 11 } })).toMatch(
      /three hours/
    );
  });
});

describe("planTasks", () => {
  it("applies repeat overrides, drops off tasks and adds rituals", () => {
    const a = {
      ...startingAnswers(),
      reps: { fitness0: 5, work0: 0 },
      own: [
        { id: "own1", area: "work", title: "Call", minutes: 15, rep: 3 },
        { id: "own2", area: "money", title: "Gone", minutes: 15, rep: 1 },
      ],
    };
    const t = planTasks(a);
    expect(t.find((x) => x.id === "fitness0")?.rep).toBe(5);
    expect(t.find((x) => x.id === "work0")).toBeUndefined();
    expect(t.find((x) => x.id === "own1")?.rep).toBe(3);
    expect(t.find((x) => x.id === "own2")).toBeUndefined();
    expect(t.find((x) => x.id === "fix-review")?.ritual).toBe(true);
  });

  it("keeps the order tapped, then the order picked", () => {
    const a = { ...startingAnswers(), rank: ["language"] };
    expect(rankedAreas(a)).toEqual(["language", "work", "fitness"]);
  });
});
