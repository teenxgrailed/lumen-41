import { buildLabel, shortBuildSha } from "@/lib/build-info";

import { dailyNoteTitle, findDailyNote } from "../hooks/daily-note";
import { planMessage, planOutcome } from "../hooks/plan-day";

describe("dailyNoteTitle", () => {
  it("names the day in words", () => {
    expect(dailyNoteTitle("2026-10-14")).toBe("Daily note · 14 October 2026");
    expect(dailyNoteTitle("2027-01-03")).toBe("Daily note · 3 January 2027");
  });
});

describe("findDailyNote", () => {
  const pages = [
    { id: "a", title: "Daily note · 13 October 2026" },
    { id: "b", title: "Daily note · 14 October 2026", trashedAt: "2026-10-14" },
    { id: "c", title: "Daily note · 14 October 2026" },
  ];
  it("finds the day's own note by its title", () => {
    expect(findDailyNote(pages, "2026-10-14")).toBe("c");
    expect(findDailyNote(pages, "2026-10-13")).toBe("a");
  });
  it("never opens one from the Trash, and says none when there is none", () => {
    expect(findDailyNote([pages[1]], "2026-10-14")).toBeNull();
    expect(findDailyNote(pages, "2026-10-15")).toBeNull();
  });
});

describe("planOutcome", () => {
  it("counts the tasks that got a time and the ones that did not fit", () => {
    const o = planOutcome([
      { taskId: "1", toStart: "2026-10-14T09:00:00.000Z" },
      { taskId: "2", toStart: "2026-10-14T10:00:00.000Z" },
      { taskId: "3", toStart: null },
    ]);
    expect(o).toEqual({ placed: 2, unplaced: 1 });
    expect(planMessage(o)).toBe("Placed 2 tasks in your day");
    expect(planMessage({ placed: 1, unplaced: 0 })).toBe(
      "Placed 1 task in your day"
    );
  });
});

describe("build label", () => {
  const sha = "1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b";
  it("shows the short SHA of a release build", () => {
    expect(shortBuildSha(sha)).toBe("1a2b3c4");
    expect(buildLabel(sha)).toBe("Build 1a2b3c4");
  });
  it("calls anything else a development build", () => {
    expect(buildLabel("local")).toBe("Development build");
    expect(buildLabel(undefined)).toBe("Development build");
    expect(buildLabel("")).toBe("Development build");
  });
});
