import { planRecurringCompletion } from "../recurring-completion";

const at = (iso: string) => new Date(iso);

function next(
  rule: string,
  due: string,
  completedAt = due,
  extra: Record<string, Date | null> = {}
) {
  const plan = planRecurringCompletion(
    {
      recurrenceRule: rule,
      dueDate: at(`${due}T00:00:00.000Z`),
      startDate: null,
      scheduledStart: null,
      scheduledEnd: null,
      ...extra,
    },
    at(`${completedAt}T12:00:00.000Z`)
  );
  return plan.advance?.dueDate.toISOString().slice(0, 10) ?? null;
}

describe("planRecurringCompletion: the same task jumps to its next date", () => {
  it("every day is the next day, not the one after", () => {
    expect(next("FREQ=DAILY", "2026-10-12")).toBe("2026-10-13");
  });

  it("every weekday skips the weekend", () => {
    const rule = "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
    expect(next(rule, "2026-10-15")).toBe("2026-10-16");
    expect(next(rule, "2026-10-16")).toBe("2026-10-19");
  });

  it("every week keeps the task's own weekday, whatever day it is ticked", () => {
    // Due Monday, ticked on a Thursday: next Monday, not next Thursday.
    expect(next("FREQ=WEEKLY", "2026-10-12", "2026-10-15")).toBe("2026-10-19");
  });

  it("chosen days of the week", () => {
    const rule = "FREQ=WEEKLY;BYDAY=MO,WE";
    expect(next(rule, "2026-10-12")).toBe("2026-10-14");
    expect(next(rule, "2026-10-14")).toBe("2026-10-19");
  });

  it("every month keeps the day of the month", () => {
    expect(next("FREQ=MONTHLY", "2026-10-12", "2026-10-20")).toBe("2026-11-12");
    expect(next("FREQ=MONTHLY", "2026-01-31")).toBe("2026-03-31");
  });

  it("custom: every 2 weeks, and a rule that carries its prefix", () => {
    expect(next("RRULE:FREQ=WEEKLY;INTERVAL=2", "2026-10-12")).toBe(
      "2026-10-26"
    );
  });

  it("an overdue task lands on a coming date, not another past one", () => {
    expect(next("FREQ=DAILY", "2026-10-01", "2026-10-12")).toBe("2026-10-13");
  });

  it("a finished series has no next date; the occurrence is still recorded", () => {
    const plan = planRecurringCompletion(
      {
        recurrenceRule: "FREQ=DAILY;COUNT=1",
        dueDate: at("2026-10-12T00:00:00.000Z"),
        startDate: null,
        scheduledStart: null,
        scheduledEnd: null,
      },
      at("2026-10-12T12:00:00.000Z")
    );
    expect(plan.advance).toBeNull();
    expect(plan.completion.occurrenceAt.toISOString()).toBe(
      "2026-10-12T00:00:00.000Z"
    );
  });

  it("a placed task moves with its date, at the same time of day", () => {
    const plan = planRecurringCompletion(
      {
        recurrenceRule: "FREQ=WEEKLY",
        dueDate: at("2026-10-12T00:00:00.000Z"),
        startDate: null,
        scheduledStart: at("2026-10-12T09:30:00.000Z"),
        scheduledEnd: at("2026-10-12T10:30:00.000Z"),
      },
      at("2026-10-12T12:00:00.000Z")
    );
    expect(plan.advance?.scheduledStart?.toISOString()).toBe(
      "2026-10-19T09:30:00.000Z"
    );
    expect(plan.advance?.scheduledEnd?.toISOString()).toBe(
      "2026-10-19T10:30:00.000Z"
    );
    expect(plan.advance?.status).toBe("todo");
  });
});

describe("planRecurringCompletion: a second tick the same day", () => {
  const base = {
    recurrenceRule: "FREQ=WEEKLY;BYDAY=SU",
    startDate: null,
    scheduledStart: null,
    scheduledEnd: null,
  };

  it("is a duplicate when the series was just completed and its next date is ahead", () => {
    // Completed Thursday 29 Oct; the master now sits on Sunday 8 Nov.
    const plan = planRecurringCompletion(
      {
        ...base,
        dueDate: at("2026-11-08T00:00:00.000Z"),
        lastCompletedDate: at("2026-10-29T09:00:00.000Z"),
      },
      at("2026-10-29T14:00:00.000Z")
    );
    expect(plan.duplicate).toBe(true);
  });

  it("is not a duplicate the next day, nor for an occurrence that is due", () => {
    const early = planRecurringCompletion(
      {
        ...base,
        dueDate: at("2026-11-08T00:00:00.000Z"),
        lastCompletedDate: at("2026-10-29T09:00:00.000Z"),
      },
      at("2026-10-30T14:00:00.000Z")
    );
    expect(early.duplicate).toBe(false);
    const due = planRecurringCompletion(
      {
        ...base,
        dueDate: at("2026-11-01T00:00:00.000Z"),
        lastCompletedDate: at("2026-11-01T08:00:00.000Z"),
      },
      at("2026-11-01T14:00:00.000Z")
    );
    expect(due.duplicate).toBe(false);
  });
});
