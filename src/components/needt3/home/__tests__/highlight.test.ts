import { highlightMeta, highlightTask } from "../highlight";
import { TODAY, task } from "./fixtures";

describe("highlightTask", () => {
  it("finds the task by id", () => {
    const a = task();
    const b = task();
    expect(highlightTask([a, b], b.id)?.id).toBe(b.id);
  });
  it("is null with no id, no such task, or a trashed one", () => {
    const a = task();
    const gone = task({ trashedAt: "2026-09-01T10:00:00Z" });
    expect(highlightTask([a], null)).toBeNull();
    expect(highlightTask([a], undefined)).toBeNull();
    expect(highlightTask([a], "nope")).toBeNull();
    expect(highlightTask([gone], gone.id)).toBeNull();
  });
});

describe("highlightMeta", () => {
  it("says when it is due and how long it takes", () => {
    expect(highlightMeta(task({ estimatedMinutes: 45 }), TODAY)).toBe(
      "Due today · 45 min"
    );
    expect(
      highlightMeta(
        task({ dueDate: "2026-08-30", estimatedMinutes: null }),
        TODAY
      )
    ).toBe("Overdue since 30 Aug");
    expect(
      highlightMeta(
        task({ dueDate: "2026-09-05", estimatedMinutes: 90 }),
        TODAY
      )
    ).toBe("Due 5 Sep · 1 h 30");
  });
  it("is quiet when there is nothing to say, and says Done when done", () => {
    expect(
      highlightMeta(task({ dueDate: null, estimatedMinutes: null }), TODAY)
    ).toBe("");
    expect(highlightMeta(task({ done: true }), TODAY)).toBe("Done");
  });
});
