import { splitHome } from "@/components/needt3/home/derive";

import type { V3Task } from "@/lib/needt3/map";

import {
  dayProgress,
  leadBadge,
  nextEventBadge,
  overdueCount,
  unreadCount,
  urgentIssue,
} from "../live";

const t = (dueDate: string | null, done = false, noSlot = false) => ({
  dueDate,
  done,
  noSlot,
});

describe("sidebar live badges", () => {
  const today = "2026-09-01";

  it("Home: done of due today, nothing when none is due", () => {
    expect(
      dayProgress(
        [t(today, true), t(today), t(today, false, true), t("2026-09-02")],
        today
      )
    ).toEqual({ done: 1, total: 2 });
    expect(dayProgress([t("2026-09-02")], today)).toBeNull();
  });

  it("Tasks: open tasks due before today", () => {
    expect(
      overdueCount(
        [
          t("2026-08-30"),
          t("2026-08-30", true),
          t(today),
          t(null),
          t("2026-08-01", false, true),
        ],
        today
      )
    ).toBe(1);
  });

  it("Mail: unread count", () => {
    expect(
      unreadCount([{ isRead: false }, { isRead: true }, { isRead: false }])
    ).toBe(2);
  });

  it("Calendar: the next timed event today, minutes under an hour", () => {
    const ev = (startAt: string, title = "Standup", isAllDay = false) => ({
      startAt,
      title,
      isAllDay,
    });
    const events = [
      ev("2026-09-01T09:00"),
      ev("2026-09-01T00:00", "Holiday", true),
      ev("2026-09-01T16:30", "Review"),
      ev("2026-09-01T10:05", "Call"),
      ev("2026-09-02T08:00"),
    ];
    expect(nextEventBadge(events, "2026-09-01T09:30")).toEqual({
      text: "35m",
      mins: 35,
      urgent: null,
    });
    expect(nextEventBadge(events, "2026-09-01T09:58")).toEqual({
      text: "7m",
      mins: 7,
      urgent: "“Call” starts in 7 min",
    });
    expect(nextEventBadge(events, "2026-09-01T11:00")?.text).toBe("16:30");
    expect(nextEventBadge(events, "2026-09-01T17:00")).toBeNull();
  });

  it("a ticking countdown is the same issue; a new reason is not", () => {
    expect(urgentIssue("“Call” starts in 7 min")).toBe(
      urgentIssue("“Call” starts in 6 min")
    );
    expect(urgentIssue("3 overdue")).not.toBe(urgentIssue("4 overdue"));
    expect(urgentIssue(null)).toBe("");
  });
});

describe("sidebar counts match what Home lists", () => {
  const today = "2026-09-01";
  const row = (over: Partial<V3Task>) =>
    ({
      id: String(Math.random()),
      done: false,
      noSlot: false,
      dueDate: null,
      scheduledStart: null,
      trashedAt: null,
      ...over,
    }) as V3Task;
  const tasks = [
    row({ dueDate: "2026-08-30" }),
    row({ dueDate: "2026-08-29", done: true }),
    row({ dueDate: "2026-08-28", trashedAt: "2026-08-31T10:00:00" }),
    row({ dueDate: "2026-08-27", noSlot: true }),
    row({ dueDate: today }),
    row({ dueDate: today, done: true }),
    row({ dueDate: today, trashedAt: "2026-08-31T10:00:00" }),
    row({ dueDate: "2026-09-05" }),
  ];

  it("overdue badge equals Home's Overdue list", () => {
    expect(overdueCount(tasks, today)).toBe(
      splitHome(tasks, today).late.length
    );
  });

  it("Home progress equals Home's Today list", () => {
    const day = splitHome(tasks, today).day;
    expect(dayProgress(tasks, today)).toEqual({
      done: day.filter((x) => x.done).length,
      total: day.length,
    });
  });
});

describe("leadBadge: one badge across the tiles", () => {
  const all = ["today", "calendar", "tasks", "docs", "mail"];
  const base = {
    tiles: all,
    eventMins: null as number | null,
    overdue: 0,
    progress: null as { done: number; total: number } | null,
    unread: 0,
  };

  it("an event within 15 minutes wins over everything", () => {
    expect(
      leadBadge({
        ...base,
        eventMins: 5,
        overdue: 3,
        progress: { done: 0, total: 13 },
        unread: 2,
      })
    ).toBe("calendar");
  });

  it("then overdue tasks, then Home's progress", () => {
    const more = { ...base, eventMins: 40, progress: { done: 0, total: 13 } };
    expect(leadBadge({ ...more, overdue: 3 })).toBe("tasks");
    expect(leadBadge(more)).toBe("today");
  });

  it("then unread mail, then a later event", () => {
    expect(leadBadge({ ...base, eventMins: 90, unread: 4 })).toBe("mail");
    expect(leadBadge({ ...base, eventMins: 90 })).toBe("calendar");
  });

  it("skips places that are not tiles, and says nothing when nothing is up", () => {
    expect(
      leadBadge({ ...base, tiles: ["today", "docs"], eventMins: 5, overdue: 2 })
    ).toBeNull();
    expect(leadBadge(base)).toBeNull();
    expect(leadBadge({ ...base, progress: { done: 0, total: 0 } })).toBeNull();
  });
});
