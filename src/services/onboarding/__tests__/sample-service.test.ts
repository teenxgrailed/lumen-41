import {
  SAMPLE_DAYS,
  SAMPLE_USES,
  type SampleUse,
  sampleDocMarkdown,
} from "../sample-content";
import {
  clearSampleData,
  primaryUse,
  seedSampleData,
  shiftDay,
  taskData,
} from "../sample-service";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));

/* A small in-memory stand-in for the transaction client: only the calls the
   service makes, with the `where` shapes it uses. */
type Row = Record<string, unknown> & { id: string };

function makeDb(opts: { seededAt?: Date | null; timeZone?: string } = {}) {
  let n = 0;
  const id = (p: string) => `${p}_${++n}`;
  const t = {
    users: [{ id: "u1", sampleSeededAt: opts.seededAt ?? null }] as Row[],
    projects: [] as Row[],
    tasks: [] as Row[],
    pages: [] as Row[],
    habits: [] as Row[],
  };
  const match = (row: Row, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (k === "OR")
        return (v as Record<string, unknown>[]).some((w) => match(row, w));
      if (v && typeof v === "object" && "in" in (v as object))
        return ((v as { in: unknown[] }).in ?? []).includes(row[k]);
      return row[k] === v;
    });
  const remove = (list: Row[], where: Record<string, unknown>) => {
    const keep = list.filter((r) => !match(r, where));
    const count = list.length - keep.length;
    list.splice(0, list.length, ...keep);
    return { count };
  };
  const tx = {
    user: {
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const rows = t.users.filter((r) => match(r, where));
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      },
    },
    userSettings: {
      findUnique: async () =>
        opts.timeZone ? { timeZone: opts.timeZone } : null,
    },
    project: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: id("p"), ...data } as Row;
        t.projects.push(row);
        return row;
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) =>
        remove(t.projects, where),
    },
    task: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: id("t"), ...data } as Row;
        t.tasks.push(row);
        return row;
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) =>
        remove(t.tasks, where),
    },
    page: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: id("g"), ...data } as Row;
        t.pages.push(row);
        return row;
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) =>
        remove(t.pages, where),
    },
    habit: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: id("h"), ...data } as Row;
        t.habits.push(row);
        return row;
      },
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        t.habits.filter((r) => match(r, where)),
      deleteMany: async ({ where }: { where: Record<string, unknown> }) =>
        remove(t.habits, where),
    },
  };
  const db = {
    $transaction: async <R>(fn: (c: typeof tx) => Promise<R>) => fn(tx),
  };
  return { db: db as never, t };
}

/** 2026-10-19 is a Monday; noon UTC is 14:00 in Berlin (UTC+2). */
const NOW = new Date("2026-10-19T12:00:00.000Z");
const seed = (
  db: never,
  uses?: unknown[],
  extra: Partial<Parameters<typeof seedSampleData>[0]> = {}
) =>
  seedSampleData(
    {
      userId: "u1",
      workspaceId: "w1",
      uses,
      timeZone: "UTC",
      now: NOW,
      ...extra,
    },
    db
  );

