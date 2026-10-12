/* Fixtures: the prototype's fixed week (docs/port/prototype/Data.js) —
   today is Tuesday 1 September 2026, the week runs 31 Aug – 6 Sep. */
import {
  addDays,
  addMinutes,
  applyTaskPatch,
  blockerOf,
  blocking,
  checkinsFromStrip,
  completeTask,
  cvDur,
  cvProject,
  dayLabel,
  dueDay,
  dueLabel,
  eventBlock,
  eventsInRange,
  habitColor,
  habitDays,
  habitStreak,
  habitWeek,
  liveMail,
  liveTasks,
  mailDayLabel,
  mailTime,
  moveDay,
  moveEvent,
  notesText,
  overlaps,
  placeAt,
  project,
  setCheckin,
  shiftWeek,
  streak,
  sync,
  timeLabel,
  toDate,
  toggleTask,
  trashedTasks,
  unblocks,
  weekday,
} from "@/lib/needt3/derive";

const TODAY = "2026-09-01";

const PROJECTS = [
  {
    id: "ops",
    name: "Operations",
    color: "var(--hue-orange)",
    icon: "briefcase",
  },
  {
    id: "ds",
    name: "Design system",
    color: "var(--hue-blue)",
    icon: "component",
  },
  {
    id: "german",
    name: "German",
    color: "var(--hue-violet)",
    icon: "graduation-cap",
  },
  { id: "resale", name: "Resale", color: "var(--hue-green)", icon: "package" },
  { id: "life", name: "Life", color: "var(--hue-yellow)", icon: "heart" },
];
const ALIAS = { de: "german", personal: "life" };

const HABIT_STRIPS: Record<string, (0 | 1)[]> = {
  de: [1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1],
  walk: [1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0],
  gym: [1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0],
  read: [0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1],
};
const CHECKINS = Object.entries(HABIT_STRIPS).flatMap(([id, strip]) =>
  checkinsFromStrip(id, strip, TODAY)
);

type T = {
  id: number;
  title: string;
  done: boolean;
  dueDate?: string | null;
  estimatedMinutes?: number | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  blockedBy?: number | null;
  TaskWait?: { personId: string; reason: string } | null;
  TaskPart?: { id: string; title: string; done: boolean }[] | null;
  trashedAt?: string | null;
};

const TASKS: T[] = [
  {
    id: 1,
    title: "Draft the launch brief",
    done: false,
    dueDate: "2026-09-04",
    estimatedMinutes: 90,
    scheduledStart: "2026-09-04T09:00",
    scheduledEnd: "2026-09-04T10:30",
    TaskPart: [
      { id: "1.1", title: "Pull last month's numbers", done: true },
      { id: "1.2", title: "Write the draft", done: false },
      { id: "1.3", title: "Send it for review", done: false },
    ],
  },
  {
    id: 14,
    title: "Finish the tank graphic",
    done: false,
    TaskWait: { personId: "lena", reason: "the final logo" },
  },
  { id: 17, title: "Sign the factory quote", done: false, blockedBy: 26 },
  {
    id: 18,
    title: "Pick the courier for the batch",
    done: false,
    blockedBy: 17,
  },
  { id: 22, title: "Write the September brief", done: false, blockedBy: 1 },
  { id: 26, title: "Read the two supplier contracts", done: false },
  { id: 9, title: "Reconcile the card statement", done: true },
];

describe("days", () => {
  it("knows the fixed week", () => {
    expect(weekday(TODAY)).toBe(2); // Tuesday
    expect(shiftWeek(TODAY, 0)).toBe("2026-08-31");
    expect(shiftWeek(TODAY, 1)).toBe("2026-09-07");
    expect(addDays("2026-08-31", 6)).toBe("2026-09-06");
  });

  it.each([
    ["Today", "2026-09-01"],
    ["tomorrow", "2026-09-02"],
    ["Fri", "2026-09-04"],
    ["by friday", "2026-09-04"],
    ["mon", "2026-09-07"],
    ["This weekend", "2026-09-05"],
    ["Next week", "2026-09-07"],
    ["in 3 days", "2026-09-04"],
    ["4 Sep", "2026-09-04"],
    ["31 aug", "2026-08-31"],
    ["2026-09-06T11:00", "2026-09-06"],
    ["someday", null],
    ["", null],
  ])("toDate(%p) → %p", (input, out) => {
    expect(toDate(input, TODAY)).toBe(out);
  });

  it("labels days the way the screens print them", () => {
    expect(dayLabel("2026-09-04")).toBe("4 Sep");
    expect(dueLabel({ dueDate: "2026-08-31" })).toBe("31 Aug");
    expect(dueLabel({ dueDate: null })).toBeNull();
    expect(dueDay({ dueDate: "2026-09-04" })).toBe(4);
  });
});

