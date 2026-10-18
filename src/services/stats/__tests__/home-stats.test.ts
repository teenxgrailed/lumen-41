import { buildStats } from "../home-stats";

// 2026-09-01 is a Tuesday; the week ends there
const DAYS = [
  "2026-08-26",
  "2026-08-27",
  "2026-08-28",
  "2026-08-29",
  "2026-08-30",
  "2026-08-31",
  "2026-09-01",
];

const done = (iso: string, projectId: string | null = null) => ({
  completedAt: new Date(iso),
  projectId,
});

const base = {
  range: "week" as const,
  days: DAYS,
  timeZone: "UTC",
  sessions: [],
  projects: [{ id: "p1", name: "Launch", color: "#0a0" }],
};

describe("buildStats", () => {
  it("counts closed tasks per day, in the person's zone", () => {
    const s = buildStats({
      ...base,
      tasks: [
        done("2026-08-26T09:00:00Z"),
        done("2026-08-26T18:00:00Z"),
        done("2026-09-01T10:00:00Z"),
        done("2026-08-20T10:00:00Z"), // before the window
        { completedAt: null, projectId: null },
      ],
    });
    expect(s.days.map((d) => d.done)).toEqual([2, 0, 0, 0, 0, 0, 1]);
    expect(s.total).toBe(3);
    expect(s.from).toBe("2026-08-26");
    expect(s.to).toBe("2026-09-01");
  });

  it("puts a late-evening close on the person's day, not UTC's", () => {
    const s = buildStats({
      ...base,
      timeZone: "America/Los_Angeles",
      // 2026-08-27 02:30 UTC is still the 26th in Los Angeles
      tasks: [done("2026-08-27T02:30:00Z")],
    });
    expect(s.days[0]?.done).toBe(1);
    expect(s.days[1]?.done).toBe(0);
  });

  it("finds the best day (the latest of equals) and the best weekday", () => {
    const s = buildStats({
      ...base,
      tasks: [
        done("2026-08-27T09:00:00Z"),
        done("2026-08-27T10:00:00Z"),
        done("2026-09-01T09:00:00Z"),
        done("2026-09-01T10:00:00Z"),
      ],
    });
    expect(s.bestDay).toBe("2026-09-01");
    expect(s.bestWeekday).toBe(2); // Tuesday
    expect(s.byWeekday).toHaveLength(7);
    expect(s.byWeekday.find((w) => w.weekday === 4)?.done).toBe(2); // Thu
  });

  it("has no best day or weekday when nothing was closed", () => {
    const s = buildStats({ ...base, tasks: [] });
    expect(s.total).toBe(0);
    expect(s.bestDay).toBeNull();
    expect(s.bestWeekday).toBeNull();
    expect(s.byProject).toEqual([]);
  });

  it("groups by project, most first, with no-project named", () => {
    const s = buildStats({
      ...base,
      tasks: [
        done("2026-08-27T09:00:00Z", "p1"),
        done("2026-08-28T09:00:00Z"),
        done("2026-08-29T09:00:00Z"),
        done("2026-08-30T09:00:00Z", "gone"),
      ],
    });
    expect(s.byProject.map((p) => [p.name, p.done])).toEqual([
      ["No project", 2],
      ["Launch", 1],
      ["No project", 1],
    ]);
    expect(s.byProject[1]).toMatchObject({ projectId: "p1", color: "#0a0" });
  });

  it("sums focus minutes, and is null when no session was stored", () => {
    expect(buildStats({ ...base, tasks: [] }).focusMinutes).toBeNull();
    const s = buildStats({
      ...base,
      tasks: [],
      sessions: [
        { startedAt: new Date("2026-09-01T08:00:00Z"), elapsedMinutes: 25 },
        { startedAt: new Date("2026-09-01T10:00:00Z"), elapsedMinutes: 50 },
        { startedAt: new Date("2026-08-01T10:00:00Z"), elapsedMinutes: 99 },
        { startedAt: new Date("2026-08-30T10:00:00Z"), elapsedMinutes: 0 },
      ],
    });
    expect(s.focusMinutes).toBe(75);
    expect(s.focusSessions).toBe(2);
    expect(s.days[6]?.focusMinutes).toBe(75);
  });
});
