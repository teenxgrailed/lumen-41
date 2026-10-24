import { startingAnswers } from "../answers";
import { areaById } from "../catalog";
import { SAMPLE_EVENTS, nextWeekStart, planWeek } from "../plan";

const TZ = "Europe/Berlin";
/* Wednesday 21 Oct 2026: the planned week is Monday 26 Oct to Sunday 1 Nov. */
const NOW = new Date("2026-10-21T10:00:00Z");

const base = () => ({
  answers: startingAnswers(),
  events: null,
  timeZone: TZ,
  now: NOW,
});

describe("nextWeekStart", () => {
  it("is the Monday after this week, at midnight in the zone", () => {
    expect(nextWeekStart(NOW, TZ).toISOString()).toBe(
      "2026-10-25T23:00:00.000Z"
    );
  });

  it("from a Monday still plans the week after", () => {
    const monday = new Date("2026-10-26T08:00:00Z");
    expect(nextWeekStart(monday, TZ).toISOString()).toBe(
      "2026-11-01T23:00:00.000Z"
    );
  });
});

describe("planWeek", () => {
  it("runs the engine on the starting answers and places tasks", () => {
    const plan = planWeek(base());
    expect(plan.weekStart).toBe("2026-10-26");
    expect(plan.source).toBe("sample");
    expect(plan.placed.length).toBeGreaterThan(5);
    expect(plan.steps).toHaveLength(7);
    expect(plan.stats.eventCount).toBe(SAMPLE_EVENTS.length);
  });

  it("never overlaps a calendar event or lunch, and stays in work hours", () => {
    const plan = planWeek(base());
    for (const p of plan.placed) {
      for (const e of plan.events.filter((x) => x.day === p.day)) {
        expect(p.start < e.end && p.end > e.start).toBe(false);
      }
      expect(p.start).toBeGreaterThanOrEqual(9);
      if (![5, 6].includes(p.day)) expect(p.end).toBeLessThanOrEqual(18);
      if (p.start < 13 && p.end > 12) {
        // Lunch is kept free on every day that has it.
        expect(p.start >= 13 || p.end <= 12).toBe(true);
      }
    }
  });

  it("keeps work areas on workdays and lets life areas use days off", () => {
    const plan = planWeek({
      ...base(),
      answers: {
        ...startingAnswers(),
        areas: ["work", "fitness"],
        picks: ["work3", "fitness0", "fitness1"],
        reps: { fitness0: 7 },
      },
    });
    const kind = (area: string) => areaById(area)?.kind;
    for (const p of plan.placed) {
      if (kind(p.area) === "work") expect(p.day).toBeLessThan(5);
    }
    expect(plan.placed.some((p) => p.day >= 5)).toBe(true);
  });

  it("splits a task longer than the longest block and says how many", () => {
    const plan = planWeek({
      ...base(),
      answers: { ...startingAnswers(), maxBlock: 45 },
    });
    const parts = plan.placed.filter((p) => p.part);
    expect(parts.length).toBeGreaterThan(0);
    expect(Math.max(...plan.placed.map((p) => p.minutes))).toBeLessThanOrEqual(
      45
    );
    expect(plan.stats.splitTasks).toBeGreaterThan(0);
    expect(plan.steps[4][1]).toContain("split into parts");
  });

  it("spreads a repeat over different days when there is room, and says so truthfully", () => {
    const roomy = planWeek({
      ...base(),
      answers: {
        ...startingAnswers(),
        areas: ["fitness"],
        picks: ["fitness0"],
        rituals: [],
      },
    });
    expect(roomy.stats.maxRepeatPerDay).toBe(1);
    expect(roomy.steps[5][1]).toContain("never twice a day");
    const crowded = planWeek(base());
    expect(crowded.steps[5][1].includes("never twice a day")).toBe(
      crowded.stats.maxRepeatPerDay <= 1
    );
  });

  it("places everything the starting answers ask for", () => {
    expect(planWeek(base()).left).toEqual([]);
  });

  it("reports numbers that match the placed blocks", () => {
    const plan = planWeek(base());
    const minutes = plan.placed.reduce((s, p) => s + p.minutes, 0);
    expect(plan.stats.planned).toBeCloseTo(minutes / 60, 5);
    expect(plan.stats.freeAfter).toBeLessThan(plan.stats.freeBefore);
    expect(plan.steps[6][1]).toMatch(/placed/);
    expect(plan.steps[6][0]).toBe(`Placing ${plan.stats.instances} tasks`);
  });

  it("a different seed moves where repeats land", () => {
    const a = planWeek({ ...base(), seed: 0 });
    const b = planWeek({ ...base(), seed: 3 });
    const sig = (p: typeof a) => p.placed.map((x) => `${x.id}@${x.day}`).join();
    expect(sig(a)).not.toBe(sig(b));
  });

  it("uses the real events it is given instead of the sample", () => {
    const plan = planWeek({
      ...base(),
      events: [{ day: 0, start: 9, end: 18, title: "Offsite" }],
      calendarName: "Google Calendar",
    });
    expect(plan.source).toBe("calendar");
    expect(plan.steps[0][1]).toBe("1 events next week from Google Calendar");
    expect(plan.placed.filter((p) => p.day === 0 && p.area === "work")).toEqual(
      []
    );
  });

  it("puts tasks that do not fit into 'wait for the week after'", () => {
    const plan = planWeek({
      ...base(),
      answers: {
        ...startingAnswers(),
        workdays: [0],
        weekends: false,
        hours: { start: 9, end: 12 },
      },
    });
    expect(plan.left.length).toBeGreaterThan(0);
    expect(plan.steps[6][1]).toContain("wait for the week after");
  });

  it("honours the priority order the person tapped", () => {
    const answers = {
      ...startingAnswers(),
      areas: ["work", "fitness"],
      picks: ["work0", "fitness1"],
      workdays: [0],
      weekends: false,
      hours: { start: 9, end: 11 },
      lunch: false,
      buffer: 0,
    };
    const first = (rank: string[]) =>
      planWeek({ ...base(), answers: { ...answers, rank } }).placed[0]?.area;
    expect(first(["fitness", "work"])).toBe("fitness");
    expect(first(["work", "fitness"])).toBe("work");
  });
});
