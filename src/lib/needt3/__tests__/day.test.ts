import {
  addedLabel,
  clock,
  createDraft,
  durLabel,
  fileSize,
  hourOfWord,
  isLate,
  laterPatch,
  minutesOfWord,
  moveOverdue,
  nextUp,
  part,
  parts,
  prio,
  sections,
  snapshot,
} from "../day";

/** The prototype's fixed day: Tue 1 Sep 2026. */
const TODAY = "2026-09-01";

const task = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: id,
  done: false,
  noSlot: false,
  isFixed: false,
  dueDate: TODAY as string | null,
  scheduledStart: null as string | null,
  scheduledEnd: null as string | null,
  estimatedMinutes: 30 as number | null,
  ...over,
});

const set = [
  task("late-old", {
    dueDate: "2026-08-28",
    scheduledStart: "2026-08-28T10:00",
  }),
  task("late-new", { dueDate: "2026-08-31" }),
  task("late-done", { dueDate: "2026-08-30", done: true }),
  task("late-noslot", { dueDate: "2026-08-30", noSlot: true }),
  task("t-pm", { scheduledStart: "2026-09-01T14:00" }),
  task("t-am", { scheduledStart: "2026-09-01T09:30" }),
  task("t-any"),
  task("inbox", { dueDate: null }),
  task("fixed-nodate", { dueDate: null, isFixed: true }),
  task("tomorrow", { dueDate: "2026-09-02" }),
];

describe("part", () => {
  it("splits the day", () => {
    expect(part(null)).toBe("Anytime");
    expect(part(9)).toBe("Morning");
    expect(part(11.99)).toBe("Morning");
    expect(part(12)).toBe("Afternoon");
    expect(part(16.5)).toBe("Afternoon");
    expect(part(17)).toBe("Evening");
  });
});

describe("sections", () => {
  const s = sections(set, TODAY);
  it("late is open, placed, past, oldest first", () => {
    expect(s.late.map((t) => t.id)).toEqual(["late-old", "late-new"]);
    expect(isLate(set[2], TODAY)).toBe(false);
    expect(isLate(set[3], TODAY)).toBe(false);
  });
  it("today is in time order, unplaced last", () => {
    expect(s.day.map((t) => t.id)).toEqual(["t-am", "t-pm", "t-any"]);
  });
  it("inbox has no day and is not fixed; next is tomorrow", () => {
    expect(s.inbox.map((t) => t.id)).toEqual(["inbox"]);
    expect(s.next.map((t) => t.id)).toEqual(["tomorrow"]);
  });
  it("parts group by part of day, in order, empty ones dropped", () => {
    expect(parts(s.day).map(([p, l]) => [p, l.map((t) => t.id)])).toEqual([
      ["Morning", ["t-am"]],
      ["Afternoon", ["t-pm"]],
      ["Anytime", ["t-any"]],
    ]);
  });
});

describe("nextUp", () => {
  const s = sections(set, TODAY);
  it("overdue first, oldest", () => {
    const n = nextUp(s);
    expect(n.nu?.id).toBe("late-old");
    expect(n.after).toBeNull();
    expect(n.cands.map((t) => t.id)).toEqual([
      "late-old",
      "late-new",
      "t-am",
      "t-pm",
      "t-any",
    ]);
  });
  it("with nothing late, the next in time and the one after", () => {
    const n = nextUp({ late: [], day: s.day });
    expect(n.nu?.id).toBe("t-am");
    expect(n.after?.id).toBe("t-pm");
  });
  it("Skip cycles and wraps when none is fresh", () => {
    const only = nextUp({ late: [], day: s.day.slice(0, 2) });
    const skipped = only.skip([]);
    expect(skipped).toEqual(["t-am"]);
    const second = nextUp({ late: [], day: s.day.slice(0, 2) }, { skipped });
    expect(second.nu?.id).toBe("t-pm");
    expect(second.skip(skipped)).toEqual([]);
    const lone = nextUp({ late: [], day: s.day.slice(0, 1) });
    expect(lone.skip([])).toEqual([]);
  });
  it("rows still leaving do not count", () => {
    const n = nextUp({ late: [], day: s.day }, { busy: { "t-am": 1 } });
    expect(n.nu?.id).toBe("t-pm");
    expect(nextUp({ late: [], day: [] }).nu).toBeNull();
  });
});

