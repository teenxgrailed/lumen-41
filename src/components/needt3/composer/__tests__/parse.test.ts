import { newDateFromYMD } from "@/lib/date-utils";
import type { V3Project } from "@/lib/needt3/map";

import {
  composerDraft,
  composerParse,
  pickFacet,
  projectForSigil,
  stripFacet,
  unclaimed,
} from "../parse";

/** Tuesday, 1 September 2026 — the fixture's today. */
const NOW = newDateFromYMD(2026, 8, 1);

const proj = (id: string, name: string, color: string | null = null) =>
  ({
    id,
    name,
    color,
    icon: null,
    ground: null,
    position: 0,
    archived: false,
  }) satisfies V3Project;

const PROJECTS = [
  proj("p-ops", "Operations", "#ff9500"),
  proj("p-ds", "Design system"),
  proj("p-de", "German"),
];

describe("composerParse — the card's sentence", () => {
  const p = composerParse(
    "call Anna tomorrow 3pm 30m #ops !high",
    NOW,
    PROJECTS
  );

  it("reads every facet", () => {
    expect(p.date).toMatchObject({ label: "Tomorrow", day: "2026-09-02" });
    expect(p.time).toMatchObject({ label: "3pm", minutes: 15 * 60 });
    expect(p.duration).toMatchObject({ label: "30 min", minutes: 30 });
    expect(p.project).toMatchObject({
      id: "p-ops",
      label: "Operations",
      color: "#ff9500",
    });
    expect(p.priority).toMatchObject({ level: "high", label: "High" });
  });

  it("names the thing with the words nothing claimed", () => {
    expect(p.title).toBe("call Anna");
    expect(p.sentence).toBe("call Anna tomorrow 3pm 30m #ops !high");
  });

  it("marks each claimed run once, in line order", () => {
    const text = p.text;
    expect(p.marks.map((m) => [m.kind, text.slice(m.from, m.to)])).toEqual([
      ["date", "tomorrow"],
      ["time", "3pm"],
      ["duration", "30m"],
      ["project", "#ops"],
      ["priority", "!high"],
    ]);
  });

  it("is an event because it has a clock", () => {
    expect(p.kind).toBe("event");
  });

  it("drafts a task pinned to its time", () => {
    const d = composerDraft(p, NOW, "task");
    expect(d).toEqual({
      kind: "task",
      parts: [],
      task: {
        title: "call Anna",
        projectId: "p-ops",
        estimatedMinutes: 30,
        dueDate: "2026-09-02",
        scheduledStart: "2026-09-02T15:00",
        scheduledEnd: "2026-09-02T15:30",
        isFixed: true,
        auto: false,
        priority: "high",
      },
    });
  });
});

describe("composerParse — shorthands", () => {
  it("keeps the base parser's words", () => {
    const p = composerParse(
      "Finish the budget by friday urgent Operations for 2h",
      NOW,
      PROJECTS
    );
    expect(p.deadline).toMatchObject({ label: "by friday", day: "2026-09-04" });
    expect(p.priority?.level).toBe("urgent");
    expect(p.project?.id).toBe("p-ops");
    expect(p.duration?.minutes).toBe(120);
    expect(p.title).toBe("Finish the budget");
  });

  it("maps the priority words onto the v3 levels", () => {
    expect(composerParse("a important", NOW).priority?.level).toBe("high");
    expect(composerParse("a whenever", NOW).priority?.level).toBe("low");
    expect(composerParse("a !1", NOW).priority?.level).toBe("urgent");
    expect(composerParse("a !low", NOW).priority?.level).toBe("low");
    expect(composerParse("a!high", NOW).priority).toBeNull();
  });

  it("leaves an unknown #word in the title", () => {
    const p = composerParse("ship #nowhere", NOW, PROJECTS);
    expect(p.project).toBeNull();
    expect(p.title).toBe("ship #nowhere");
  });

  it("reads parts after the slash", () => {
    const p = composerParse("Pack / passport / charger", NOW);
    expect(p.parts).toEqual(["passport", "charger"]);
    expect(composerDraft(p, NOW).kind).toBe("task");
    expect((composerDraft(p, NOW) as { parts: string[] }).parts).toEqual([
      "passport",
      "charger",
    ]);
  });

  it("does not read a clock as a length", () => {
    const p = composerParse("gym 7am", NOW);
    expect(p.duration).toBeNull();
    expect(p.time?.minutes).toBe(7 * 60);
  });
});

