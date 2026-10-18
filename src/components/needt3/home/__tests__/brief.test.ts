import {
  type BriefFacts,
  briefFactsOf,
  hasBriefToSay,
  isMorning,
  shouldAskBrief,
} from "../brief";
import type { ScheduleItem } from "../derive";
import { TODAY, task } from "./fixtures";

const item = (over: Partial<ScheduleItem>): ScheduleItem => ({
  key: "e1",
  id: null,
  at: 10,
  len: 60,
  title: "Planning",
  event: true,
  done: false,
  projectId: null,
  ...over,
});

describe("isMorning", () => {
  it("is before noon", () => {
    expect(isMorning(7.5)).toBe(true);
    expect(isMorning(11.99)).toBe(true);
    expect(isMorning(12)).toBe(false);
  });
});

describe("briefFactsOf", () => {
  it("describes the day: open and done, overdue, free time, next event", () => {
    const open = [
      task({ title: "Write report" }),
      task({ title: "Call Anna" }),
    ];
    const done = task({ done: true, title: "Water plants" });
    const late = [
      task({ title: "Pay rent", dueDate: "2026-08-30" }),
      task({ title: "Renew visa", dueDate: "2026-08-31" }),
    ];
    const f = briefFactsOf({
      late,
      day: [...open, done],
      freeMinutes: 150,
      schedule: [
        item({ at: 8, title: "Gym" }),
        item({ at: 10, title: "Planning" }),
        item({ at: 11, event: false, title: "A task" }),
      ],
      nowHour: 9,
    });
    expect(f).toEqual({
      today: ["Write report", "Call Anna"],
      openToday: 2,
      doneToday: 1,
      overdue: ["Pay rent", "Renew visa"],
      overdueCount: 2,
      freeMinutes: 150,
      nextEvent: { title: "Planning", at: "10:00" },
    });
  });

  it("caps the lists and the titles", () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      task({ title: `T${i} ${"x".repeat(200)}` })
    );
    const f = briefFactsOf({
      late: many,
      day: many,
      freeMinutes: null,
      schedule: [],
      nowHour: 8,
    });
    expect(f.today).toHaveLength(6);
    expect(f.overdue).toHaveLength(3);
    expect(f.overdueCount).toBe(9);
    expect(f.today[0]?.length).toBeLessThanOrEqual(120);
    expect(f.nextEvent).toBeNull();
    expect(TODAY).toBeTruthy();
  });
});

describe("shouldAskBrief", () => {
  const facts = (over: Partial<BriefFacts> = {}): BriefFacts => ({
    today: ["A"],
    openToday: 1,
    doneToday: 0,
    overdue: [],
    overdueCount: 0,
    freeMinutes: 60,
    nextEvent: null,
    ...over,
  });
  const ok = {
    pro: true as boolean | null,
    morning: true,
    aiAvailable: true as boolean | undefined,
    facts: facts(),
  };

  it("asks a paid person, in the morning, when AI can answer", () => {
    expect(shouldAskBrief(ok)).toBe(true);
  });
  it("never asks for Free or an unknown plan", () => {
    expect(shouldAskBrief({ ...ok, pro: false })).toBe(false);
    expect(shouldAskBrief({ ...ok, pro: null })).toBe(false);
  });
  it("does not ask after the morning, or when AI is not configured or unknown", () => {
    expect(shouldAskBrief({ ...ok, morning: false })).toBe(false);
    expect(shouldAskBrief({ ...ok, aiAvailable: false })).toBe(false);
    expect(shouldAskBrief({ ...ok, aiAvailable: undefined })).toBe(false);
  });
  it("does not ask for a day with nothing in it", () => {
    const empty = facts({ today: [], openToday: 0 });
    expect(hasBriefToSay(empty)).toBe(false);
    expect(shouldAskBrief({ ...ok, facts: empty })).toBe(false);
    expect(
      shouldAskBrief({ ...ok, facts: facts({ openToday: 0, overdueCount: 2 }) })
    ).toBe(true);
  });
});
