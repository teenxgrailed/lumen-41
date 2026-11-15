import {
  firstReplanTarget,
  freeGapAfter,
  overlaps,
} from "../first-replan-demo";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));

describe("firstReplanTarget", () => {
  const d = (iso: string) => new Date(iso);
  // 08:30 task, 08:45 to 09:30 locked meeting (Zurich = UTC+1), the sample
  // brief at 09:30 for 1 h 30: the move must not land on it.
  const demoRows = [
    {
      id: "task",
      title: "Demo: write the weekly plan",
      scheduleLocked: false,
      scheduledStart: d("2026-11-18T07:30:00Z"),
      scheduledEnd: d("2026-11-18T08:30:00Z"),
    },
    {
      id: "meeting",
      title: "Demo: sync with Alex",
      scheduleLocked: true,
      scheduledStart: d("2026-11-18T07:45:00Z"),
      scheduledEnd: d("2026-11-18T08:30:00Z"),
    },
  ];
  const brief = {
    scheduledStart: d("2026-11-18T08:30:00Z"),
    scheduledEnd: d("2026-11-18T10:00:00Z"),
  };
  const db = (events: { start: Date; end: Date }[] = []) =>
    ({
      task: {
        findMany: async ({ where }: { where: { source?: string } }) =>
          where.source ? demoRows : [brief, ...demoRows],
      },
      autoScheduleSettings: {
        findUnique: async () => ({
          workHourStart: 8,
          workHourEnd: 20,
          workDays: "[0,1,2,3,4,5,6]",
        }),
      },
      userSettings: {
        findUnique: async () => ({ timeZone: "Europe/Zurich" }),
      },
      calendarEvent: { findMany: async () => events },
    }) as never;

  it("moves the task after the meeting and clear of the brief", async () => {
    const target = await firstReplanTarget(
      "u1",
      d("2026-11-18T07:10:00Z"),
      db()
    );
    expect(target?.taskId).toBe("task");
    expect(target!.start.getTime()).toBeGreaterThanOrEqual(
      d("2026-11-18T10:00:00Z").getTime()
    );
    expect(
      overlaps(target!, {
        start: brief.scheduledStart,
        end: brief.scheduledEnd,
      })
    ).toBe(false);
  });

  it("is null once the demo no longer overlaps", async () => {
    demoRows[0].scheduledStart = d("2026-11-18T09:00:00Z");
    demoRows[0].scheduledEnd = d("2026-11-18T10:00:00Z");
    expect(
      await firstReplanTarget("u1", d("2026-11-18T07:10:00Z"), db())
    ).toBeNull();
  });
});

describe("freeGapAfter", () => {
  const zone = "Europe/Zurich";
  const at = (hhmm: string, day = "2026-11-18") =>
    new Date(`${day}T${hhmm}:00+01:00`);
  const hours = { startHour: 8, endHour: 20 };
  const now = at("08:10");
  // The meeting ends 09:30, so the task may start from 09:45.
  const after = at("09:30");

  it("takes the first slot after the meeting buffer when the day is free", () => {
    const gap = freeGapAfter({ after, now, zone, hours, busy: [] })!;
    expect(gap.start).toEqual(at("09:45"));
    expect(gap.end).toEqual(at("10:45"));
  });

  it("skips another task that sits right after the meeting (the sample brief at 09:30)", () => {
    const busy = [{ start: at("09:30"), end: at("11:00") }];
    const gap = freeGapAfter({ after, now, zone, hours, busy })!;
    expect(gap.start.getTime()).toBeGreaterThanOrEqual(at("11:00").getTime());
    expect(overlaps(gap, busy[0])).toBe(false);
  });

  it("finds a gap at least as long as the task, between other tasks", () => {
    const busy = [
      { start: at("09:30"), end: at("11:00") },
      { start: at("11:30"), end: at("12:15") }, // 30 min gap before: too short
      { start: at("14:00"), end: at("14:30") }, // 12:15 to 14:00 fits
    ];
    const gap = freeGapAfter({ after, now, zone, hours, busy })!;
    expect(gap.start).toEqual(at("12:15"));
    expect(gap.end).toEqual(at("13:15"));
    for (const b of busy) expect(overlaps(gap, b)).toBe(false);
  });

  it("stays inside work hours: a late gap that would pass the close moves to the next day", () => {
    const busy = [{ start: at("09:30"), end: at("19:30") }];
    const gap = freeGapAfter({ after, now, zone, hours, busy })!;
    expect(gap.start).toEqual(at("08:00", "2026-11-19"));
    expect(gap.end.getTime() - gap.start.getTime()).toBe(3_600_000);
  });

  it("never starts before now", () => {
    const gap = freeGapAfter({
      after: at("07:00"),
      now: at("10:07"),
      zone,
      hours,
      busy: [],
    })!;
    expect(gap.start.getTime()).toBeGreaterThan(at("10:07").getTime());
  });

  it("skips days off", () => {
    // Friday: the day is full, Saturday and Sunday are off, so Monday.
    const gap = freeGapAfter({
      after: at("09:30", "2026-11-20"),
      now: at("08:10", "2026-11-20"),
      zone,
      hours: { startHour: 8, endHour: 20, days: [1, 2, 3, 4, 5] },
      busy: [
        { start: at("09:30", "2026-11-20"), end: at("20:00", "2026-11-20") },
      ],
    })!;
    expect(gap.start).toEqual(at("08:00", "2026-11-23"));
  });
});