describe("projectForSigil", () => {
  it("matches exact, prefix, word prefix, then initials", () => {
    expect(projectForSigil("operations", PROJECTS)?.id).toBe("p-ops");
    expect(projectForSigil("ops", PROJECTS)?.id).toBe("p-ops");
    expect(projectForSigil("system", PROJECTS)?.id).toBe("p-ds");
    expect(projectForSigil("ds", PROJECTS)?.id).toBe("p-ds");
    expect(projectForSigil("design-system", PROJECTS)?.id).toBe("p-ds");
  });

  it("refuses an ambiguous prefix", () => {
    const two = [proj("a", "Garden"), proj("b", "German")];
    expect(projectForSigil("g", two)).toBeNull();
    expect(projectForSigil("ger", two)?.id).toBe("b");
  });
});

describe("composerDraft", () => {
  it("assumes today and 30 minutes when the line says neither", () => {
    const d = composerDraft(composerParse("Buy milk", NOW), NOW);
    expect(d).toEqual({
      kind: "task",
      parts: [],
      task: {
        title: "Buy milk",
        projectId: null,
        estimatedMinutes: 30,
        dueDate: "2026-09-01",
      },
    });
  });

  it("files a deadline as the due day and the deadline", () => {
    const d = composerDraft(composerParse("Report by friday", NOW), NOW);
    expect(d.kind === "task" && d.task).toMatchObject({
      dueDate: "2026-09-04",
      deadline: "2026-09-04",
    });
  });

  it("carries the description as notes", () => {
    const d = composerDraft(composerParse("x", NOW), NOW, "task", "  hi  ");
    expect(d.kind === "task" && d.task.notes).toBe("hi");
  });

  it("drafts a habit from a cadence", () => {
    const p = composerParse("Stretch every day 7am", NOW);
    expect(p.kind).toBe("habit");
    expect(composerDraft(p, NOW)).toEqual({
      kind: "habit",
      habit: {
        title: "Stretch",
        projectId: null,
        schedule: { time: "07:00", perWeek: null },
      },
    });
    const weekly = composerDraft(composerParse("Review weekly", NOW), NOW);
    expect(weekly.kind === "habit" && weekly.habit.schedule.perWeek).toBe(1);
  });

  it("drafts an event with no clock at 09:00 for an hour", () => {
    const d = composerDraft(composerParse("Dentist friday", NOW), NOW, "event");
    expect(d).toEqual({
      kind: "event",
      event: {
        title: "Dentist",
        startAt: "2026-09-04T09:00",
        endAt: "2026-09-04T10:00",
        isAllDay: false,
      },
    });
  });

  it("drafts a timed event as an event, never a task, and drops parts", () => {
    const d = composerDraft(
      composerParse("Call Anna tomorrow 3pm for 45 min / agenda", NOW),
      NOW,
      "event"
    );
    expect(d).toEqual({
      kind: "event",
      event: {
        title: "Call Anna",
        startAt: "2026-09-02T15:00",
        endAt: "2026-09-02T15:45",
        isAllDay: false,
      },
    });
  });

  it("drafts a monthly cadence as a task, not a daily habit", () => {
    const p = composerParse("Pay rent every month", NOW);
    expect(p.repeat?.cadence).toBe("month");
    expect(p.kind).toBe("task");
    expect(composerDraft(p, NOW).kind).toBe("task");
    expect(composerDraft(p, NOW, "habit").kind).toBe("task");
  });

  it("drafts a doc", () => {
    const p = composerParse("notes on the factory German", NOW, PROJECTS);
    expect(p.kind).toBe("doc");
    expect(composerDraft(p, NOW)).toEqual({
      kind: "doc",
      doc: { title: "notes on the factory", projectId: "p-de" },
    });
  });
});

describe("line edits", () => {
  it("strips and replaces one facet", () => {
    const text = "call Anna tomorrow 3pm";
    const p = composerParse(text, NOW);
    expect(stripFacet(text, p.date)).toBe("call Anna 3pm");
    expect(pickFacet(text, p.date, "friday")).toBe("call Anna 3pm friday");
    expect(pickFacet("", null, "today")).toBe("today");
  });

  it("unclaimed tidies spaces and punctuation", () => {
    expect(unclaimed("a b, c", [{ from: 2, to: 3 }])).toBe("a, c");
  });
});
