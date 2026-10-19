import {
  agentSuggestions,
  aiCandidates,
  highlightCandidates,
  reasonFor,
  ruleSuggestions,
  suggestHighlight,
  suggestMeta,
  suggestionPool,
} from "../suggest";
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

describe("suggestionPool", () => {
  it("puts the week's focuses first, then what is due today, each task once", () => {
    const focus = task({ dueDate: null, title: "Landing" });
    const a = task({ priority: "high" });
    const b = task({ priority: "low" });
    const pool = suggestionPool([b, a, focus], TODAY, [focus, a]);
    expect(pool.map((e) => [e.task.id, e.focus])).toEqual([
      [focus.id, true],
      [a.id, true],
      [b.id, false],
    ]);
  });
  it("reads at most twelve tasks", () => {
    const many = Array.from({ length: 20 }, () => task());
    expect(suggestionPool(many, TODAY)).toHaveLength(12);
    expect(aiCandidates(suggestionPool(many, TODAY))).toHaveLength(12);
  });
});

describe("reasonFor", () => {
  const e = (over = {}, focus = false) => ({ task: task(over), focus });
  it("says why in one line, without the agent", () => {
    expect(reasonFor(e({}, true), TODAY)).toBe(
      "One of your focuses for this week."
    );
    expect(reasonFor(e({ priority: "urgent" }), TODAY)).toBe(
      "Marked urgent, due today."
    );
    expect(reasonFor(e({ priority: "high" }), TODAY)).toBe(
      "High priority, due today."
    );
    expect(reasonFor(e({ scheduledStart: `${TODAY}T11:00` }), TODAY)).toBe(
      "Planned for 11:00 today."
    );
    expect(reasonFor(e({ estimatedMinutes: 45 }), TODAY)).toBe(
      "Due today, and it needs 45 min."
    );
    expect(reasonFor(e({ estimatedMinutes: null }), TODAY)).toBe("Due today.");
  });
});

describe("ruleSuggestions and agentSuggestions", () => {
  const a = task({ priority: "high" });
  const b = task({ priority: "medium" });
  const c = task({ priority: "low" });
  const d = task({ priority: "none" });
  const pool = suggestionPool([a, b, c, d], TODAY);

  it("gives the first three, each with a reason", () => {
    const list = ruleSuggestions(pool, TODAY);
    expect(list.map((s) => s.task.id)).toEqual([a.id, b.id, c.id]);
    expect(list.every((s) => s.reason)).toBe(true);
  });
  it("takes the agent's order and words, and drops what left the pool", () => {
    const list = agentSuggestions(
      pool,
      [
        { taskId: c.id, reason: "Quick win." },
        { taskId: "gone", reason: "Not here any more." },
        { taskId: a.id, reason: "The drop is Friday." },
        { taskId: c.id, reason: "again" },
      ],
      TODAY
    );
    expect(list.map((s) => [s.task.id, s.reason])).toEqual([
      [c.id, "Quick win."],
      [a.id, "The drop is Friday."],
    ]);
  });
  it("falls back to the rules when the agent has nothing usable", () => {
    expect(agentSuggestions(pool, null, TODAY)).toEqual(
      ruleSuggestions(pool, TODAY)
    );
    expect(
      agentSuggestions(pool, [{ taskId: "x", reason: "y" }], TODAY)
    ).toEqual(ruleSuggestions(pool, TODAY));
  });
});
