import {
  type FocusRow,
  clockOf,
  endsAt,
  intentionOf,
  lengthFromPref,
  lengthMinutes,
  nextTask,
  openTasks,
  runOf,
  startedLine,
  statsFromApi,
  summaryOf,
  tabTitle,
  taskChoices,
  taskOf,
} from "../focus";

const START = Date.parse("2026-10-14T10:00:00Z");
const row = (over: Partial<FocusRow> = {}): FocusRow => ({
  id: "s1",
  taskId: "t1",
  intention: "Draft",
  plannedMinutes: 25,
  startedAt: new Date(START).toISOString(),
  pausedAt: null,
  pausedTotalSeconds: 0,
  phase: "FOCUS",
  ...over,
});
const at = (sec: number) => START + sec * 1000;

describe("runOf", () => {
  it("counts down from the planned length", () => {
    const r = runOf(row(), at(90));
    expect(r.elapsedSec).toBe(90);
    expect(r.leftSec).toBe(25 * 60 - 90);
    expect(clockOf(r)).toBe("23:30");
    expect(r.due).toBe(false);
    expect(r.pct).toBeCloseTo(90 / 1500);
  });

  it("is due when the length has run out, unless paused", () => {
    expect(runOf(row(), at(1500)).due).toBe(true);
    expect(runOf(row(), at(1500)).leftSec).toBe(0);
    const paused = row({ pausedAt: new Date(at(600)).toISOString() });
    // frozen at 10 min however late the clock reads
    const r = runOf(paused, at(5000));
    expect(r.paused).toBe(true);
    expect(r.elapsedSec).toBe(600);
    expect(r.due).toBe(false);
  });

  it("takes earlier pauses off", () => {
    const r = runOf(row({ pausedTotalSeconds: 120 }), at(300));
    expect(r.elapsedSec).toBe(180);
  });

  it("a session with no planned length counts up and never ends", () => {
    const r = runOf(row({ plannedMinutes: null }), at(61));
    expect(r.leftSec).toBeNull();
    expect(clockOf(r)).toBe("01:01");
    expect(r.due).toBe(false);
    expect(r.pct).toBe(0);
    expect(endsAt(r, at(61), "UTC")).toBeNull();
  });

  it("knows a break", () => {
    expect(runOf(row({ phase: "SHORT_BREAK" }), at(0)).isBreak).toBe(true);
    expect(runOf(row(), at(0)).isBreak).toBe(false);
  });

  it("says when it ends, in the person's zone", () => {
    const r = runOf(row(), at(0));
    expect(endsAt(r, at(0), "UTC")).toBe("10:25");
    expect(endsAt(r, at(0), "Europe/Berlin")).toBe("12:25");
  });
});

describe("length", () => {
  it("reads the saved default", () => {
    expect(lengthFromPref("25")).toEqual({ len: "25", custom: "40" });
    expect(lengthFromPref("45")).toEqual({ len: "custom", custom: "45" });
    expect(lengthFromPref(undefined).len).toBe("50");
  });

  it("holds custom to 1..240", () => {
    expect(lengthMinutes("90", "")).toEqual({ minutes: 90, bad: false });
    expect(lengthMinutes("custom", "40")).toEqual({ minutes: 40, bad: false });
    expect(lengthMinutes("custom", "0").bad).toBe(true);
    expect(lengthMinutes("custom", "241")).toEqual({ minutes: 240, bad: true });
    expect(lengthMinutes("custom", "").bad).toBe(true);
  });
});

describe("tasks", () => {
  const t = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    title: "T" + id,
    done: false,
    noSlot: false,
    trashedAt: null,
    ...over,
  });
  const list = [
    t("1"),
    t("2", { done: true }),
    t("3", { noSlot: true }),
    t("4", { trashedAt: "x" }),
    t("5"),
    t("6"),
  ];

  it("offers open tasks only", () => {
    expect(openTasks(list).map((x) => x.id)).toEqual(["1", "5", "6"]);
    expect(openTasks(undefined)).toEqual([]);
  });

  it("puts the chosen task first and stops at six", () => {
    const many = Array.from({ length: 9 }, (_, i) => t(String(i)));
    const out = taskChoices(many, "7");
    expect(out).toHaveLength(6);
    expect(out[0].id).toBe("7");
  });

  it("finds the next task and the session's own task", () => {
    expect(nextTask(list, "1")?.id).toBe("5");
    expect(nextTask([t("1")], "1")).toBeNull();
    expect(taskOf(list, { taskId: "5", intention: null })?.id).toBe("5");
    expect(taskOf(list, { taskId: null, intention: "T6" })?.id).toBe("6");
    expect(taskOf(list, { taskId: null, intention: "nope" })).toBeNull();
  });

  it("names a session by purpose, else task, else Focus", () => {
    expect(intentionOf("  the draft ", { title: "T" })).toBe("the draft");
    expect(intentionOf("", { title: "T" })).toBe("T");
    expect(intentionOf("", null)).toBe("Focus");
  });
});

describe("the notice, the tab, the summary", () => {
  it("words the start", () => {
    expect(startedLine(25, "Write")).toBe("Focus started · 25 min on “Write”");
  });

  it("puts the clock in front of the tab title once", () => {
    expect(tabTitle("Today | Needt", "24:59")).toBe("24:59 · Today | Needt");
    expect(tabTitle("24:59 · Today | Needt", "24:58")).toBe(
      "24:58 · Today | Needt"
    );
    expect(tabTitle("24:58 · Today | Needt", null)).toBe("Today | Needt");
    expect(tabTitle("Today", null)).toBe("Today");
  });

  it("summarises minutes", () => {
    const r = runOf(row(), at(29 * 60));
    expect(summaryOf(r, "Draft", "stopped")).toEqual({
      minutes: 29,
      title: "Draft",
      taskId: "t1",
      how: "stopped",
    });
  });

  it("reads today from the weekly report", () => {
    expect(
      statsFromApi({
        stats: { currentStreak: 3 },
        weeklyReport: {
          sessionsCompleted: 4,
          dailyMinutes: [{ minutes: 5 }, { minutes: 50 }],
        },
      })
    ).toEqual({ minutesToday: 50, sessionsWeek: 4, streak: 3 });
    expect(statsFromApi({})).toEqual({
      minutesToday: 0,
      sessionsWeek: 0,
      streak: 0,
    });
  });
});
