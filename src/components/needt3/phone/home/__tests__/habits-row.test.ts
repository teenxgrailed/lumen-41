import type { V3Habit } from "@/lib/needt3/map";

import { habitDots, habitMark } from "../habits-row";

const TODAY = "2026-09-01";

const habit = (over: Partial<V3Habit> = {}): V3Habit => ({
  id: "h1",
  title: "stretch",
  projectId: null,
  color: null,
  icon: null,
  schedule: { time: null, perWeek: null },
  archivedAt: null,
  ...over,
});

describe("habitMark", () => {
  it("uses an emoji icon, else the first letter of the title", () => {
    expect(habitMark(habit({ icon: "\u{1F9D8} yoga" }))).toBe("\u{1F9D8}");
    expect(habitMark(habit({ icon: "yoga" }))).toBe("S");
    expect(habitMark(habit({ icon: null, title: "  read" }))).toBe("R");
  });
});

describe("habitDots", () => {
  const checkin = (date: string) => ({ habitId: "h1", date, done: true });

  it("is one dot per live habit, and nothing without habits", () => {
    expect(habitDots([], [], TODAY, [])).toEqual([]);
    const dots = habitDots(
      [habit(), habit({ id: "h2", archivedAt: "2026-08-01T00:00:00Z" })],
      [],
      TODAY,
      []
    );
    expect(dots.map((d) => d.id)).toEqual(["h1"]);
  });

  it("marks today and rings the week against the weekly target", () => {
    const dots = habitDots(
      [habit({ schedule: { time: null, perWeek: 4 } })],
      [checkin(TODAY), checkin("2026-08-31")],
      TODAY,
      []
    );
    expect(dots[0]?.on).toBe(true);
    expect(dots[0]?.frac).toBe(0.5);
    expect(dots[0]?.say).toContain("tap to undo");
  });

  it("caps the ring at a full week and falls back to seven days", () => {
    const week = ["2026-09-01", "2026-08-31", "2026-08-30"].map(checkin);
    expect(
      habitDots(
        [habit({ schedule: { time: null, perWeek: 2 } })],
        week,
        TODAY,
        []
      )[0]?.frac
    ).toBe(1);
    expect(habitDots([habit()], week, TODAY, [])[0]?.frac).toBeCloseTo(3 / 7);
  });

  it("takes the habit's colour, else the project's", () => {
    expect(habitDots([habit({ color: "#f00" })], [], TODAY, [])[0]?.hue).toBe(
      "#f00"
    );
    const project = { id: "p1", color: "#0a0" } as never;
    expect(
      habitDots([habit({ projectId: "p1" })], [], TODAY, [project])[0]?.hue
    ).toBe("#0a0");
  });
});
