import { FIRST_REPLAN_DEMO_SOURCE } from "@/lib/onboarding/first-replan";

import {
  clearFirstReplanDemo,
  demoSlot,
  firstReplanState,
  hoursFromSettings,
  overlaps,
  seedFirstReplanDemo,
} from "../first-replan-demo";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));

type Row = Record<string, unknown> & { id: string };

/* An in-memory stand-in for the three tables the service touches. */
function makeDb(
  opts: {
    timeZone?: string;
    sampleProject?: boolean;
    hours?: { workHourStart: number; workHourEnd: number; workDays: string };
  } = {}
) {
  let n = 0;
  const tasks: Row[] = [];
  const matches = (row: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => row[k] === v);
  const db = {
    task: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        tasks.find((r) => matches(r, where)) ?? null,
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        tasks.filter((r) => matches(r, where)),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `t_${++n}`, ...data } as Row;
        tasks.push(row);
        return row;
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        const keep = tasks.filter((r) => !matches(r, where));
        const count = tasks.length - keep.length;
        tasks.splice(0, tasks.length, ...keep);
        return { count };
      },
    },
    project: {
      findFirst: async () => (opts.sampleProject ? { id: "p_sample" } : null),
    },
    autoScheduleSettings: {
      findUnique: async () => opts.hours ?? null,
    },
    userSettings: {
      findUnique: async () =>
        opts.timeZone ? { timeZone: opts.timeZone } : null,
    },
  };
  return { db: db as never, tasks };
}

