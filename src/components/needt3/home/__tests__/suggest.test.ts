import { highlightCandidates, suggestHighlight, suggestMeta } from "../suggest";
import { TODAY, task } from "./fixtures";

describe("highlightCandidates", () => {
  it("takes open tasks due today only", () => {
    const a = task();
    const list = highlightCandidates(
      [
        a,
        task({ done: true }),
        task({ dueDate: "2026-08-30" }),
        task({ dueDate: "2026-09-02" }),
        task({ dueDate: null }),
        task({ trashedAt: "2026-09-01T10:00:00Z" }),
        task({ noSlot: true }),
      ],
      TODAY
    );
    expect(list.map((t) => t.id)).toEqual([a.id]);
  });

  it("orders by priority, then the earlier hour, then the longer job", () => {
    const low = task({ priority: "low" });
    const urgent = task({ priority: "urgent" });
    const highLate = task({
      priority: "high",
      scheduledStart: `${TODAY}T15:00`,
    });
    const highEarly = task({
      priority: "high",
      scheduledStart: `${TODAY}T09:00`,
    });
    const medShort = task({ estimatedMinutes: 15 });
    const medLong = task({ estimatedMinutes: 90 });
    const ids = highlightCandidates(
      [low, medShort, highLate, medLong, urgent, highEarly],
      TODAY
    ).map((t) => t.id);
    expect(ids).toEqual([
      urgent.id,
      highEarly.id,
      highLate.id,
      medLong.id,
      medShort.id,
      low.id,
    ]);
  });
});

describe("suggestHighlight", () => {
  it("offers the best first, and Another wraps round", () => {
    const a = task({ priority: "high" });
    const b = task({ priority: "low" });
    expect(suggestHighlight([b, a], TODAY, 0)?.task.id).toBe(a.id);
    expect(suggestHighlight([b, a], TODAY, 1)?.task.id).toBe(b.id);
    expect(suggestHighlight([b, a], TODAY, 2)?.task.id).toBe(a.id);
    expect(suggestHighlight([b, a], TODAY, 0)?.of).toBe(2);
  });
  it("is null when nothing is due today", () => {
    expect(suggestHighlight([task({ dueDate: null })], TODAY, 0)).toBeNull();
  });
});

describe("suggestMeta", () => {
  it("names a high priority and the length", () => {
    expect(suggestMeta(task({ priority: "high", estimatedMinutes: 45 }))).toBe(
      "High priority · 45 min"
    );
    expect(
      suggestMeta(task({ priority: "medium", estimatedMinutes: null }))
    ).toBe("");
  });
});
