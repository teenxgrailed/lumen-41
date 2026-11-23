import {
  ARCHIVE_AFTER_SKIPS,
  type IdeaTaskFacts,
  cardAfter,
  cardSlots,
  dueState,
  hasActivityWord,
  hasCommitmentWord,
  ideaPatchRefused,
  isIdeaCandidate,
  isOffered,
  localDay,
  looksLikeIdea,
  movedToIdeasLine,
  shouldAutoConvert,
  skipResult,
} from "../rules";

// Monday 23 Nov 2026, 10:00 in Zurich (09:00 UTC).
const NOW = new Date("2026-11-23T09:00:00.000Z");
const TZ = "Europe/Zurich";

/** A due day as the app stores a bare date: UTC midnight. */
const day = (key: string) => new Date(`${key}T00:00:00.000Z`);

const task = (over: Partial<IdeaTaskFacts> = {}): IdeaTaskFacts => ({
  title: "Read AI agents news",
  kind: "TASK",
  userId: "u1",
  assigneeId: "u1",
  status: "todo",
  isArchived: false,
  trashedAt: null,
  somedayAt: null,
  isSample: false,
  isRecurring: false,
  recurrenceMasterId: null,
  habitId: null,
  externalTaskId: null,
  hardDeadline: false,
  priorityLevel: "MEDIUM",
  priority: null,
  scheduleLocked: false,
  isFrozen: false,
  doneParts: 0,
  projectId: null,
  dueDate: day("2026-11-20"),
  deadline: null,
  rescheduleCount: 0,
  ...over,
});

describe("keywords", () => {
  it.each([
    "Read AI agents news",
    "Watch the breakdown",
    "Check out the new tutorial",
    "Try out Cursor",
    "Look at the podcast about hiring",
    "Прочитать статью про агентов",
    "Посмотреть новости",
    "Почитати новини",
    "Artikel lesen",
    "Tutorial anschauen",
    "READ THE NEWS",
  ])("reads %s as optional", (title) => {
    expect(hasActivityWord(title)).toBe(true);
  });

  it.each([
    "Write the report",
    "Ready for launch",
    "Spreadsheet",
    "Newsletter",
  ])("is not tricked by %s (whole words only)", (title) => {
    expect(hasActivityWord(title)).toBe(false);
  });

  it.each([
    "Read contract before Friday",
    "Read the brief by tomorrow",
    "Watch the video and send notes",
    "Прочитать договор до пятницы",
    "Подивитися відео до вечора",
    "Artikel lesen bis Freitag",
  ])("a commitment word keeps %s a task", (title) => {
    expect(hasCommitmentWord(title)).toBe(true);
    expect(looksLikeIdea(title)).toBe(false);
  });

  it("a title with only an activity word is an idea", () => {
    expect(looksLikeIdea("Watch a breakdown")).toBe(true);
  });
});

describe("dueState", () => {
  it("has no day, a future day, or counts overdue days in the person's zone", () => {
    expect(dueState({ dueDate: null, deadline: null }, NOW, TZ)).toEqual({
      state: "undated",
    });
    expect(
      dueState({ dueDate: day("2026-11-30"), deadline: null }, NOW, TZ)
    ).toEqual({ state: "future" });
    expect(
      dueState({ dueDate: day("2026-11-23"), deadline: null }, NOW, TZ)
    ).toEqual({ state: "due", overdueDays: 0 });
    expect(
      dueState({ dueDate: day("2026-11-20"), deadline: null }, NOW, TZ)
    ).toEqual({ state: "due", overdueDays: 3 });
  });

  it("falls back to the deadline when there is no due date", () => {
    expect(
      dueState({ dueDate: null, deadline: day("2026-11-21") }, NOW, TZ)
    ).toEqual({ state: "due", overdueDays: 2 });
  });
});

describe("isIdeaCandidate", () => {
  it("a task 3 days overdue is a candidate", () => {
    expect(isIdeaCandidate(task(), NOW, TZ)).toBe(true);
  });

  it("a task with no due date is a candidate", () => {
    expect(isIdeaCandidate(task({ dueDate: null }), NOW, TZ)).toBe(true);
  });

  it("a real deadline keeps it a task", () => {
    expect(
      isIdeaCandidate(task({ title: "Read contract before Friday" }), NOW, TZ)
    ).toBe(false);
  });

  it("a future due date is a commitment, even moved", () => {
    const next = task({
      title: "Watch the breakdown",
      dueDate: day("2026-11-30"),
      rescheduleCount: 2,
    });
    expect(isIdeaCandidate(next, NOW, TZ)).toBe(false);
  });

  it("due today is a candidate only once it was moved", () => {
    const today = task({ dueDate: day("2026-11-23") });
    expect(isIdeaCandidate(today, NOW, TZ)).toBe(false);
    expect(isIdeaCandidate({ ...today, rescheduleCount: 1 }, NOW, TZ)).toBe(
      true
    );
  });

  it.each<[string, Partial<IdeaTaskFacts>]>([
    ["high priority", { priorityLevel: "HIGH" }],
    ["urgent priority", { priorityLevel: "URGENT" }],
    ["a hard deadline", { hardDeadline: true }],
    ["Someday", { somedayAt: NOW }],
    ["done", { status: "completed" }],
    ["in progress", { status: "in_progress" }],
    ["archived", { isArchived: true }],
    ["in Trash", { trashedAt: NOW }],
    ["a sample", { isSample: true }],
    ["recurring", { isRecurring: true }],
    ["a series occurrence", { recurrenceMasterId: "m1" }],
    ["a habit", { habitId: "h1" }],
    ["synced", { externalTaskId: "g1" }],
    ["pinned", { scheduleLocked: true }],
    ["frozen", { isFrozen: true }],
    ["started (a subtask is done)", { doneParts: 1 }],
    ["assigned to someone else", { assigneeId: "u2" }],
    ["already an idea", { kind: "IDEA" }],
    ["in a project kept out of easy start", { projectId: "p-client" }],
  ])("is not a candidate when it is %s", (_name, over) => {
    expect(isIdeaCandidate(task(over), NOW, TZ, ["p-client"])).toBe(false);
  });
});

