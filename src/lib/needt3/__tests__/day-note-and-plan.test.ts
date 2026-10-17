import { buildLabel, shortBuildSha } from "@/lib/build-info";

import { dailyNoteTitle, findDailyNote } from "../hooks/daily-note";
import { planDetail } from "../hooks/plan-day";

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

describe("planDetail", () => {
  const item = (n: number) => ({
    taskId: String(n),
    title: `Task ${n}`,
    day: "Today",
    time: `0${n}:00–0${n}:30`,
    moved: false,
  });
  it("lists the first placements and counts the rest", () => {
    expect(planDetail([item(1), item(2)])).toBe(
      "Today 01:00–01:30 Task 1 · Today 02:00–02:30 Task 2"
    );
    expect(planDetail([item(1), item(2), item(3), item(4), item(5)])).toBe(
      "Today 01:00–01:30 Task 1 · Today 02:00–02:30 Task 2 · Today 03:00–03:30 Task 3 · +2 more"
    );
    expect(planDetail([])).toBe("");
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
