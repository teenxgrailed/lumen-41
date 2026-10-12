import type { V3Task } from "@/lib/needt3/map";

import { type TaskEntry, type TaskEvent, isTaskEvent, taskView } from "../view";

const base: V3Task = {
  id: "one",
  title: "Draft the launch brief",
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
};
const task = (patch: Partial<TaskEntry & V3Task> = {}) =>
  ({ ...base, ...patch }) as TaskEntry;
const projects = [
  { id: "ops", name: "Operations", color: "var(--hue-orange)", icon: "folder" },
];
const TODAY = "2026-09-01";

describe("v3 task labels", () => {
  it("draws a calendar event in grey with no project, parts or check", () => {
    const event: TaskEvent = {
      kind: "event",
      id: "ev",
      title: "Standup",
      startAt: "2026-09-01T09:00",
      endAt: "2026-09-01T09:15",
      calendarName: "Work",
    };
    expect(isTaskEvent(event)).toBe(true);
    expect(isTaskEvent(task())).toBe(false);
    expect(taskView(event, projects, TODAY)).toMatchObject({
      event: true,
      done: false,
      calendarName: "Work",
      projectName: null,
      hue: null,
      time: "09:00",
      minutes: 15,
      range: "09:00–09:15",
      parts: null,
      overdue: false,
    });
    expect(
      taskView({ ...event, isAllDay: true }, projects, TODAY)
    ).toMatchObject({ at: null, time: null, minutes: null, len: 30 });
  });

  it("keeps minute precision and carries the range through midnight", () => {
    const view = taskView(
      task({ scheduledStart: "2026-09-01T23:15", estimatedMinutes: 90 })
    );
    expect(view.time).toBe("23:15");
    expect(view.range).toBe("23:15–00:45");
    expect(view.dur).toBe("1 h 30");
    expect(view.durLong).toBe("1 h 30 min");
  });

  it("never assigns an unrelated project to an unassigned task", () => {
    expect(taskView(task({ projectId: null }), projects).projectName).toBe(
      null
    );
    expect(taskView(task({ projectId: "gone" }), projects).hue).toBeNull();
    expect(taskView(task({ projectId: "ops" }), projects)).toMatchObject({
      projectName: "Operations",
      hue: "var(--hue-orange)",
    });
  });

  it("draws no ring without parts and counts open and done parts", () => {
    expect(taskView(task()).parts).toBeNull();
    expect(taskView(task({ parts: [] })).parts).toBeNull();
    expect(
      taskView(
        task({
          parts: [
            { id: "p1", title: "Outline", done: true },
            { id: "p2", title: "Colour", done: false },
          ],
        })
      ).parts
    ).toEqual({ done: 1, total: 2, open: 1 });
  });

  it("derives overdue from the due day and the person's today", () => {
    const late = taskView(task({ dueDate: "2026-08-31" }), [], TODAY);
    expect(late.due).toBe("31 Aug");
    expect(late.overdue).toBe(true);
    expect(late.lateTitle).toBe("Overdue — was due 31 Aug");
    expect(taskView(task({ dueDate: TODAY }), [], TODAY).overdue).toBe(false);
    expect(
      taskView(task({ dueDate: "2026-08-31", done: true }), [], TODAY).overdue
    ).toBe(false);
    expect(taskView(task({ dueDate: "2026-08-31" })).overdue).toBe(false);
  });

  it("keeps money, first step and source without manufacturing absent fields", () => {
    const source = { kind: "mail" as const, id: "m1", quote: "Please review" };
    expect(
      taskView(task({ value: 240, entry: "Open the notes", source }))
    ).toMatchObject({ value: 240, entry: "Open the notes", source });
    expect(taskView(task())).toMatchObject({
      time: null,
      minutes: null,
      len: 30,
      dur: "",
      due: null,
      value: null,
      entry: null,
      source: null,
    });
  });

  it("keeps a long title whole for the layout to clip", () => {
    const title = "A".repeat(240);
    expect(taskView(task({ title })).title).toBe(title);
  });
});