describe("shouldAutoConvert", () => {
  it("overdue 2 or more days converts", () => {
    expect(
      shouldAutoConvert(task({ dueDate: day("2026-11-21") }), NOW, TZ)
    ).toBe(true);
  });

  it("overdue 1 day alone does not", () => {
    expect(
      shouldAutoConvert(task({ dueDate: day("2026-11-22") }), NOW, TZ)
    ).toBe(false);
  });

  it("moved to a later day converts", () => {
    expect(
      shouldAutoConvert(
        task({ dueDate: day("2026-11-22"), rescheduleCount: 1 }),
        NOW,
        TZ
      )
    ).toBe(true);
  });

  it("a fresh task with no date that never slipped stays a task", () => {
    expect(shouldAutoConvert(task({ dueDate: null }), NOW, TZ)).toBe(false);
  });
});

describe("cards", () => {
  it("allows 2 a day, counting every card shown, and 1 on an empty day", () => {
    expect(cardSlots({ stampedToday: 0, visibleTasks: 8 })).toBe(2);
    expect(cardSlots({ stampedToday: 1, visibleTasks: 8 })).toBe(1);
    // skipped or taken cards are stamped too: no third card
    expect(cardSlots({ stampedToday: 2, visibleTasks: 8 })).toBe(0);
    expect(cardSlots({ stampedToday: 0, visibleTasks: 0 })).toBe(1);
    expect(cardSlots({ stampedToday: 1, visibleTasks: 0 })).toBe(0);
  });

  it("places the first card after the 2nd task and the second after the 5th", () => {
    expect(cardAfter(0, 8)).toBe(2);
    expect(cardAfter(1, 8)).toBe(5);
  });

  it("goes to the end with fewer tasks, never first", () => {
    expect(cardAfter(0, 1)).toBe(1);
    expect(cardAfter(1, 3)).toBe(3);
    expect(cardAfter(0, 0)).toBe(0);
  });

  it("is offered unless snoozed, archived or trashed", () => {
    const base = { isArchived: false, trashedAt: null, ideaSnoozedUntil: null };
    expect(isOffered(base, NOW)).toBe(true);
    expect(
      isOffered(
        { ...base, ideaSnoozedUntil: new Date("2026-11-30T00:00:00Z") },
        NOW
      )
    ).toBe(false);
    expect(
      isOffered(
        { ...base, ideaSnoozedUntil: new Date("2026-11-20T00:00:00Z") },
        NOW
      )
    ).toBe(true);
    expect(isOffered({ ...base, isArchived: true }, NOW)).toBe(false);
    expect(isOffered({ ...base, trashedAt: NOW }, NOW)).toBe(false);
  });
});

describe("skip", () => {
  it("hides for 7 days and counts the skip", () => {
    const skip = skipResult(0, NOW);
    expect(skip.ideaSkipCount).toBe(1);
    expect(skip.ideaSnoozedUntil.toISOString()).toBe(
      "2026-11-30T09:00:00.000Z"
    );
    expect(skip.archive).toBe(false);
  });

  it("archives on the 3rd skip", () => {
    expect(skipResult(ARCHIVE_AFTER_SKIPS - 2, NOW).archive).toBe(false);
    expect(skipResult(ARCHIVE_AFTER_SKIPS - 1, NOW).archive).toBe(true);
  });
});

describe("localDay", () => {
  it("is the person's day, not UTC's", () => {
    const late = new Date("2026-11-23T23:30:00.000Z");
    const today = localDay(late, TZ);
    expect(today.key).toBe("2026-11-24");
    expect(today.start.toISOString()).toBe("2026-11-23T23:00:00.000Z");
    expect(today.end.toISOString()).toBe("2026-11-24T23:00:00.000Z");
  });
});

describe("ideaPatchRefused", () => {
  it.each([
    { dueDate: "2026-11-25" },
    { deadline: "2026-11-25T10:00:00Z" },
    { recurrenceRule: "FREQ=DAILY" },
    { start: "2026-11-25T10:00" },
    { pinned: true },
    { autoSchedule: true },
    { status: "completed" },
    { scheduledStart: new Date() },
  ])("refuses %j", (patch) => {
    expect(ideaPatchRefused(patch)).toBe(true);
  });

  it("lets an echo of the idea, and plain edits, through", () => {
    expect(
      ideaPatchRefused({
        title: "New",
        dueDate: null,
        deadline: null,
        status: "todo",
        isAutoScheduled: false,
        autoSchedule: false,
        pinned: false,
      })
    ).toBe(false);
  });
});

describe("movedToIdeasLine", () => {
  it("is one line for one, two or many", () => {
    expect(movedToIdeasLine(["Read AI agents news"])).toBe(
      "Moved to Ideas: Read AI agents news"
    );
    expect(movedToIdeasLine(["Read news", "Watch a breakdown"])).toBe(
      "Moved 2 to Ideas: Read news, Watch a breakdown"
    );
    expect(movedToIdeasLine(["A", "B", "C"])).toBe(
      "Moved 3 to Ideas: A, B, ..."
    );
    expect(movedToIdeasLine([])).toBe("");
  });

  it("stays short for long titles", () => {
    expect(
      movedToIdeasLine(["x".repeat(300), "y".repeat(300)]).length
    ).toBeLessThanOrEqual(110);
  });
});
