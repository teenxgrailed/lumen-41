import type { V3Task } from "@/lib/needt3/map";

import { agoLabel, buildMenuCounts, nextEventOf } from "../counts";

const NOW = "2026-09-01T10:30";
const NOW_MS = 1_000_000_000_000;

const task = (o: Partial<V3Task>): V3Task =>
  ({
    id: "t",
    title: "t",
    done: false,
    noSlot: false,
    isFixed: false,
    dueDate: null,
    scheduledStart: null,
    ...o,
  }) as unknown as V3Task;

describe("agoLabel", () => {
  it("says it the way a grey line does", () => {
    expect(agoLabel(0)).toBe("just now");
    expect(agoLabel(30_000)).toBe("just now");
    expect(agoLabel(5 * 60_000)).toBe("5 min ago");
    expect(agoLabel(59 * 60_000)).toBe("59 min ago");
    expect(agoLabel(2 * 3_600_000)).toBe("2 h ago");
    expect(agoLabel(30 * 3_600_000)).toBe("yesterday");
    expect(agoLabel(4 * 86_400_000)).toBe("4 d ago");
    expect(agoLabel(40 * 86_400_000)).toBe("a while ago");
    expect(agoLabel(-5)).toBe("just now");
  });
});

describe("nextEventOf", () => {
  const ev = (title: string, startAt: string, isAllDay = false) => ({
    title,
    startAt,
    isAllDay,
  });

  it("the next timed event still to start today", () => {
    expect(
      nextEventOf(
        [
          ev("Earlier", "2026-09-01T09:00"),
          ev("Later", "2026-09-01T16:00"),
          ev("Soon", "2026-09-01T11:12"),
          ev("Tomorrow", "2026-09-02T09:00"),
          ev("All day", "2026-09-01T00:00", true),
        ],
        NOW
      )
    ).toEqual({ title: "Soon", at: "11:12", inMin: 42 });
  });

  it("nothing left today is null", () => {
    expect(nextEventOf([ev("Gone", "2026-09-01T09:00")], NOW)).toBeNull();
    expect(nextEventOf([], NOW)).toBeNull();
  });

  it("an untitled event still has a name", () => {
    expect(nextEventOf([ev("", "2026-09-01T12:00")], NOW)?.title).toBe("Event");
  });
});

describe("buildMenuCounts", () => {
  it("reports only what has loaded", () => {
    expect(buildMenuCounts({ now: NOW, nowMs: NOW_MS })).toEqual({});
  });

  it("tasks: overdue, left today, open, not placed", () => {
    const c = buildMenuCounts({
      now: NOW,
      nowMs: NOW_MS,
      tasks: [
        task({ id: "a", dueDate: "2026-08-30" }), // overdue
        task({ id: "b", dueDate: "2026-09-01" }), // today
        task({ id: "c", dueDate: "2026-09-01", done: true }),
        task({ id: "d", dueDate: "2026-09-01", noSlot: true }),
        task({ id: "e", scheduledStart: "2026-09-02T09:00" }),
        task({ id: "f", isFixed: true }),
      ],
    });
    expect(c.overdue).toBe(1);
    expect(c.today).toBe(1);
    expect(c.open).toBe(5);
    // not done, not fixed, not noSlot, no start: a, b
    expect(c.unplaced).toBe(2);
  });

  it("mail: unread", () => {
    expect(
      buildMenuCounts({
        now: NOW,
        nowMs: NOW_MS,
        mail: [{ isRead: false }, { isRead: true }, { isRead: false }] as never,
      }).mail
    ).toBe(2);
  });

  it("docs: live count and the latest edit", () => {
    const c = buildMenuCounts({
      now: NOW,
      nowMs: NOW_MS,
      docs: [
        { id: "1", trashedAt: null },
        { id: "2", trashedAt: null },
        { id: "3", trashedAt: "2026-08-01" },
      ] as never,
      docEditedMs: new Map([
        ["1", NOW_MS - 3_600_000],
        ["2", NOW_MS - 5 * 60_000],
        ["3", NOW_MS - 1000], // trashed: does not count
      ]),
    });
    expect(c.docs).toBe(2);
    expect(c.docsEdited).toBe("5 min ago");
  });

  it("docs with no edit time have no 'edited' line", () => {
    const c = buildMenuCounts({
      now: NOW,
      nowMs: NOW_MS,
      docs: [{ id: "1", trashedAt: null }] as never,
    });
    expect(c.docsEdited).toBeNull();
  });

  it("boards and projects: trashed and archived do not count", () => {
    const c = buildMenuCounts({
      now: NOW,
      nowMs: NOW_MS,
      boards: [{ trashedAt: null }, { trashedAt: "x" }] as never,
      projects: [{ archived: false }, { archived: true }] as never,
    });
    expect(c.boards).toBe(1);
    expect(c.projects).toBe(1);
  });

  it("habits: live ones, and how many are kept today (once check-ins load)", () => {
    const habits = [
      { id: "h1", archivedAt: null },
      { id: "h2", archivedAt: null },
      { id: "h3", archivedAt: "2026-01-01" },
    ] as never;
    const before = buildMenuCounts({ now: NOW, nowMs: NOW_MS, habits });
    expect(before.habits).toBe(2);
    expect(before.habitsDone).toBeUndefined();
    const c = buildMenuCounts({
      now: NOW,
      nowMs: NOW_MS,
      habits,
      checkins: [
        { habitId: "h1", date: "2026-09-01", done: true },
        { habitId: "h2", date: "2026-08-31", done: true },
        { habitId: "h3", date: "2026-09-01", done: true },
      ],
    });
    expect(c.habitsDone).toBe(1);
  });

  it("connections: how many are fine, and who needs the person", () => {
    const c = buildMenuCounts({
      now: NOW,
      nowMs: NOW_MS,
      connections: [
        { kind: "calendar", state: "connected", label: "Google" },
        { kind: "mail", state: "error", label: "Outlook" },
        { kind: "integration", state: "disconnected", label: "Notion" },
      ] as never,
    });
    expect(c.connected).toBe(1);
    expect(c.connectionsDown).toEqual(["Outlook", "Notion"]);
    expect(c.mailDown).toEqual(["Outlook"]);
  });
});