describe.each(SAMPLE_USES)("the %s sample day", (use: SampleUse) => {
  it("creates one project, six tasks, one document and one habit, all marked", async () => {
    const { db, t } = makeDb();
    const res = await seed(db, [use]);
    expect(res).toMatchObject({
      created: true,
      use,
      counts: { tasks: 6, projects: 1, pages: 1, habits: 1 },
    });
    expect(t.projects).toHaveLength(1);
    expect(t.tasks).toHaveLength(6);
    expect(t.pages).toHaveLength(1);
    expect(t.habits).toHaveLength(1);
    for (const row of [...t.projects, ...t.tasks, ...t.pages, ...t.habits])
      expect(row.isSample).toBe(true);
    for (const row of [...t.projects, ...t.tasks, ...t.pages, ...t.habits])
      expect(row).toMatchObject({ userId: "u1", workspaceId: "w1" });
    expect(t.users[0].sampleSeededAt).toEqual(NOW);
  });

  it("has an overdue task, a task with subtasks, and estimates on every task", async () => {
    const { db, t } = makeDb();
    await seed(db, [use]);
    const overdue = t.tasks.filter(
      (r) => r.dueDate && (r.dueDate as Date) < new Date("2026-10-19T00:00:00Z")
    );
    expect(overdue).toHaveLength(1);
    expect((overdue[0].dueDate as Date).toISOString()).toBe(
      "2026-10-18T00:00:00.000Z"
    );
    expect(overdue[0].scheduledStart).toBeNull();
    const withParts = t.tasks.filter(
      (r) => (r.parts as { create: unknown[] } | undefined)?.create?.length
    );
    expect(withParts).toHaveLength(1);
    expect(
      (withParts[0].parts as { create: unknown[] }).create.length
    ).toBeGreaterThanOrEqual(3);
    for (const r of t.tasks) expect(r.estimatedMinutes).toBeGreaterThan(0);
    const timed = t.tasks.filter((r) => r.scheduledStart);
    expect(timed.length).toBeGreaterThanOrEqual(4);
    // Placed on today, never auto-scheduled (so never counted as such).
    for (const r of timed) {
      expect((r.scheduledStart as Date).toISOString().slice(0, 10)).toBe(
        "2026-10-19"
      );
      expect(r.isAutoScheduled).toBe(false);
    }
    expect(t.tasks.filter((r) => !r.dueDate && !r.scheduledStart)).toHaveLength(
      1
    );
  });

  it("writes a Start here document that names the three gestures", async () => {
    const { db, t } = makeDb();
    await seed(db, [use]);
    const page = t.pages[0];
    expect(page.title).toBe("Start here");
    const blocks = (page.blocks as { create: { content: unknown }[] }).create;
    expect(blocks.length).toBeGreaterThan(5);
    const text = JSON.stringify(blocks.map((b) => b.content));
    expect(text).toContain("slash menu");
    expect(text).toContain("Ask Needt");
    expect(text).toContain("taskItem");
    expect(page.projectId).toBe(t.projects[0].id);
  });

  it("reads as plain English: no filler, no exclamation marks", () => {
    const day = SAMPLE_DAYS[use];
    const words = [
      day.project.name,
      day.project.description,
      day.habit.title,
      day.docIntro,
      ...day.docTasks,
      ...day.tasks.flatMap((x) => [
        x.title,
        x.note ?? "",
        ...(x.subtasks ?? []),
      ]),
      sampleDocMarkdown(use),
    ].join("\n");
    expect(words).not.toMatch(/lorem|ipsum|dolor|!|test task|foo|bar\b/i);
    expect(words).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe("the four uses are different days", () => {
  it("share no task, project, habit or document wording", () => {
    const titles = SAMPLE_USES.flatMap((u) => [
      ...SAMPLE_DAYS[u].tasks.map((x) => x.title),
      SAMPLE_DAYS[u].project.name,
      SAMPLE_DAYS[u].habit.title,
    ]);
    expect(new Set(titles).size).toBe(titles.length);
    const docs = SAMPLE_USES.map((u) => sampleDocMarkdown(u));
    expect(new Set(docs).size).toBe(SAMPLE_USES.length);
    const times = SAMPLE_USES.map((u) =>
      SAMPLE_DAYS[u].tasks.map((x) => x.at ?? "-").join()
    );
    expect(new Set(times).size).toBeGreaterThan(1);
  });
});

describe("which use drives the sample", () => {
  it("the first valid pick wins; nothing valid falls back to work", () => {
    expect(primaryUse(["study", "side"])).toBe("study");
    expect(primaryUse(["nonsense", "personal"])).toBe("personal");
    expect(primaryUse([])).toBe("work");
    expect(primaryUse(undefined)).toBe("work");
  });

  it("seeds the project of the first pick", async () => {
    const { db, t } = makeDb();
    const res = await seed(db, ["side", "work"]);
    expect(res.use).toBe("side");
    expect(t.projects[0].name).toBe(SAMPLE_DAYS.side.project.name);
  });
});

describe("times follow the person's time zone", () => {
  it("writes 09:30 Berlin time as 07:30 UTC in summer time", () => {
    const task = { title: "x", estimate: 60, due: 0, at: "09:30" };
    const row = taskData(task, "2026-10-19", "Europe/Berlin");
    expect((row.scheduledStart as Date).toISOString()).toBe(
      "2026-10-19T07:30:00.000Z"
    );
    expect((row.scheduledEnd as Date).toISOString()).toBe(
      "2026-10-19T08:30:00.000Z"
    );
    // The due day is a UTC midnight, as the task routes store it.
    expect((row.dueDate as Date).toISOString()).toBe(
      "2026-10-19T00:00:00.000Z"
    );
  });

  it("uses the saved zone for 'today' when none is passed", async () => {
    // 22:30 UTC on the 19th is already the 20th in Auckland.
    const late = new Date("2026-10-19T22:30:00.000Z");
    const { db, t } = makeDb({ timeZone: "Pacific/Auckland" });
    await seedSampleData(
      { userId: "u1", workspaceId: "w1", uses: ["work"], now: late },
      db
    );
    const first = t.tasks.find((r) => r.scheduledStart);
    expect(
      ((first?.dueDate as Date) ?? new Date(0)).toISOString().slice(0, 10)
    ).toBe("2026-10-20");
  });

  it("shiftDay crosses month ends", () => {
    expect(shiftDay("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("once per account", () => {
  it("a second call creates nothing", async () => {
    const { db, t } = makeDb();
    expect((await seed(db, ["work"])).created).toBe(true);
    const again = await seed(db, ["study"]);
    expect(again).toMatchObject({
      created: false,
      counts: { tasks: 0, projects: 0, pages: 0, habits: 0 },
    });
    expect(t.tasks).toHaveLength(6);
    expect(t.projects).toHaveLength(1);
    expect(t.projects[0].name).toBe(SAMPLE_DAYS.work.project.name);
  });

  it("an account that existed before the feature is never given examples", async () => {
    const { db, t } = makeDb({ seededAt: new Date("2026-10-01T00:00:00Z") });
    expect((await seed(db, ["work"])).created).toBe(false);
    expect(
      t.tasks.length + t.projects.length + t.pages.length + t.habits.length
    ).toBe(0);
  });

  it("stays final after Clear examples", async () => {
    const { db, t } = makeDb();
    await seed(db, ["work"]);
    await clearSampleData({ userId: "u1" }, db);
    expect((await seed(db, ["work"])).created).toBe(false);
    expect(t.tasks).toHaveLength(0);
  });
});

describe("Clear examples", () => {
  it("removes every example and nothing else", async () => {
    const { db, t } = makeDb();
    await seed(db, ["personal"]);
    const habitId = t.habits[0].id;
    // What the person made themselves, and a task the habit materialised.
    t.tasks.push(
      { id: "mine", userId: "u1", title: "My own task", isSample: false },
      { id: "other", userId: "u2", title: "Someone else", isSample: true },
      { id: "wk", userId: "u1", habitId, isSample: false }
    );
    t.projects.push({ id: "mp", userId: "u1", isSample: false });
    t.pages.push({ id: "mg", userId: "u1", isSample: false });
    t.habits.push({ id: "mh", userId: "u1", isSample: false });

    const removed = await clearSampleData({ userId: "u1" }, db);
    expect(removed).toEqual({ tasks: 7, projects: 1, pages: 1, habits: 1 });
    expect(t.tasks.map((r) => r.id).sort()).toEqual(["mine", "other"]);
    expect(t.projects.map((r) => r.id)).toEqual(["mp"]);
    expect(t.pages.map((r) => r.id)).toEqual(["mg"]);
    expect(t.habits.map((r) => r.id)).toEqual(["mh"]);
  });

  it("is safe to repeat and on an account with no examples", async () => {
    const { db } = makeDb();
    expect(await clearSampleData({ userId: "u1" }, db)).toEqual({
      tasks: 0,
      projects: 0,
      pages: 0,
      habits: 0,
    });
  });
});