describe("demoSlot", () => {
  const hhmm = (d: Date, zone: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  const day = (d: Date, zone: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(d);

  it("lands on the next half hour, at least 15 minutes ahead (Wed 10:10 Zurich)", () => {
    // 2026-11-18 is a Wednesday; 09:10Z is 10:10 in Zurich (CET).
    const slot = demoSlot(new Date("2026-11-18T09:10:00Z"), "Europe/Zurich");
    expect(day(slot.taskStart, "Europe/Zurich")).toBe("2026-11-18");
    expect(hhmm(slot.taskStart, "Europe/Zurich")).toBe("10:30");
    expect(hhmm(slot.taskEnd, "Europe/Zurich")).toBe("11:30");
    expect(hhmm(slot.meetingStart, "Europe/Zurich")).toBe("10:45");
    expect(hhmm(slot.meetingEnd, "Europe/Zurich")).toBe("11:30");
  });

  it("always overlaps the meeting with the task", () => {
    for (const iso of [
      "2026-11-18T06:00:00Z",
      "2026-11-18T09:31:00Z",
      "2026-11-18T14:00:00Z",
      "2026-11-21T10:00:00Z",
    ]) {
      const s = demoSlot(new Date(iso), "Europe/Zurich");
      expect(
        overlaps(
          { start: s.taskStart, end: s.taskEnd },
          { start: s.meetingStart, end: s.meetingEnd }
        )
      ).toBe(true);
    }
  });

  it("never puts anything earlier than now, whatever the hour, day or zone", () => {
    const start = Date.parse("2026-11-16T00:00:00Z");
    for (const zone of ["Europe/Zurich", "Asia/Tokyo", "America/Los_Angeles"]) {
      for (let minute = 0; minute < 8 * 24 * 60; minute += 7) {
        const now = new Date(start + minute * 60_000);
        for (const hours of [null, { startHour: 8, endHour: 16 }]) {
          const s = demoSlot(now, zone, hours);
          expect(s.taskStart.getTime()).toBeGreaterThan(now.getTime());
          expect(s.meetingStart.getTime()).toBeGreaterThan(now.getTime());
        }
      }
    }
  });

  it("leaves no room for the task before the meeting, so the move can only go after it", () => {
    // The task takes 60 minutes. The scheduler can start at now, or when the
    // work day opens, whichever is later. If less than 60 minutes lie between
    // that and the meeting, the task cannot be put before the meeting.
    const start = Date.parse("2026-11-16T00:00:00Z");
    const minuteOfDay = (d: Date) => {
      const [h, m] = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Zurich",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
        .format(d)
        .split(":")
        .map(Number);
      return h * 60 + m;
    };
    for (const hours of [null, { startHour: 8, endHour: 16 }]) {
      const open = (hours?.startHour ?? 9) * 60;
      for (let minute = 0; minute < 8 * 24 * 60; minute += 7) {
        const now = new Date(start + minute * 60_000);
        const s = demoSlot(now, "Europe/Zurich", hours);
        const gap = (s.meetingStart.getTime() - now.getTime()) / 60_000;
        const sinceOpen = minuteOfDay(s.meetingStart) - open;
        // The smaller of the two is the free time before the meeting.
        expect(Math.min(gap, sinceOpen)).toBeLessThan(60);
      }
    }
  });

  it("waits for 09:30 before the working day starts", () => {
    const slot = demoSlot(new Date("2026-11-18T05:00:00Z"), "Europe/Zurich");
    expect(day(slot.taskStart, "Europe/Zurich")).toBe("2026-11-18");
    expect(hhmm(slot.taskStart, "Europe/Zurich")).toBe("09:30");
  });

  it("moves to 09:30 the next day after the afternoon", () => {
    // Wed 17:00 Zurich.
    const slot = demoSlot(new Date("2026-11-18T16:00:00Z"), "Europe/Zurich");
    expect(day(slot.taskStart, "Europe/Zurich")).toBe("2026-11-19");
    expect(hhmm(slot.taskStart, "Europe/Zurich")).toBe("09:30");
  });

  it("skips the weekend: Friday evening and Saturday land on Monday", () => {
    const fri = demoSlot(new Date("2026-11-20T17:00:00Z"), "Europe/Zurich");
    const sat = demoSlot(new Date("2026-11-21T09:00:00Z"), "Europe/Zurich");
    expect(day(fri.taskStart, "Europe/Zurich")).toBe("2026-11-23");
    expect(day(sat.taskStart, "Europe/Zurich")).toBe("2026-11-23");
    expect(hhmm(sat.taskStart, "Europe/Zurich")).toBe("09:30");
  });

  it("reads the day in the person's zone, not UTC", () => {
    // 23:30Z on Wed is Thursday 08:30 in Tokyo: the next half hour 15 minutes
    // out is 09:00 Thursday, not Wednesday 23:30 UTC's evening.
    const slot = demoSlot(new Date("2026-11-18T23:30:00Z"), "Asia/Tokyo");
    expect(day(slot.taskStart, "Asia/Tokyo")).toBe("2026-11-19");
    expect(hhmm(slot.taskStart, "Asia/Tokyo")).toBe("09:00");
  });

  describe("with the person's work hours", () => {
    const hours = { startHour: 8, endHour: 16 };

    it("opens the day at their start and leaves room after the meeting", () => {
      // 06:00 Zurich, before the day opens: 08:30, not the 09:30 default.
      const early = demoSlot(
        new Date("2026-11-18T05:00:00Z"),
        "Europe/Zurich",
        hours
      );
      expect(hhmm(early.taskStart, "Europe/Zurich")).toBe("08:30");
      // The task can still land after the meeting inside a 16:00 close:
      // the latest start is 13:30 (meeting ends 14:15, task 14:30 to 15:30).
      const late = demoSlot(
        new Date("2026-11-18T12:00:00Z"),
        "Europe/Zurich",
        hours
      );
      expect(day(late.taskStart, "Europe/Zurich")).toBe("2026-11-18");
      expect(hhmm(late.taskStart, "Europe/Zurich")).toBe("13:30");
    });

    it("moves to the next day once the rest of the day is too short", () => {
      // 14:00 Zurich: 14:30 would end after 16:00 once the task moves.
      const slot = demoSlot(
        new Date("2026-11-18T13:00:00Z"),
        "Europe/Zurich",
        hours
      );
      expect(day(slot.taskStart, "Europe/Zurich")).toBe("2026-11-19");
      expect(hhmm(slot.taskStart, "Europe/Zurich")).toBe("08:30");
    });

    it("works on their days only", () => {
      const midweek = { startHour: 9, endHour: 17, days: [2, 3, 4] };
      // Thu evening: Fri, Sat, Sun and Mon are days off, so Tuesday.
      const slot = demoSlot(
        new Date("2026-11-19T18:00:00Z"),
        "Europe/Zurich",
        midweek
      );
      expect(day(slot.taskStart, "Europe/Zurich")).toBe("2026-11-24");
      expect(hhmm(slot.taskStart, "Europe/Zurich")).toBe("09:30");
    });

    it("falls back to the default window when their day is too short for the demo", () => {
      const short = demoSlot(
        new Date("2026-11-18T05:00:00Z"),
        "Europe/Zurich",
        { startHour: 12, endHour: 13 }
      );
      expect(hhmm(short.taskStart, "Europe/Zurich")).toBe("09:30");
    });
  });
});

describe("hoursFromSettings", () => {
  it("reads the single-range columns", () => {
    expect(
      hoursFromSettings({
        workHourStart: 8,
        workHourEnd: 16,
        workDays: "[1,2,3]",
      })
    ).toEqual({ startHour: 8, endHour: 16, days: [1, 2, 3] });
  });

  it("is null without settings and tolerates a broken day list", () => {
    expect(hoursFromSettings(null)).toBeNull();
    expect(
      hoursFromSettings({ workHourStart: 9, workHourEnd: 17, workDays: "x" })
    ).toEqual({ startHour: 9, endHour: 17, days: [] });
  });
});

describe("seedFirstReplanDemo", () => {
  const input = {
    userId: "u1",
    workspaceId: "w1",
    now: new Date("2026-11-18T09:10:00Z"),
  };

  it("creates a fixed meeting and an auto-scheduled task, both marked demo", async () => {
    const { db, tasks } = makeDb({ timeZone: "Europe/Zurich" });
    expect(await seedFirstReplanDemo(input, db)).toEqual({ created: true });
    expect(tasks).toHaveLength(2);
    for (const t of tasks) {
      expect(t).toMatchObject({
        userId: "u1",
        assigneeId: "u1",
        workspaceId: "w1",
        isSample: true,
        skipSync: true,
        source: FIRST_REPLAN_DEMO_SOURCE,
      });
      expect(String(t.title)).toMatch(/^Demo: /);
    }
    const task = tasks.find((t) => t.isAutoScheduled)!;
    const meeting = tasks.find((t) => !t.isAutoScheduled)!;
    expect(
      overlaps(
        {
          start: task.scheduledStart as Date,
          end: task.scheduledEnd as Date,
        },
        {
          start: meeting.scheduledStart as Date,
          end: meeting.scheduledEnd as Date,
        }
      )
    ).toBe(true);
  });

  it("lands inside the person's work hours when they set some", async () => {
    const { db, tasks } = makeDb({
      timeZone: "Europe/Zurich",
      hours: { workHourStart: 7, workHourEnd: 15, workDays: "[1,2,3,4,5]" },
    });
    // 05:00 Zurich, before the day opens at 07:00.
    await seedFirstReplanDemo(
      { ...input, now: new Date("2026-11-18T04:00:00Z") },
      db
    );
    const task = tasks.find((t) => t.isAutoScheduled)!;
    expect(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Zurich",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(task.scheduledStart as Date)
    ).toBe("07:30");
  });

  it("puts the demo in the sample project when there is one", async () => {
    const { db, tasks } = makeDb({ sampleProject: true });
    await seedFirstReplanDemo(input, db);
    expect(tasks.every((t) => t.projectId === "p_sample")).toBe(true);
  });

  it("creates nothing the second time", async () => {
    const { db, tasks } = makeDb();
    await seedFirstReplanDemo(input, db);
    expect(await seedFirstReplanDemo(input, db)).toEqual({ created: false });
    expect(tasks).toHaveLength(2);
  });
});

describe("clearFirstReplanDemo", () => {
  it("removes exactly the demo rows and nothing else", async () => {
    const { db, tasks } = makeDb();
    await seedFirstReplanDemo(
      {
        userId: "u1",
        workspaceId: "w1",
        now: new Date("2026-11-18T09:10:00Z"),
      },
      db
    );
    tasks.push(
      { id: "mine", userId: "u1", title: "Demo: my own", source: null },
      { id: "sample", userId: "u1", title: "x", isSample: true },
      { id: "other", userId: "u2", source: FIRST_REPLAN_DEMO_SOURCE }
    );
    expect(await clearFirstReplanDemo("u1", db)).toBe(2);
    expect(tasks.map((t) => t.id).sort()).toEqual(["mine", "other", "sample"]);
  });
});

describe("firstReplanState", () => {
  it("is null with no demo", async () => {
    expect(await firstReplanState("u1", makeDb().db)).toBeNull();
  });

  it("reports the conflict, then none once the task has moved", async () => {
    const { db, tasks } = makeDb();
    await seedFirstReplanDemo(
      {
        userId: "u1",
        workspaceId: "w1",
        now: new Date("2026-11-18T09:10:00Z"),
      },
      db
    );
    const before = await firstReplanState("u1", db);
    expect(before?.conflict).toBe(true);
    expect(before?.task.title).toBe("Demo: write the weekly plan");
    expect(before?.meeting.title).toBe("Demo: sync with Alex");

    const task = tasks.find((t) => t.isAutoScheduled)!;
    const meeting = tasks.find((t) => !t.isAutoScheduled)!;
    const end = meeting.scheduledEnd as Date;
    task.scheduledStart = end;
    task.scheduledEnd = new Date(end.getTime() + 3_600_000);
    expect((await firstReplanState("u1", db))?.conflict).toBe(false);
  });

  it("is null when one of the two rows is gone", async () => {
    const { db, tasks } = makeDb();
    await seedFirstReplanDemo(
      {
        userId: "u1",
        workspaceId: "w1",
        now: new Date("2026-11-18T09:10:00Z"),
      },
      db
    );
    tasks.splice(
      tasks.findIndex((t) => !t.isAutoScheduled),
      1
    );
    expect(await firstReplanState("u1", db)).toBeNull();
  });
});
