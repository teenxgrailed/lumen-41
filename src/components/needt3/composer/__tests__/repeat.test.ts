import { newDateFromYMD } from "@/lib/date-utils";

import { composerDraft, composerParse, repeatRule } from "../parse";

/** Tuesday, 1 September 2026 — the fixture's today. */
const NOW = newDateFromYMD(2026, 8, 1);

function taskOf(line: string) {
  const draft = composerDraft(composerParse(line, NOW), NOW, "task");
  if (draft.kind !== "task") throw new Error(`not a task: ${draft.kind}`);
  return draft.task;
}

describe("a repeat said in the line is written to the task", () => {
  it("maps each cadence to an RRULE", () => {
    expect(repeatRule({ cadence: "day", weekday: null })).toBe("FREQ=DAILY");
    expect(repeatRule({ cadence: "week", weekday: null })).toBe("FREQ=WEEKLY");
    expect(repeatRule({ cadence: "month", weekday: null })).toBe(
      "FREQ=MONTHLY"
    );
    expect(repeatRule({ cadence: "weekday", weekday: 5 })).toBe(
      "FREQ=WEEKLY;BYDAY=FR"
    );
  });

  it("files every day, every week and every month on the task", () => {
    expect(taskOf("water the plants every day").repeat).toBe("FREQ=DAILY");
    expect(taskOf("review the budget every month").repeat).toBe("FREQ=MONTHLY");
    expect(taskOf("clean the desk every week").repeat).toBe("FREQ=WEEKLY");
  });

  it("starts 'every friday' on the next Friday, and keeps a day that was said", () => {
    const t = taskOf("send the report every friday");
    expect(t.repeat).toBe("FREQ=WEEKLY;BYDAY=FR");
    expect(t.dueDate).toBe("2026-09-04");
  });

  it("a line with no repeat writes none", () => {
    expect(taskOf("call Anna tomorrow").repeat).toBeUndefined();
  });
});
