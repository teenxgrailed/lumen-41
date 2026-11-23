import {
  type DaySetTask,
  TIMED_DEFAULT_MINUTES,
  daySummary,
  nextTimedTask,
  taskMinutes,
  tasksOnDay,
} from "../day-set";
import { dayAt } from "../today";

const TODAY = "2026-09-02";

const t = (
  id: string,
  o: Partial<DaySetTask> = {}
): DaySetTask & {
  title: string;
} => ({
  id,
  title: id,
  done: false,
  dueDate: null,
  scheduledStart: null,
  ...o,
});

describe("tasksOnDay: the one set of a day", () => {
  it("takes tasks due or scheduled that day, done ones too", () => {
    const list = [
      t("due", { dueDate: TODAY }),
      t("sched", { scheduledStart: `${TODAY}T11:30`, estimatedMinutes: 30 }),
      t("done", { dueDate: TODAY, done: true }),
    ];
    expect(tasksOnDay(list, TODAY).map((x) => x.id)).toEqual([
      "sched",
      "due",
      "done",
    ]);
  });

  it("leaves out other days, overdue work, Inbox, Trash and no-slot", () => {
    const list = [
      t("tomorrow", { dueDate: "2026-09-03" }),
      t("later", { scheduledStart: "2026-09-04T09:00" }),
      t("overdue", { dueDate: "2026-09-01" }),
      t("inbox"),
      t("trash", { dueDate: TODAY, trashedAt: "2026-09-01T10:00" }),
      t("noslot", { dueDate: TODAY, noSlot: true }),
    ];
    expect(tasksOnDay(list, TODAY)).toEqual([]);
  });

  it("never counts an idea, even one that carries a date", () => {
    const list = [
      t("idea", { dueDate: TODAY, kind: "IDEA" }),
      t("work", { dueDate: TODAY, kind: "TASK" }),
    ];
    expect(tasksOnDay(list, TODAY).map((x) => x.id)).toEqual(["work"]);
    expect(daySummary(list, TODAY).total).toBe(1);
  });

  it("a stale block with no due date is not today", () => {
    expect(
      tasksOnDay([t("old", { scheduledStart: "2026-09-01T19:00" })], TODAY)
    ).toEqual([]);
  });

  it("the day plan's picks belong to the day although no date says so", () => {
    const list = [t("pick"), t("other")];
    expect(tasksOnDay(list, TODAY, new Set(["pick"])).map((x) => x.id)).toEqual(
      ["pick"]
    );
    // ...but not once trashed or an idea
    expect(
      tasksOnDay([t("pick", { trashedAt: "x" })], TODAY, new Set(["pick"]))
    ).toEqual([]);
  });
});

describe("daySummary: done of total, and minutes", () => {
  const list = [
    t("a", { dueDate: TODAY, estimatedMinutes: 60, done: true }),
    t("b", { dueDate: TODAY, estimatedMinutes: 30, done: true }),
    t("c", { scheduledStart: `${TODAY}T11:30`, estimatedMinutes: 20 }),
    t("d", { scheduledStart: `${TODAY}T12:00`, estimatedMinutes: 30 }),
    t("e", { dueDate: TODAY }),
  ];

  it("5 tasks, 2 done: 2 of 5, never 5 of 5", () => {
    const s = daySummary(list, TODAY);
    expect(s.total).toBe(5);
    expect(s.done).toBe(2);
    expect(s.open).toBe(3);
  });

  it("minutes include done work; openMinutes only what is left", () => {
    const s = daySummary(list, TODAY);
    expect(s.minutes).toBe(140);
    expect(s.openMinutes).toBe(50);
  });

  it("an empty day is zero everywhere", () => {
    expect(daySummary([], TODAY)).toMatchObject({
      total: 0,
      done: 0,
      open: 0,
      minutes: 0,
      openMinutes: 0,
    });
  });
});

