import { readFileSync } from "node:fs";

import type { V3Task } from "@/lib/needt3/map";

import {
  duplicateDraft,
  isSchedDefault,
  schedSummary,
  tdCreated,
  tdProvider,
} from "../TaskDialogModel";

describe("the dialog's Created line and provider names", () => {
  it("names the day the task was made in the person's zone", () => {
    expect(tdCreated("2026-09-04T08:00:00.000Z", "Europe/Kyiv")).toBe("4 Sep");
    // Late evening UTC is already the next day in Kyiv.
    expect(tdCreated("2026-09-04T22:30:00.000Z", "Europe/Kyiv")).toBe("5 Sep");
    expect(tdCreated(null, "Europe/Kyiv")).toBeNull();
    expect(tdCreated("not a date", "Europe/Kyiv")).toBeNull();
  });

  it("says where a synced task came from", () => {
    expect(tdProvider("outlook")).toBe("Outlook");
    expect(tdProvider("google")).toBe("Google Tasks");
    expect(tdProvider("caldav")).toBe("CalDAV");
    expect(tdProvider(null)).toBeNull();
  });
});

describe("hours and duplicates", () => {
  const base = {
    isFixed: false,
    chunk: null,
    splitAllowed: true,
    deadline: null,
    hardDeadline: false,
    scheduledStart: null,
    scheduleId: null,
  };

  it("a task on another schedule is not scheduling-default, and the summary names it", () => {
    expect(isSchedDefault(base)).toBe(true);
    expect(isSchedDefault({ ...base, scheduleId: "s2" })).toBe(false);
    expect(schedSummary({ ...base, scheduleId: "s2" }, "Personal")).toContain(
      "personal"
    );
  });

  it("a duplicate keeps the labels and the repeat", () => {
    const draft = duplicateDraft({
      id: "t",
      title: "Water plants",
      labels: [{ id: "l1", name: "Errand", color: null }],
      repeat: "FREQ=WEEKLY",
      priority: "none",
    } as unknown as V3Task);
    expect(draft).toMatchObject({
      title: "Water plants (copy)",
      labels: [{ id: "l1", name: "Errand", color: null }],
      repeat: "FREQ=WEEKLY",
      priority: "none",
    });
  });
});

describe("TaskDialog wiring", () => {
  const src = readFileSync(
    "src/components/needt3/dialogs/TaskDialog.tsx",
    "utf8"
  );

  it("has no deferred todo left for the fields this dialog now owns", () => {
    for (const word of [
      "Labels (Task.tags",
      '"No priority": priorityLevel',
      "Hours (work / personal / any",
      '"Start focus" on the first step',
      "Attachments: TaskAttachment exists",
      '"Created 4 Sep"',
    ])
      expect(src).not.toContain(word);
  });

  it("starts focus through the shared Focus start, not its own call", () => {
    expect(src).toContain("useStartFocus");
    expect(src).not.toContain("/api/focus");
  });

  it("has the 'Do for the full time' toggle, written through the shared patch", () => {
    expect(src).toContain("data-tdc-full-time");
    expect(src).toContain("{FULL_TIME_LABEL}");
    expect(src).toContain("emit(fullTimePatch(t))");
    expect(src).toContain('role="switch"');
    expect(src).toContain("aria-checked={!!t.fullTimeOn}");
  });

  it("locks the switch on habits and repeating tasks and tags it Auto", () => {
    expect(src).toContain("disabled={!!t.fullTimeAuto}");
    expect(src).toContain("{FULL_TIME_AUTO_TAG}");
  });

  it("keeps the title and the repeat read-only for a synced task", () => {
    expect(src).toContain("readOnly={!!provider}");
    expect(src).toMatch(/if \(provider\) return;/);
    expect(src).toContain("set in {provider}");
  });
});
