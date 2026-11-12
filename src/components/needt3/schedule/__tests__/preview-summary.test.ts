import { previewSummary } from "../SchedulePreviewSheet";

const base = { previewToken: "t", unscheduled: [], changes: [] };

describe("previewSummary", () => {
  it("says nothing moves when the plan is current", () => {
    expect(previewSummary(base)).toMatchObject({
      title: "The plan is current",
      slips: 0,
    });
  });

  it("counts moves and slips and keeps only days whose load changes", () => {
    const words = previewSummary({
      ...base,
      changes: [
        {
          taskId: "a",
          title: "A",
          fromStart: null,
          toStart: "2026-07-06T09:00:00.000Z",
          fromEnd: null,
          toEnd: "2026-07-06T10:00:00.000Z",
        },
      ],
      unscheduled: [{ taskId: "b", title: "B", reason: "NO_WORKING_TIME" }],
      atRisk: [{ taskId: "c", title: "C", deadline: "2026-07-07T00:00:00Z" }],
      load: [
        { date: "2026-07-06", beforeMinutes: 0, afterMinutes: 60 },
        { date: "2026-07-07", beforeMinutes: 30, afterMinutes: 30 },
      ],
    });
    expect(words.title).toBe("Apply the new plan?");
    expect(words.sub).toContain("1 task moves, 2 would slip");
    expect(words.sub).toContain("Undo");
    expect(words.load.map((d) => d.date)).toEqual(["2026-07-06"]);
  });
});
