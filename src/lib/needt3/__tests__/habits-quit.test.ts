import {
  type HabitEvent,
  TALKED_NOTE,
  assistantContext,
  formatSpan,
  milestoneView,
  pullLog,
  pullsToday,
  readQuitGate,
  runParts,
  summaryMilestone,
  urgeMap,
} from "@/lib/needt3/habits-quit";

const now = new Date("2026-11-04T23:50:00Z");
const ev = (
  id: string,
  type: HabitEvent["type"],
  at: string,
  extra: Partial<HabitEvent> = {}
): HabitEvent => ({
  id,
  habitId: "h",
  type,
  at,
  tag: null,
  intensity: null,
  note: null,
  ...extra,
});

describe("the run", () => {
  it("counts days, hours and minutes since the start", () => {
    expect(runParts("2026-10-23T09:10:00Z", now)).toEqual({
      days: 12,
      hours: 14,
      minutes: 40,
    });
  });

  it("is zero without a start and never negative", () => {
    expect(runParts(null, now)).toEqual({ days: 0, hours: 0, minutes: 0 });
    expect(runParts("2026-11-05T00:00:00Z", now).days).toBe(0);
  });

  it("says what is left in the two largest units", () => {
    expect(formatSpan(44 * 3_600_000)).toBe("1 d 20 h");
    expect(formatSpan(21 * 3_600_000 + 40 * 60_000)).toBe("21 h 40 m");
    expect(formatSpan(12 * 60_000)).toBe("12 m");
  });
});

describe("milestones", () => {
  it("stands between the last and the next step", () => {
    const ms = milestoneView("2026-10-23T23:50:00Z", now);
    expect(ms).toMatchObject({ prev: 7, next: 14 });
    expect(ms.pct).toBe(71);
    expect(ms.left).toBe("in 2 d 0 h");
  });

  it("aims at the first day before it", () => {
    expect(milestoneView(now, now)).toMatchObject({ prev: 0, next: 1, pct: 0 });
  });

  it("has nothing next after a year", () => {
    expect(milestoneView("2025-01-01T00:00:00Z", now)).toMatchObject({
      next: null,
      pct: 100,
    });
  });
});

describe("the gate", () => {
  it("is off unless the server says on or upgrade", () => {
    expect(readQuitGate("on")).toBe("on");
    expect(readQuitGate("upgrade")).toBe("upgrade");
    expect(readQuitGate(undefined)).toBe("off");
    expect(readQuitGate(true)).toBe("off");
  });
});

describe("the pull log", () => {
  const events = [
    ev("u1", "URGE", "2026-11-04T23:40:00Z", {
      tag: "phone_in_bed",
      intensity: 4,
    }),
    ev("r1", "RESISTED", "2026-11-04T23:45:00Z"),
    ev("u2", "URGE", "2026-11-04T16:05:00Z"),
    ev("r2", "RESISTED", "2026-11-04T16:10:00Z", {
      tag: "stress",
      intensity: 3,
    }),
    ev("u3", "URGE", "2026-11-02T22:10:00Z", { note: TALKED_NOTE }),
    ev("u4", "URGE", "2026-11-01T13:30:00Z"),
    ev("s4", "RELAPSE", "2026-11-01T14:00:00Z"),
    ev("old", "URGE", "2026-10-20T10:00:00Z"),
  ];

  it("lists the last seven days of pulls, newest first, with how each ended", () => {
    expect(pullLog(events, now, "UTC")).toEqual([
      {
        id: "u1",
        when: "23:40",
        tag: "Phone in bed",
        strength: 4,
        outcome: "Held",
      },
      { id: "u2", when: "16:05", tag: "Stress", strength: 3, outcome: "Held" },
      {
        id: "u3",
        when: "Mon 22:10",
        tag: null,
        strength: null,
        outcome: "Talked it through",
      },
      {
        id: "u4",
        when: "Sun 13:30",
        tag: null,
        strength: null,
        outcome: "Slipped",
      },
    ]);
  });

  it("counts today's pulls for the assistant", () => {
    expect(pullsToday(events, now, "UTC")).toBe(2);
  });
});

describe("the urge map", () => {
  it("stays hidden below five pulls", () => {
    const map = urgeMap([ev("a", "URGE", "2026-11-04T21:00:00Z")], now, "UTC");
    expect(map.total).toBe(1);
    expect(map.note).toBeNull();
  });

  it("lays pulls on weekday by two-hour block and names when it pulls", () => {
    const events = [
      // Thursday and Friday evenings, and one Monday morning.
      ...[
        "2026-10-29T21:00:00Z",
        "2026-10-29T22:30:00Z",
        "2026-10-30T21:10:00Z",
        "2026-10-30T20:40:00Z",
      ].map((at, i) => ev(`e${i}`, "URGE", at)),
      ev("m", "URGE", "2026-11-02T08:00:00Z"),
      ev("held", "RESISTED", "2026-11-02T08:05:00Z"),
    ];
    const map = urgeMap(events, now, "UTC");
    expect(map.total).toBe(5);
    expect(map.levels).toHaveLength(7);
    expect(map.levels[4][10]).toBe(4); // Friday 20:00–22:00, the peak
    expect(map.levels[3][10]).toBe(2); // Thursday, half of it
    expect(map.levels[0][4]).toBeGreaterThan(0); // Monday 08:00
    expect(map.levels.flat().every((v) => v >= 0 && v <= 4)).toBe(true);
    expect(map.note).toBe(
      "Most pulls come after 20:00, hardest on Thursdays and Fridays."
    );
  });
});

describe("the assistant's opening line", () => {
  it("carries the context and the person's reason, with no shame words", () => {
    const line = assistantContext({
      title: "Smoking",
      run: { days: 12, hours: 4, minutes: 0 },
      tag: "phone_in_bed",
      strength: 4,
      pullsToday: 3,
      reason: "I want to run the 10k in spring without stopping.",
      time: "23:40",
    });
    expect(line).toContain("Smoking is pulling at me.");
    expect(line).toContain("12 d 4 h without");
    expect(line).toContain(
      "the 3rd pull today (strength 4 of 5, phone in bed)"
    );
    expect(line).toContain(
      "“I want to run the 10k in spring without stopping.”"
    );
    expect(line).not.toMatch(/relapse|fail|lost|streak/i);
    expect(line).not.toContain("!");
  });
});

describe("one outcome per pull", () => {
  it("gives a held pull to the latest open pull, not to both", () => {
    const rows = pullLog(
      [
        ev("a", "URGE", "2026-11-04T20:00:00Z"),
        ev("b", "URGE", "2026-11-04T21:00:00Z"),
        ev("r", "RESISTED", "2026-11-04T21:05:00Z"),
      ],
      now,
      "UTC"
    );
    expect(rows.map((r) => [r.id, r.outcome])).toEqual([
      ["b", "Held"],
      ["a", null],
    ]);
  });
});

describe("milestones from the summary", () => {
  it("counts calendar days as the server does", () => {
    expect(
      summaryMilestone({
        currentStreak: 5,
        nextMilestone: { days: 7, daysLeft: 2 },
      })
    ).toEqual({ next: 7, prev: 3, pct: 50, left: "in 2 days" });
    expect(
      summaryMilestone({
        currentStreak: 6,
        nextMilestone: { days: 7, daysLeft: 1 },
      }).left
    ).toBe("in 1 day");
    expect(
      summaryMilestone({ currentStreak: 400, nextMilestone: null })
    ).toMatchObject({ next: null, pct: 100 });
  });
});
