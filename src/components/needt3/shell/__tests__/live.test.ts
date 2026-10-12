import {
  dayProgress,
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
      urgent: null,
    });
    expect(nextEventBadge(events, "2026-09-01T09:58")).toEqual({
      text: "7m",
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
