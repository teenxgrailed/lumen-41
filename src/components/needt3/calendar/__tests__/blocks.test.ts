import type { V3Event, V3Task } from "@/lib/needt3/map";

import { calendarItems, canEditEvent, hideDoneTitle } from "../blocks";

const today = "2026-09-01";

const task = (over: Partial<V3Task>): V3Task => ({
  id: "t",
  title: "Task",
  notes: null,
  done: false,
  status: "todo",
  projectId: null,
  dueDate: null,
  estimatedMinutes: null,
  scheduledStart: null,
  scheduledEnd: null,
  isFixed: false,
  auto: false,
  noSlot: false,
  entry: null,
  chunk: null,
  splitAllowed: true,
  deadline: null,
  hardDeadline: false,
  priority: "medium",
  holder: null,
  blockedBy: null,
  value: null,
  earned: null,
  Stage: null,
  movedFrom: null,
  trashedAt: null,
  source: null,
  repeat: null,
  scheduleId: null,
  updatedAt: null,
  parts: [],
  waits: [],
  ...over,
});

const ev = (over: Partial<V3Event>): V3Event => ({
  id: "e",
  title: "Standup",
  startAt: "2026-09-01T10:30",
  endAt: "2026-09-01T10:45",
  isAllDay: false,
  calendarId: "work",
  source: "google",
  externalId: "gcal-e",
  ...over,
});

describe("calendarItems", () => {
  it("draws a placed task on the day of its start, 30 min by default", () => {
    const { timed } = calendarItems({
      tasks: [
        task({
          id: "a",
          dueDate: "2026-09-04",
          scheduledStart: "2026-09-02T09:15",
        }),
      ],
      events: [],
      today,
      hideDone: false,
    });
    expect(timed).toHaveLength(1);
    expect(timed[0]).toMatchObject({ date: "2026-09-02", at: 9.25, len: 30 });
  });

  it("lists tasks without an hour (or no slot) as all-day rows", () => {
    const { timed, loose } = calendarItems({
      tasks: [
        task({ id: "a", dueDate: "2026-09-03" }),
        task({
          id: "b",
          dueDate: "2026-09-03",
          scheduledStart: "2026-09-03T10:00",
          noSlot: true,
        }),
        task({ id: "c" }),
      ],
      events: [],
      today,
      hideDone: false,
    });
    expect(timed).toHaveLength(0);
    expect(loose.map((b) => b.id)).toEqual(["a", "b"]);
  });

  it("leaves out trashed and overdue tasks, and done ones when hidden", () => {
    const tasks = [
      task({ id: "trash", dueDate: today, trashedAt: "2026-09-01T00:00:00Z" }),
      task({ id: "late", dueDate: "2026-08-30" }),
      task({ id: "done", dueDate: today, done: true, status: "completed" }),
      task({ id: "open", dueDate: today }),
    ];
    const shown = calendarItems({ tasks, events: [], today, hideDone: false });
    expect(shown.loose.map((b) => b.id)).toEqual(["done", "open"]);
    const hidden = calendarItems({ tasks, events: [], today, hideDone: true });
    expect(hidden.loose.map((b) => b.id)).toEqual(["open"]);
    expect(hidden.doneHidden).toBe(1);
  });

  it("draws events grey with their calendar's name; own ones are deletable", () => {
    const { timed } = calendarItems({
      tasks: [],
      events: [
        ev({}),
        ev({ id: "mine", source: "needt", calendarId: "local" }),
      ],
      calendarNames: new Map([["work", "Work"]]),
      ownCalendarIds: new Set(["work", "local"]),
      today,
      hideDone: true,
    });
    expect(timed[0]).toMatchObject({
      event: true,
      own: false,
      at: 10.5,
      len: 15,
    });
    expect(timed[0].entry).toMatchObject({
      kind: "event",
      calendarName: "Work",
    });
    expect(timed[1]).toMatchObject({ own: true });
    expect(timed[1].entry).toMatchObject({ calendarName: "Your events" });
  });

  it("a workspace busy block is never the person's own", () => {
    const { timed } = calendarItems({
      tasks: [],
      events: [
        ev({
          id: "workspace-busy:abc",
          title: "Busy",
          source: "needt",
          calendarId: "workspace-busy",
        }),
      ],
      ownCalendarIds: new Set(["local"]),
      today,
      hideDone: false,
    });
    expect(timed[0]).toMatchObject({ event: true, own: false });
    expect(timed[0].entry).toMatchObject({ calendarName: "Workspace" });
    expect(canEditEvent(timed[0])).toBe(false);
  });

  it("only an own, non-recurring event is editable", () => {
    const { timed } = calendarItems({
      tasks: [task({ id: "t", scheduledStart: "2026-09-01T09:00" })],
      events: [
        ev({ id: "synced" }),
        ev({ id: "mine", source: "needt", calendarId: "local" }),
        ev({
          id: "series",
          source: "needt",
          calendarId: "local",
          isRecurring: true,
          recurrenceRule: "FREQ=WEEKLY",
        }),
      ],
      ownCalendarIds: new Set(["work", "local"]),
      today,
      hideDone: false,
    });
    const by = new Map(timed.map((b) => [b.id, b]));
    expect(canEditEvent(by.get("t")!)).toBe(true);
    expect(canEditEvent(by.get("synced")!)).toBe(false);
    expect(canEditEvent(by.get("mine")!)).toBe(true);
    expect(by.get("series")).toMatchObject({ own: true, recurring: true });
    expect(canEditEvent(by.get("series")!)).toBe(false);
  });

  it("puts an all-day event on every day it covers", () => {
    const { loose } = calendarItems({
      tasks: [],
      events: [
        ev({
          isAllDay: true,
          startAt: "2026-09-04T00:00",
          endAt: "2026-09-06T00:00",
        }),
      ],
      today,
      hideDone: false,
    });
    expect(loose.map((b) => b.date)).toEqual(["2026-09-04", "2026-09-05"]);
  });

  it("clips a timed event past midnight to its first day", () => {
    const { timed } = calendarItems({
      tasks: [],
      events: [ev({ startAt: "2026-09-01T23:00", endAt: "2026-09-02T01:00" })],
      today,
      hideDone: false,
    });
    expect(timed[0]).toMatchObject({ date: "2026-09-01", at: 23, len: 60 });
  });
});

describe("hideDoneTitle", () => {
  it("says what the toggle does", () => {
    expect(hideDoneTitle(false, 3)).toBe("Hide completed tasks");
    expect(hideDoneTitle(true, 0)).toBe(
      "Done tasks are hidden — click to show"
    );
    expect(hideDoneTitle(true, 1)).toBe("1 done task hidden — click to show");
    expect(hideDoneTitle(true, 2)).toBe("2 done tasks hidden — click to show");
  });
});
