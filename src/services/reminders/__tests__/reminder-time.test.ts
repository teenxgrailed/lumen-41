import { TaskReminderKind } from "@prisma/client";

import {
  atTimeKey,
  plannedFireTime,
  reminderFireTime,
  reminderLabel,
} from "../reminder-time";

const start = new Date("2026-10-28T13:00:00.000Z");
const task = { scheduledStart: start, deadline: null, dueDate: null };

describe("reminderFireTime", () => {
  it("counts back from the task's start", () => {
    expect(
      reminderFireTime({
        kind: TaskReminderKind.BEFORE_START,
        offsetMinutes: 10,
        task,
      })?.toISOString()
    ).toBe("2026-10-28T12:50:00.000Z");
  });

  it("follows the task when it moves: nothing is stored as a time", () => {
    const r = { kind: TaskReminderKind.BEFORE_START, offsetMinutes: 0, task };
    expect(reminderFireTime(r)?.toISOString()).toBe(start.toISOString());
    const moved = {
      ...r,
      task: { ...task, scheduledStart: new Date("2026-10-29T08:00:00.000Z") },
    };
    expect(reminderFireTime(moved)?.toISOString()).toBe(
      "2026-10-29T08:00:00.000Z"
    );
  });

  it("uses the deadline, then the due date, for BEFORE_DEADLINE", () => {
    const due = new Date("2026-10-30T17:00:00.000Z");
    expect(
      reminderFireTime({
        kind: TaskReminderKind.BEFORE_DEADLINE,
        offsetMinutes: 60,
        task: { scheduledStart: start, deadline: null, dueDate: due },
      })?.toISOString()
    ).toBe("2026-10-30T16:00:00.000Z");
  });

  it("anchors an event reminder on the event's start", () => {
    expect(
      reminderFireTime({
        kind: TaskReminderKind.BEFORE_START,
        offsetMinutes: 15,
        event: { start },
      })?.toISOString()
    ).toBe("2026-10-28T12:45:00.000Z");
  });

  it('fires "1 day before, 09:00" at nine on the day before, in the zone', () => {
    const fires = plannedFireTime(
      {
        kind: TaskReminderKind.BEFORE_START,
        offsetMinutes: 1_440,
        atTime: "09:00",
        task,
      },
      "Europe/Berlin"
    );
    // 27 Oct 2026 is after the clock change: Berlin is UTC+1.
    expect(fires?.toISOString()).toBe("2026-10-27T08:00:00.000Z");
  });

  it("has no time when the task has nothing to anchor it", () => {
    expect(
      reminderFireTime({
        kind: TaskReminderKind.BEFORE_START,
        offsetMinutes: 10,
        task: { scheduledStart: null, deadline: null, dueDate: null },
      })
    ).toBeNull();
  });

  it("fires an absolute reminder at its time, and a snooze wins", () => {
    const fireAt = new Date("2026-11-02T10:00:00.000Z");
    const snoozedUntil = new Date("2026-11-03T08:00:00.000Z");
    const r = { kind: TaskReminderKind.AT_TIME, offsetMinutes: 0, fireAt };
    expect(reminderFireTime(r)?.toISOString()).toBe(fireAt.toISOString());
    expect(reminderFireTime({ ...r, snoozedUntil })?.toISOString()).toBe(
      snoozedUntil.toISOString()
    );
  });
});

describe("reminderLabel", () => {
  const base = { fireAt: null, atTime: null };
  it("names what the picker offers", () => {
    expect(
      reminderLabel({ ...base, kind: "BEFORE_START", offsetMinutes: 0 })
    ).toBe("At start");
    expect(
      reminderLabel({ ...base, kind: "BEFORE_START", offsetMinutes: 10 })
    ).toBe("10 min before");
    expect(
      reminderLabel({ ...base, kind: "BEFORE_START", offsetMinutes: 60 })
    ).toBe("1 hour before");
    expect(
      reminderLabel({
        kind: "BEFORE_START",
        offsetMinutes: 1_440,
        atTime: "09:00",
        fireAt: null,
      })
    ).toBe("1 day before, 09:00");
    expect(
      reminderLabel({ ...base, kind: "BEFORE_DEADLINE", offsetMinutes: 60 })
    ).toBe("1 hour before the deadline");
    expect(
      reminderLabel(
        {
          kind: "AT_TIME",
          offsetMinutes: 0,
          atTime: null,
          fireAt: new Date("2026-10-28T13:00:00.000Z"),
        },
        "Europe/Berlin"
      )
    ).toBe("Wed 28 Oct, 14:00");
  });
});

describe("atTimeKey", () => {
  it("is negative, so it never meets a relative offset", () => {
    expect(atTimeKey(start)).toBeLessThan(0);
    expect(atTimeKey(new Date(start.getTime() + 30_000))).toBe(
      atTimeKey(start)
    );
  });
});