describe("taskMinutes", () => {
  it("estimate first, else 30 for a task with a time (as the Calendar draws it), else 0", () => {
    expect(taskMinutes({ estimatedMinutes: 45 }, TODAY)).toBe(45);
    expect(
      taskMinutes(
        { estimatedMinutes: null, scheduledStart: `${TODAY}T09:00` },
        TODAY
      )
    ).toBe(TIMED_DEFAULT_MINUTES);
    expect(taskMinutes({ estimatedMinutes: null }, TODAY)).toBe(0);
    expect(
      taskMinutes({ estimatedMinutes: 0, scheduledStart: null }, TODAY)
    ).toBe(0);
  });

  it("30 only for a block on the counted day: a stale block yesterday adds nothing", () => {
    const stale = {
      estimatedMinutes: null,
      scheduledStart: "2026-09-01T19:00",
    };
    expect(taskMinutes(stale, TODAY)).toBe(0);
    expect(
      taskMinutes({ ...stale, scheduledStart: `${TODAY}T10:00` }, TODAY)
    ).toBe(30);
    const s = daySummary(
      [t("late", { dueDate: TODAY, scheduledStart: "2026-09-01T19:00" })],
      TODAY
    );
    expect(s.total).toBe(1); // due today: it is in the set...
    expect(s.minutes).toBe(0); // ...but a block yesterday is not a time today
    expect(s.openMinutes).toBe(0);
  });

  it("a timed task with no estimate is 30 booked in the day total", () => {
    const s = daySummary([t("a", { scheduledStart: `${TODAY}T10:00` })], TODAY);
    expect(s.minutes).toBe(30);
  });
});

describe("plan picks (include)", () => {
  const pick = new Set(["p"]);
  it("an undated pick and an overdue pick join today", () => {
    expect(tasksOnDay([t("p")], TODAY, pick)).toHaveLength(1);
    expect(
      tasksOnDay([t("p", { dueDate: "2026-09-01" })], TODAY, pick)
    ).toHaveLength(1);
  });

  it("a pick moved to a later day does not count today", () => {
    expect(
      tasksOnDay([t("p", { dueDate: "2026-09-04" })], TODAY, pick)
    ).toEqual([]);
    expect(
      tasksOnDay([t("p", { scheduledStart: "2026-09-03T09:00" })], TODAY, pick)
    ).toEqual([]);
  });

  it("a pick that is a no-slot task still joins (the plan chose it)", () => {
    expect(tasksOnDay([t("p", { noSlot: true })], TODAY, pick)).toHaveLength(1);
  });
});

describe("a pick the close sent away", () => {
  it("leaves the picks, but a task still dated today stays in today's set", () => {
    // planPickIds drops resolution "tomorrow"; the close never changes the date
    const x = t("x", { dueDate: TODAY });
    expect(tasksOnDay([x], TODAY, new Set())).toHaveLength(1);
    // an undated one sent away is gone
    expect(tasksOnDay([t("y")], TODAY, new Set())).toEqual([]);
  });
});

describe("a done task due earlier but scheduled today", () => {
  it("sits on its due day (taskDay), so it is not in today's set, as on Home", () => {
    const x = t("x", {
      done: true,
      dueDate: "2026-09-01",
      scheduledStart: `${TODAY}T09:00`,
    });
    expect(tasksOnDay([x], TODAY)).toEqual([]);
  });
});

describe("the person's day, timezone edge", () => {
  it("23:30 local is still today, 00:30 local is tomorrow", () => {
    const list = [
      t("late", { scheduledStart: `${TODAY}T23:30` }),
      t("after", { scheduledStart: "2026-09-03T00:30" }),
    ];
    expect(tasksOnDay(list, TODAY).map((x) => x.id)).toEqual(["late"]);
  });

  it("the day comes from the caller's zone: 22:30 UTC is tomorrow in Zurich", () => {
    const now = new Date("2026-09-02T22:30:00Z");
    expect(dayAt(now, "UTC")).toBe("2026-09-02");
    const zurich = dayAt(now, "Europe/Zurich");
    expect(zurich).toBe("2026-09-03");
    const list = [
      t("a", { dueDate: "2026-09-02" }),
      t("b", { dueDate: "2026-09-03" }),
    ];
    expect(tasksOnDay(list, zurich).map((x) => x.id)).toEqual(["b"]);
  });
});

describe("nextTimedTask", () => {
  const list = [
    t("gone", { scheduledStart: `${TODAY}T08:00` }),
    t("done", { scheduledStart: `${TODAY}T11:00`, done: true }),
    t("second", { scheduledStart: `${TODAY}T12:00` }),
    t("first", { scheduledStart: `${TODAY}T11:30` }),
    t("untimed", { dueDate: TODAY }),
  ];
  it("the earliest open timed task still to start", () => {
    expect(nextTimedTask(tasksOnDay(list, TODAY), `${TODAY}T10:00`)).toEqual({
      title: "first",
      at: "11:30",
    });
  });
  it("null when nothing timed is left", () => {
    expect(nextTimedTask(tasksOnDay(list, TODAY), `${TODAY}T13:00`)).toBeNull();
  });
});