describe("moving work", () => {
  it("later keeps the hour and goes to tomorrow", () => {
    expect(laterPatch(set[4], TODAY)).toEqual({
      dueDate: "2026-09-02",
      scheduledStart: "2026-09-02T14:00",
      scheduledEnd: "2026-09-02T14:30",
    });
    expect(laterPatch(set[6], TODAY)).toEqual({ dueDate: "2026-09-02" });
  });
  it("snapshot is what undo needs", () => {
    expect(snapshot(set[4])).toEqual({
      dueDate: TODAY,
      scheduledStart: "2026-09-01T14:00",
      scheduledEnd: null,
    });
  });
  it("move overdue to today, with the words and the way back", () => {
    const m = moveOverdue(set, TODAY);
    expect(m?.label).toBe("2 tasks moved to today");
    expect(m?.moves.map((x) => x.id)).toEqual(["late-old", "late-new"]);
    expect(m?.moves[0].patch).toEqual({
      dueDate: TODAY,
      scheduledStart: "2026-09-01T10:00",
      scheduledEnd: "2026-09-01T10:30",
    });
    expect(m?.moves[0].before.dueDate).toBe("2026-08-28");
    expect(moveOverdue([set[6]], TODAY)).toBeNull();
    expect(moveOverdue([set[1]], TODAY)?.label).toBe("1 task moved to today");
  });
});

describe("words", () => {
  it("priority aliases", () => {
    expect(prio("asap")).toBe("urgent");
    expect(prio("Important")).toBe("high");
    expect(prio("whenever")).toBe("low");
    expect(prio("medium")).toBe("medium");
    expect(prio("nonsense")).toBeNull();
    expect(prio(null)).toBeNull();
  });
  it("hours", () => {
    expect(hourOfWord("3pm")).toBe(15);
    expect(hourOfWord("12am")).toBe(0);
    expect(hourOfWord("12pm")).toBe(12);
    expect(hourOfWord("15:30")).toBe(15.5);
    expect(hourOfWord("noon")).toBe(12);
    expect(hourOfWord("midnight")).toBe(0);
    expect(hourOfWord(9.5)).toBe(9.5);
    expect(hourOfWord("25:00")).toBeNull();
    expect(hourOfWord("13pm")).toBeNull();
    expect(hourOfWord("0am")).toBeNull();
    expect(hourOfWord("00pm")).toBeNull();
    expect(hourOfWord("14am")).toBeNull();
    expect(hourOfWord("1am")).toBe(1);
    expect(hourOfWord("11pm")).toBe(23);
    expect(hourOfWord("12:30pm")).toBe(12.5);
    expect(hourOfWord("12:30am")).toBe(0.5);
    expect(hourOfWord("0:30")).toBe(0.5);
    expect(hourOfWord("soon")).toBeNull();
  });
  it("minutes", () => {
    expect(minutesOfWord("45m")).toBe(45);
    expect(minutesOfWord("2h")).toBe(120);
    expect(minutesOfWord("1.5h")).toBe(90);
    expect(minutesOfWord("90")).toBe(90);
    expect(minutesOfWord(0)).toBeNull();
    expect(minutesOfWord("later")).toBeNull();
  });
  it("labels", () => {
    expect(durLabel(45)).toBe("45 min");
    expect(durLabel(90)).toBe("1 h 30");
    expect(durLabel(120)).toBe("2 h");
    expect(durLabel(null)).toBe("");
    expect(clock(14.5)).toBe("14:30");
    expect(clock(9)).toBe("09:00");
    expect(clock(null)).toBe("");
    expect(fileSize(900)).toBe("900 B");
    expect(fileSize(2048)).toBe("2 KB");
    expect(fileSize(3 * 1_048_576)).toBe("3.0 MB");
  });
});

describe("create", () => {
  it("lands on today with 30 minutes", () => {
    expect(createDraft({ title: "  Call Anna " }, TODAY)).toEqual({
      title: "Call Anna",
      estimatedMinutes: 30,
      dueDate: TODAY,
    });
  });
  it("tomorrow 3pm 45m #project !asap places and fixes it", () => {
    const d = createDraft(
      {
        title: "Call Anna",
        date: "tomorrow",
        time: "3pm",
        duration: "45m",
        projectId: "p1",
        priority: "asap",
        notes: "ask about the quote",
      },
      TODAY
    );
    expect(d).toMatchObject({
      title: "Call Anna",
      dueDate: "2026-09-02",
      scheduledStart: "2026-09-02T15:00",
      scheduledEnd: "2026-09-02T15:45",
      estimatedMinutes: 45,
      isFixed: true,
      projectId: "p1",
      priority: "urgent",
      notes: "ask about the quote",
    });
  });
  it("says where it went", () => {
    expect(addedLabel({ dueDate: null }, TODAY)).toBe("Added to Inbox");
    expect(addedLabel({ dueDate: TODAY }, TODAY)).toBe("Added to today");
    expect(addedLabel({ dueDate: "2026-09-04" }, TODAY)).toBe("Added — 4 Sep");
  });
});