describe("time on a task", () => {
  it("reads the hour label", () => {
    expect(timeLabel(TASKS[0])).toBe("09:00");
    expect(timeLabel(TASKS[1])).toBeNull();
  });

  it("adds minutes across midnight", () => {
    expect(addMinutes("2026-09-01T23:30", 45)).toBe("2026-09-02T00:15");
    expect(addMinutes("2026-08-31T09:00", 90)).toBe("2026-08-31T10:30");
  });

  it("keeps scheduledEnd = start + estimate", () => {
    const t = { ...TASKS[0], scheduledEnd: "2026-09-04T09:05" };
    expect(sync(t).scheduledEnd).toBe("2026-09-04T10:30");
    expect(sync(TASKS[0])).toBe(TASKS[0]);
  });

  it("moves a task to another day keeping its hour", () => {
    expect(moveDay(TASKS[0], "Fri", TODAY)).toEqual({
      dueDate: "2026-09-04",
      scheduledStart: "2026-09-04T09:00",
      scheduledEnd: "2026-09-04T10:30",
    });
    expect(moveDay(TASKS[0], "tomorrow", TODAY).scheduledStart).toBe(
      "2026-09-02T09:00"
    );
    expect(moveDay({ estimatedMinutes: 20 }, "tomorrow", TODAY)).toEqual({
      dueDate: "2026-09-02",
    });
  });

  it("places a task at an hour and marks it fixed", () => {
    expect(
      placeAt({ estimatedMinutes: 45 }, "2026-09-03", 14.5, TODAY)
    ).toEqual({
      dueDate: "2026-09-03",
      scheduledStart: "2026-09-03T14:30",
      scheduledEnd: "2026-09-03T15:15",
      isFixed: true,
    });
    expect(placeAt(null, null, 9, TODAY).scheduledStart).toBe(
      "2026-09-01T09:00"
    );
  });
});

describe("notes", () => {
  it("reads the desktop's HTML and the phone's text as plain text", () => {
    expect(
      notesText(
        "<p>Call Anna</p><ul><li>price</li><li>date &amp; time</li></ul>"
      )
    ).toBe("Call Anna\n- price\n- date & time");
    expect(notesText("  line one\nline two  ")).toBe("line one\nline two");
    expect(notesText("<p></p>")).toBeNull();
    expect(notesText(null)).toBeNull();
  });
});

describe("task state", () => {
  it("closing a task closes its open parts", () => {
    const patch = completeTask(TASKS[0]);
    expect(patch.done).toBe(true);
    expect("TaskPart" in patch && patch.TaskPart?.every((p) => p.done)).toBe(
      true
    );
    const list = toggleTask(TASKS, 1);
    expect(list[0].done).toBe(true);
    expect(list[0].TaskPart?.every((p) => p.done)).toBe(true);
  });

  it("the last open part closing closes the task; reopening keeps parts", () => {
    const parts = TASKS[0].TaskPart!.map((p) => ({ ...p, done: true }));
    const closed = applyTaskPatch(TASKS, 1, { TaskPart: parts })[0];
    expect(closed.done).toBe(true);
    const reopened = toggleTask([closed], 1)[0];
    expect(reopened.done).toBe(false);
    expect(reopened.TaskPart?.every((p) => p.done)).toBe(true);
  });

  it("splits live and trashed", () => {
    const list = applyTaskPatch(TASKS, 26, {
      trashedAt: "2026-09-01T10:00:00.000Z",
    });
    expect(liveTasks(list).map((t) => t.id)).not.toContain(26);
    expect(trashedTasks(list).map((t) => t.id)).toEqual([26]);
  });

  it("resolves the chain", () => {
    expect(blockerOf(TASKS[2], TASKS)).toEqual({
      kind: "task",
      task: TASKS[5],
    });
    expect(blockerOf(TASKS[1], TASKS)).toEqual({
      kind: "person",
      on: "lena",
      for: "the final logo",
    });
    expect(blockerOf(TASKS[5], TASKS)).toBeNull();
    // 26 holds 17, which holds 18.
    expect(unblocks(TASKS[5], TASKS)).toBe(2);
    expect(unblocks(TASKS[0], TASKS)).toBe(1);
    expect(blocking(TASKS)).toEqual({ lena: 1 });
  });

  it("counts the closed-day streak up to yesterday", () => {
    expect(streak([1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0])).toBe(3);
    expect(streak([1, 1])).toBe(1);
  });
});

describe("projects", () => {
  it("resolves id, name and alias, and never falls back", () => {
    expect(project("ops", PROJECTS)?.name).toBe("Operations");
    expect(project("Design system", PROJECTS)?.id).toBe("ds");
    expect(project("de", PROJECTS, ALIAS)?.id).toBe("german");
    expect(project("nope", PROJECTS)).toBeNull();
    expect(project(null, PROJECTS)).toBeNull();
  });

  it("gives a block its project's mark or the neutral", () => {
    expect(cvProject("resale", PROJECTS)).toEqual({
      color: "var(--hue-green)",
      icon: "package",
    });
    expect(cvProject(null, PROJECTS)).toEqual({
      color: "var(--text-tertiary)",
      icon: "list-checks",
    });
  });

  it.each([
    [0, "0 min"],
    [45, "45 min"],
    [60, "1 h"],
    [95, "1 h 35 min"],
    [240, "4 h"],
  ])("cvDur(%p) → %p", (min, label) => {
    expect(cvDur(min)).toBe(label);
  });
});

