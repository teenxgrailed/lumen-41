import {
  DAY_TASK_LIMIT,
  FALLBACK_ENTRY,
  STUCK_RESCHEDULES,
  STUCK_START_DAYS,
  type StuckFacts,
  fallbackPlan,
  needsBackfill,
  needsEntryOnCreate,
  overflowIds,
  parseEntryPlan,
  proposalLine,
  simplifiedLine,
  stuckReason,
} from "../rules";

const NOW = new Date("2026-11-22T10:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 3_600_000);

const base: StuckFacts = {
  status: "todo",
  isArchived: false,
  trashedAt: null,
  somedayAt: null,
  isSample: false,
  isRecurring: false,
  recurrenceMasterId: null,
  habitId: null,
  externalTaskId: null,
  rescheduleCount: 0,
  startDate: null,
  scheduledStart: null,
  lastTouchedAt: null,
  simplifiedAt: null,
  doneParts: 0,
};

describe("needsEntryOnCreate", () => {
  it("is true for a plain open task with no entry", () => {
    expect(needsEntryOnCreate({ ...base, entry: null })).toBe(true);
    expect(needsEntryOnCreate({ ...base, entry: "   " })).toBe(true);
  });

  it("leaves a task that has an entry alone", () => {
    expect(needsEntryOnCreate({ ...base, entry: "Open the file" })).toBe(false);
  });

  it.each([
    ["a habit occurrence", { habitId: "h1" }],
    ["a recurring series", { isRecurring: true }],
    ["a recurring instance", { recurrenceMasterId: "m1" }],
    ["an onboarding example", { isSample: true }],
    ["a synced task", { externalTaskId: "g1" }],
    ["a done task", { status: "completed" }],
    ["a task in Someday", { somedayAt: NOW }],
  ])("skips %s", (_name, patch) => {
    expect(needsEntryOnCreate({ ...base, ...patch, entry: null })).toBe(false);
  });
});

describe("stuckReason", () => {
  it("is null for a fresh task", () => {
    expect(stuckReason(base, NOW)).toBeNull();
  });

  it("a task moved to another day once is stuck", () => {
    expect(stuckReason({ ...base, rescheduleCount: 0 }, NOW)).toBeNull();
    expect(stuckReason({ ...base, rescheduleCount: 1 }, NOW)).toBe(
      "rescheduled"
    );
  });

  it("a task not started 2 days after its start is stuck", () => {
    expect(stuckReason({ ...base, startDate: daysAgo(1) }, NOW)).toBeNull();
    expect(stuckReason({ ...base, startDate: daysAgo(2) }, NOW)).toBe(
      "not_started"
    );
    // no start day: the time it is placed at
    expect(stuckReason({ ...base, scheduledStart: daysAgo(3) }, NOW)).toBe(
      "not_started"
    );
  });

  it("a task touched after its start, or with a ticked subtask, has been started", () => {
    expect(
      stuckReason(
        { ...base, startDate: daysAgo(5), lastTouchedAt: daysAgo(1) },
        NOW
      )
    ).toBeNull();
    expect(
      stuckReason({ ...base, rescheduleCount: 3, doneParts: 1 }, NOW)
    ).toBeNull();
  });

  it("cools down for 7 days after a rewrite", () => {
    const stuck = { ...base, rescheduleCount: 2 };
    expect(stuckReason({ ...stuck, simplifiedAt: daysAgo(6) }, NOW)).toBeNull();
    expect(stuckReason({ ...stuck, simplifiedAt: daysAgo(8) }, NOW)).toBe(
      "rescheduled"
    );
  });

  it("never reaches a habit, a series or a synced task", () => {
    expect(
      stuckReason({ ...base, rescheduleCount: 5, habitId: "h" }, NOW)
    ).toBeNull();
    expect(
      stuckReason({ ...base, rescheduleCount: 5, externalTaskId: "x" }, NOW)
    ).toBeNull();
  });
});

describe("overflowIds", () => {
  const day = (n: number, fixed: number[] = []) =>
    Array.from({ length: n }, (_, i) => ({
      id: `t${i + 1}`,
      fixed: fixed.includes(i + 1),
    }));

  it("keeps 6 and sends the rest, lowest priority (last) first", () => {
    expect(DAY_TASK_LIMIT).toBe(6);
    expect(overflowIds(day(8))).toEqual(["t8", "t7"]);
  });

  it("does nothing at 6 or fewer", () => {
    expect(overflowIds(day(6))).toEqual([]);
    expect(overflowIds(day(3))).toEqual([]);
  });

  it("never moves a fixed task, and sheds what it can", () => {
    expect(overflowIds(day(8, [8]))).toEqual(["t7", "t6"]);
    expect(overflowIds(day(8, [3, 4, 5, 6, 7, 8]))).toEqual(["t2", "t1"]);
    expect(overflowIds(day(7, [1, 2, 3, 4, 5, 6, 7]))).toEqual([]);
  });
});

describe("parseEntryPlan", () => {
  it("reads an entry and at most 3 subtasks", () => {
    const plan = parseEntryPlan(
      '```json\n{"entry":"Open the form","subtasks":["a","b","c","d"]}\n```'
    );
    expect(plan).toEqual({
      entry: "Open the form",
      subtasks: ["a", "b", "c"],
      source: "ai",
    });
  });

  it("takes a new title only when a re-split asks for one and it differs", () => {
    const raw =
      '{"title":"Send invoice","entry":"Find the invoice","subtasks":[]}';
    expect(parseEntryPlan(raw)?.title).toBeUndefined();
    expect(parseEntryPlan(raw, { wantTitle: true })?.title).toBe(
      "Send invoice"
    );
    expect(
      parseEntryPlan(raw, { wantTitle: true, previousTitle: "Send invoice" })
        ?.title
    ).toBeUndefined();
  });

  it("returns null for anything unusable", () => {
    expect(parseEntryPlan("sure, here you go")).toBeNull();
    expect(parseEntryPlan('{"entry":""}')).toBeNull();
    expect(parseEntryPlan('{"subtasks":["a"]}')).toBeNull();
    expect(parseEntryPlan("{broken")).toBeNull();
  });
});

describe("thresholds", () => {
  it("are the owner's: one later-day move or 2 days not started; 6 tasks a day", () => {
    expect(STUCK_RESCHEDULES).toBe(1);
    expect(STUCK_START_DAYS).toBe(2);
    expect(DAY_TASK_LIMIT).toBe(6);
  });
});

describe("projects kept out", () => {
  const inProject = { ...base, projectId: "p1" };

  it("no rule reaches a task in an excluded project", () => {
    expect(needsEntryOnCreate({ ...inProject, entry: null }, ["p1"])).toBe(
      false
    );
    expect(needsEntryOnCreate({ ...inProject, entry: null }, ["p2"])).toBe(
      true
    );
    expect(needsBackfill({ ...inProject, entry: null }, ["p1"])).toBe(false);
    expect(
      stuckReason({ ...inProject, rescheduleCount: 2 }, NOW, ["p1"])
    ).toBeNull();
    expect(stuckReason({ ...inProject, rescheduleCount: 2 }, NOW, [])).toBe(
      "rescheduled"
    );
  });

  it("a task with no project is never excluded", () => {
    expect(needsEntryOnCreate({ ...base, entry: null }, ["p1"])).toBe(true);
  });
});

describe("needsBackfill", () => {
  it("an open task with no entry that was never looked at", () => {
    expect(needsBackfill({ ...base, entry: null })).toBe(true);
  });

  it("not a task that has an entry or was already looked at", () => {
    expect(needsBackfill({ ...base, entry: "Open it" })).toBe(false);
    expect(needsBackfill({ ...base, entry: null, simplifiedAt: NOW })).toBe(
      false
    );
  });
});

describe("fallback and the line", () => {
  it("the suggestion line asks Simplify? and stays on one line", () => {
    const line = proposalLine({
      title: "Do the whole tax return for the year",
      entry: "Find last year's return",
    });
    expect(line.startsWith("Simplify? ")).toBe(true);
    expect(line).not.toContain("\n");
    expect(line.length).toBeLessThanOrEqual(110);
  });

  it("the backfill line is one summed sentence", () => {
    expect(simplifiedLine({ kind: "backfill", count: 12 })).toBe(
      "Simplified: gave 12 tasks a first step"
    );
  });

  it("the fallback is fixed and adds nothing else", () => {
    expect(fallbackPlan()).toEqual({
      entry: FALLBACK_ENTRY,
      subtasks: [],
      source: "fallback",
    });
    expect(FALLBACK_ENTRY).toBe("Open it and do the first 10 minutes.");
  });

  it("the line starts with Simplified and stays on one line", () => {
    const line = simplifiedLine({
      kind: "resplit",
      title: "Do the whole tax return for the year",
      entry: "Find last year's return",
    });
    expect(line.startsWith("Simplified: ")).toBe(true);
    expect(line).not.toContain("\n");
    expect(line.length).toBeLessThanOrEqual(110);
    expect(simplifiedLine({ kind: "spread", moved: 2 })).toBe(
      "Simplified: moved 2 tasks to later days"
    );
    expect(simplifiedLine({ kind: "spread", moved: 1 })).toBe(
      "Simplified: moved 1 task to later days"
    );
  });
});
