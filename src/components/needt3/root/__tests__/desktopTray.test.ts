import {
  focusLine,
  nextTasks,
  trayState,
} from "@/components/needt3/root/desktopTray";

import type { FocusRow } from "@/lib/needt3/focus";
import type { V3Task } from "@/lib/needt3/map";

const TODAY = "2026-10-21";
const task = (id: string, o: Partial<V3Task> = {}) =>
  ({
    id,
    title: `Task ${id}`,
    done: false,
    noSlot: false,
    isFixed: false,
    dueDate: TODAY,
    scheduledStart: null,
    scheduledEnd: null,
    estimatedMinutes: null,
    trashedAt: null,
    projectId: null,
    ...o,
  }) as unknown as V3Task;

describe("nextTasks", () => {
  it("lists what lies ahead by time, then untimed, then past, then overdue", () => {
    const tasks = [
      task("past", { scheduledStart: `${TODAY}T08:00` }),
      task("untimed"),
      task("later", { scheduledStart: `${TODAY}T15:30` }),
      task("soon", { scheduledStart: `${TODAY}T10:00` }),
      task("late", { dueDate: "2026-10-19" }),
    ];
    expect(nextTasks(tasks, TODAY, 9.5, 10).map((t) => t.id)).toEqual([
      "soon",
      "later",
      "untimed",
      "past",
      "late",
    ]);
  });

  it("stops at three by default and shows the time of timed tasks only", () => {
    const tasks = [
      task("a", { scheduledStart: `${TODAY}T10:00` }),
      task("b", { scheduledStart: `${TODAY}T11:15` }),
      task("c"),
      task("d", { scheduledStart: `${TODAY}T16:00` }),
    ];
    const next = nextTasks(tasks, TODAY, 9);
    expect(next).toHaveLength(3);
    expect(next.map((t) => [t.id, t.time])).toEqual([
      ["a", "10:00"],
      ["b", "11:15"],
      ["d", "16:00"],
    ]);
    expect(nextTasks([task("c")], TODAY, 9)[0].time).toBeNull();
  });

  it("leaves out done, trashed and slot-less tasks", () => {
    const tasks = [
      task("done", { done: true }),
      task("trash", { trashedAt: "2026-10-20T10:00" }),
      task("noslot", { noSlot: true }),
      task("open"),
    ];
    expect(nextTasks(tasks, TODAY, 9).map((t) => t.id)).toEqual(["open"]);
  });

  it("clips a long title", () => {
    const [only] = nextTasks([task("x", { title: "w".repeat(200) })], TODAY, 9);
    expect(only.title.length).toBeLessThanOrEqual(48);
    expect(only.title.endsWith("…")).toBe(true);
  });
});

describe("focusLine", () => {
  const NOW = Date.parse("2026-10-21T10:00:00Z");
  const row = (o: Partial<FocusRow> = {}): FocusRow => ({
    id: "f1",
    taskId: null,
    intention: null,
    plannedMinutes: 25,
    startedAt: new Date(NOW - 5 * 60_000).toISOString(),
    pausedAt: null,
    pausedTotalSeconds: 0,
    phase: "FOCUS",
    ...o,
  });

  it("is null without a session", () => {
    expect(focusLine(null, NOW)).toBeNull();
    expect(focusLine(undefined, NOW)).toBeNull();
  });

  it("counts the minutes left in a planned session", () => {
    expect(focusLine(row(), NOW)).toBe("Focus 20 min left");
  });

  it("counts up when nothing was planned", () => {
    expect(focusLine(row({ plannedMinutes: null }), NOW)).toBe("Focus 5 min");
  });

  it("says so when paused, on a break, or out of time", () => {
    expect(focusLine(row({ pausedAt: new Date(NOW).toISOString() }), NOW)).toBe(
      "Focus paused"
    );
    expect(focusLine(row({ phase: "SHORT_BREAK" }), NOW)).toBe(
      "Break 20 min left"
    );
    expect(focusLine(row({ plannedMinutes: 5 }), NOW)).toBe("Focus time is up");
  });
});

describe("trayState", () => {
  it("is null until the tasks have loaded", () => {
    expect(
      trayState({ tasks: undefined, today: TODAY, nowHour: 9, focus: null })
    ).toBeNull();
  });

  it("carries the badge count, the next tasks and the focus line", () => {
    const state = trayState({
      tasks: [task("a"), task("b", { done: true }), task("c")],
      today: TODAY,
      nowHour: 9,
      focus: null,
    });
    expect(state).toEqual({
      open: 2,
      next: [
        { id: "a", title: "Task a", time: null },
        { id: "c", title: "Task c", time: null },
      ],
      focus: null,
    });
  });
});