describe("habits", () => {
  it("rebuilds the fourteen-day strips from checkins", () => {
    for (const [id, strip] of Object.entries(HABIT_STRIPS)) {
      expect(habitDays(id, CHECKINS, TODAY)).toEqual(strip);
    }
  });

  it("counts streaks, an open today not breaking them", () => {
    expect(habitStreak("de", CHECKINS, TODAY)).toBe(2);
    expect(habitStreak("walk", CHECKINS, TODAY)).toBe(7);
    expect(habitStreak("gym", CHECKINS, TODAY)).toBe(0);
    expect(habitStreak("read", CHECKINS, TODAY)).toBe(5);
  });

  it("counts the last seven days", () => {
    expect(habitWeek("de", CHECKINS, TODAY)).toBe(6);
    expect(habitWeek("walk", CHECKINS, TODAY)).toBe(6);
    expect(habitWeek("gym", CHECKINS, TODAY)).toBe(3);
    expect(habitWeek("read", CHECKINS, TODAY)).toBe(6);
  });

  it("ticks today and extends the streak", () => {
    const next = setCheckin(CHECKINS, "walk", TODAY, true);
    expect(habitStreak("walk", next, TODAY)).toBe(8);
    const unticked = setCheckin(next, "walk", TODAY, false);
    expect(habitStreak("walk", unticked, TODAY)).toBe(7);
  });

  it("wears its own colour, else its project's, else none", () => {
    expect(habitColor({ color: "red", projectId: "ops" }, PROJECTS)).toBe(
      "red"
    );
    expect(habitColor({ color: null, projectId: "german" }, PROJECTS)).toBe(
      "var(--hue-violet)"
    );
    expect(habitColor({ color: null, projectId: null }, PROJECTS)).toBeNull();
  });
});

describe("events", () => {
  const standup = {
    id: "e1",
    title: "Standup",
    startAt: "2026-09-01T09:30",
    endAt: "2026-09-01T10:15",
    isAllDay: false,
  };
  const offsite = {
    id: "e2",
    title: "Offsite",
    startAt: "2026-09-03T00:00",
    endAt: "2026-09-05T00:00",
    isAllDay: true,
  };

  it("draws a block by day, hour and length", () => {
    expect(eventBlock(standup)).toMatchObject({
      day: 1,
      date: TODAY,
      at: 9.5,
      len: 45,
    });
    expect(eventBlock(offsite)).toMatchObject({ day: 3, at: null, len: 0 });
  });

  it("finds events touching a range", () => {
    const list = [standup, offsite];
    expect(
      eventsInRange(list, "2026-09-01", "2026-09-02").map((e) => e.id)
    ).toEqual(["e1"]);
    expect(
      eventsInRange(list, "2026-09-04", "2026-09-07").map((e) => e.id)
    ).toEqual(["e2"]);
    expect(eventsInRange(list, "2026-08-31", "2026-09-07")).toHaveLength(2);
  });

  it("moves an event keeping its length", () => {
    expect(moveEvent(standup, "2026-09-02T14:00")).toEqual({
      startAt: "2026-09-02T14:00",
      endAt: "2026-09-02T14:45",
    });
    expect(moveEvent(offsite, "2026-09-07T10:00")).toEqual({
      startAt: "2026-09-07T00:00",
      endAt: "2026-09-09T00:00",
    });
  });

  it("marks overlaps only when a calendar event is involved", () => {
    const items = [
      {
        id: "e1",
        kind: "event" as const,
        startAt: "2026-09-01T09:30",
        endAt: "2026-09-01T10:15",
      },
      {
        id: "t15",
        kind: "task" as const,
        startAt: "2026-09-01T09:00",
        endAt: "2026-09-01T09:45",
      },
      {
        id: "t28",
        kind: "task" as const,
        startAt: "2026-09-01T09:00",
        endAt: "2026-09-01T09:20",
      },
      {
        id: "t29",
        kind: "task" as const,
        startAt: "2026-09-01T10:15",
        endAt: "2026-09-01T10:40",
      },
    ];
    expect(overlaps(items).map(([a, b]) => `${a.id}-${b.id}`)).toEqual([
      "e1-t15",
    ]);
  });
});

describe("mail", () => {
  it.each([
    ["2026-09-01T09:12", "Today"],
    ["2026-08-31T18:02", "Yesterday"],
    ["2026-08-28T10:15", "Friday"],
    ["2026-08-24T08:00", "24 Aug"],
    ["", ""],
  ])("mailDayLabel(%p) → %p", (at, label) => {
    expect(mailDayLabel(at, TODAY)).toBe(label);
  });

  it("reads the time and keeps the inbox live", () => {
    expect(mailTime("2026-09-01T09:12")).toBe("09:12");
    const inbox = liveMail([
      { id: 1, isArchived: false, trashedAt: null },
      { id: 2, isArchived: true, trashedAt: null },
      { id: 3, isArchived: false, trashedAt: "2026-09-01T10:00:00Z" },
    ]);
    expect(inbox.map((m) => m.id)).toEqual([1]);
  });
});
