import { FIRST_REPLAN_DEMO_SOURCE } from "@/lib/onboarding/first-replan";

import {
  clearFirstReplanDemo,
  demoSlot,
  firstReplanState,
  overlaps,
  seedFirstReplanDemo,
} from "../first-replan-demo";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));

type Row = Record<string, unknown> & { id: string };

/* An in-memory stand-in for the three tables the service touches. */
function makeDb(opts: { timeZone?: string; sampleProject?: boolean } = {}) {
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

  it("lands on the next half hour, at least 30 minutes ahead (Wed 10:10 Zurich)", () => {
    // 2026-11-18 is a Wednesday; 09:10Z is 10:10 in Zurich (CET).
    const slot = demoSlot(new Date("2026-11-18T09:10:00Z"), "Europe/Zurich");
    expect(day(slot.taskStart, "Europe/Zurich")).toBe("2026-11-18");
    expect(hhmm(slot.taskStart, "Europe/Zurich")).toBe("11:00");
    expect(hhmm(slot.taskEnd, "Europe/Zurich")).toBe("12:00");
    expect(hhmm(slot.meetingStart, "Europe/Zurich")).toBe("11:15");
    expect(hhmm(slot.meetingEnd, "Europe/Zurich")).toBe("12:00");
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

  it("waits for 10:00 before the working day starts", () => {
    const slot = demoSlot(new Date("2026-11-18T05:00:00Z"), "Europe/Zurich");
    expect(day(slot.taskStart, "Europe/Zurich")).toBe("2026-11-18");
    expect(hhmm(slot.taskStart, "Europe/Zurich")).toBe("10:00");
  });

  it("moves to 10:00 the next day after the afternoon", () => {
    // Wed 17:00 Zurich.
    const slot = demoSlot(new Date("2026-11-18T16:00:00Z"), "Europe/Zurich");
    expect(day(slot.taskStart, "Europe/Zurich")).toBe("2026-11-19");
    expect(hhmm(slot.taskStart, "Europe/Zurich")).toBe("10:00");
  });

  it("skips the weekend: Friday evening and Saturday land on Monday", () => {
    const fri = demoSlot(new Date("2026-11-20T17:00:00Z"), "Europe/Zurich");
    const sat = demoSlot(new Date("2026-11-21T09:00:00Z"), "Europe/Zurich");
    expect(day(fri.taskStart, "Europe/Zurich")).toBe("2026-11-23");
    expect(day(sat.taskStart, "Europe/Zurich")).toBe("2026-11-23");
    expect(hhmm(sat.taskStart, "Europe/Zurich")).toBe("10:00");
  });

  it("reads the day in the person's zone, not UTC", () => {
    // 23:30Z on Wed is Thursday 08:30 in Tokyo: the next half hour 30 minutes
    // out is 09:00 Thursday, not Wednesday 23:30 UTC's evening.
    const slot = demoSlot(new Date("2026-11-18T23:30:00Z"), "Asia/Tokyo");
    expect(day(slot.taskStart, "Asia/Tokyo")).toBe("2026-11-19");
    expect(hhmm(slot.taskStart, "Asia/Tokyo")).toBe("09:00");
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
