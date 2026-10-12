import type { V3Task } from "@/lib/needt3/map";

import {
  chunkPatch,
  chunkPressed,
  datePatch,
  dateValue,
  duplicateDraft,
  foldChips,
  isSchedDefault,
  monthCells,
  moveItem,
  nextMonday,
  placementHint,
  schedSummary,
  tdAgo,
  tdDayName,
  tdDur,
  timePatch,
} from "../TaskDialogModel";

const base: V3Task = {
  id: "t",
  title: "Draft the launch brief",
  notes: null,
  done: false,
  status: "todo",
  projectId: null,
  dueDate: null,
  estimatedMinutes: 30,
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
const t = (patch: Partial<V3Task> = {}): V3Task => ({ ...base, ...patch });
const TODAY = "2026-09-01"; // a Tuesday

describe("labels", () => {
  it("formats durations", () => {
    expect(tdDur(null)).toBeNull();
    expect(tdDur(45)).toBe("45 min");
    expect(tdDur(90)).toBe("1 h 30");
    expect(tdDur(120)).toBe("2 h");
  });

  it("names days relative to today", () => {
    expect(tdDayName(TODAY, TODAY)).toBe("Today");
    expect(tdDayName("2026-09-02", TODAY)).toBe("Tomorrow");
    expect(tdDayName("2026-08-31", TODAY)).toBe("Yesterday");
    expect(tdDayName("2026-09-04", TODAY)).toBe("Fri 4 Sep");
    expect(tdDayName(null, TODAY)).toBeNull();
  });

  it("reads the date chip with its time", () => {
    expect(dateValue(t(), TODAY)).toBeNull();
    expect(dateValue(t({ dueDate: TODAY }), TODAY)).toBe("Today");
    expect(
      dateValue(
        t({ dueDate: "2026-09-02", scheduledStart: "2026-09-02T09:30" }),
        TODAY
      )
    ).toBe("Tomorrow · 09:30");
  });

  it("says how long ago, in the person's zone", () => {
    const now = Date.parse("2026-09-01T12:00:00.000Z");
    expect(tdAgo("2026-09-01T11:59:30.000Z", now, "UTC")).toBe("just now");
    expect(tdAgo("2026-09-01T11:48:00.000Z", now, "UTC")).toBe("12 min ago");
    expect(tdAgo("2026-09-01T08:05:00.000Z", now, "Europe/Zurich")).toBe(
      "at 10:05"
    );
    expect(tdAgo("2026-08-30T08:05:00.000Z", now, "UTC")).toBe("30 Aug");
    expect(tdAgo(null, now, "UTC")).toBeNull();
  });

  it("lays out a month Monday first", () => {
    const sep = monthCells(2026, 8); // 1 Sep 2026 is a Tuesday
    expect(sep.slice(0, 2)).toEqual([null, "2026-09-01"]);
    expect(sep.filter(Boolean)).toHaveLength(30);
    expect(monthCells(2026, 11).filter(Boolean).pop()).toBe("2026-12-31");
  });

  it("finds next Monday", () => {
    expect(nextMonday(TODAY)).toBe("2026-09-07");
    expect(nextMonday("2026-09-07")).toBe("2026-09-14");
  });
});

describe("date and time patches", () => {
  it("sets a day, keeping a placed task's hour", () => {
    expect(datePatch(t(), "2026-09-03", TODAY)).toEqual({
      dueDate: "2026-09-03",
    });
    expect(
      datePatch(
        t({ dueDate: TODAY, scheduledStart: `${TODAY}T09:00` }),
        "2026-09-03",
        TODAY
      )
    ).toEqual({
      dueDate: "2026-09-03",
      scheduledStart: "2026-09-03T09:00",
      scheduledEnd: "2026-09-03T09:30",
    });
  });

  it("clears the day and the placement together", () => {
    expect(datePatch(t({ dueDate: TODAY }), null, TODAY)).toEqual({
      dueDate: null,
      scheduledStart: null,
      scheduledEnd: null,
      isFixed: false,
    });
  });

  it("places at a time (fixed) and takes the time off", () => {
    expect(timePatch(t({ dueDate: "2026-09-02" }), "14:15", TODAY)).toEqual({
      dueDate: "2026-09-02",
      scheduledStart: "2026-09-02T14:15",
      scheduledEnd: "2026-09-02T14:45",
      isFixed: true,
      auto: false,
    });
    expect(timePatch(t(), "x", TODAY)).toBeNull();
    expect(timePatch(t(), null, TODAY)).toEqual({
      scheduledStart: null,
      scheduledEnd: null,
      isFixed: false,
    });
  });
});

describe("scheduling", () => {
  it("maps the min-block pills onto chunk and splitAllowed", () => {
    expect(chunkPatch(t(), null)).toEqual({ chunk: null, splitAllowed: false });
    expect(chunkPatch(t(), 25)).toEqual({ chunk: 25, splitAllowed: true });
    expect(chunkPatch(t({ chunk: 25 }), 25)).toEqual({
      chunk: null,
      splitAllowed: true,
    });
    expect(chunkPatch(t({ splitAllowed: false }), null)).toEqual({
      chunk: null,
      splitAllowed: true,
    });
    expect(chunkPressed(t({ splitAllowed: false, chunk: 25 }), 25)).toBe(false);
  });

  it("summarises what is not the default", () => {
    expect(isSchedDefault(t())).toBe(true);
    const s = t({
      isFixed: true,
      scheduledStart: `${TODAY}T09:30`,
      chunk: 25,
      deadline: "2026-09-04",
      hardDeadline: true,
      scheduleId: "w2",
    });
    expect(isSchedDefault(s)).toBe(false);
    expect(schedSummary(s, "Personal")).toBe(
      "Fixed 09:30 · min block 25 min · hard deadline 4 Sep · personal"
    );
    expect(schedSummary(t({ splitAllowed: false }))).toBe("Auto · don’t split");
  });

  it("explains placement", () => {
    expect(placementHint(t())).toBe("Needt finds the slot");
    expect(placementHint(t({ isFixed: true }))).toBe("Stays where you put it");
    expect(placementHint(t({ scheduledStart: `${TODAY}T09:00` }))).toBe(
      "Planned 09:00 — Needt may move it"
    );
  });
});

describe("chip row", () => {
  const items = [
    { k: "date", filled: true, w: 100 },
    { k: "duration", filled: true, w: 60 },
    { k: "project", filled: false, w: 70 },
    { k: "priority", filled: true, w: 70 },
  ];
  it("folds nothing when the row fits", () => {
    expect(foldChips(items, 400, 4, 40)).toEqual([]);
  });
  it("folds empty chips first, then filled ones from the end", () => {
    expect(foldChips(items, 290, 4, 40)).toEqual(["project"]);
    expect(foldChips(items, 220, 4, 40)).toEqual(["project", "priority"]);
  });
  it("always keeps one chip", () => {
    expect(foldChips(items, 10, 4, 40)).toEqual([
      "project",
      "priority",
      "duration",
    ]);
  });
});

describe("helpers", () => {
  it("duplicates the editable fields with a (copy) title", () => {
    const d = duplicateDraft(t({ projectId: "ops", chunk: 30 }));
    expect(d.title).toBe("Draft the launch brief (copy)");
    expect(d.projectId).toBe("ops");
    expect(d.chunk).toBe(30);
    expect(d.done).toBe(false);
  });
  it("moves list items", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });
});
