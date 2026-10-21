import { readFileSync } from "node:fs";

import type { V3Task } from "@/lib/needt3/map";

import { scheduleSummary, sizeWords } from "../taskModel";

describe("file sizes on the phone sheet", () => {
  it("reads bytes the way a person would", () => {
    expect(sizeWords(null)).toBe("");
    expect(sizeWords(0)).toBe("0 B");
    expect(sizeWords(900)).toBe("900 B");
    expect(sizeWords(3_400)).toBe("3 KB");
    expect(sizeWords(2_500_000)).toBe("2.4 MB");
  });
});

describe("the folded Scheduling line names the hours", () => {
  const t = {
    isFixed: false,
    scheduledStart: null,
    splitAllowed: true,
    chunk: null,
    deadline: null,
    hardDeadline: false,
  } as unknown as V3Task;

  it("adds the schedule's name only when the task is not on the default", () => {
    expect(scheduleSummary(t, "2026-10-16")).toBe("Auto");
    expect(scheduleSummary(t, "2026-10-16", null)).toBe("Auto");
    expect(scheduleSummary(t, "2026-10-16", "Personal")).toBe(
      "Auto · personal"
    );
  });
});

describe("the phone sheet's 'Do for the full time' choice", () => {
  const src = readFileSync(
    "src/components/needt3/phone/overlays/TaskSheet.tsx",
    "utf8"
  );

  it("is a Scheduling row with an off and an on choice, written as fullTime", () => {
    expect(src).toContain('"fullTime"');
    expect(src).toContain("choose({ fullTime: false })");
    expect(src).toContain("choose({ fullTime: true })");
    expect(src).toContain("title: FULL_TIME_LABEL");
  });
});
